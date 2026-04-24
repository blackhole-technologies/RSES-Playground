-- Add tenant row-level security policies to api_keys
-- Migration: 0006_add_api_keys_rls_policies
-- Milestone: M1.8a (ROADMAP_2026-04-15_v7.md — first sub-milestone of the tenant-scoped registry expansion)
-- Depends on: 0001 (assumed to contain api_keys CREATE TABLE) / whichever migration created api_keys
--
-- ============================================================================
-- MANUAL APPLY ONLY — review, test, then apply. Order-sensitive.
-- ============================================================================
--
-- This migration adds four row-level security policies on `api_keys`
-- (SELECT / INSERT / UPDATE / DELETE) with strict site_id equality,
-- mirroring the Phase B shape from `0003_add_tenant_rls_policies.sql`
-- on `site_feature_overrides`. Like 0003, it uses `ENABLE ROW LEVEL
-- SECURITY`, not `FORCE` — superuser roles bypass. The FORCE flip for
-- api_keys is out of scope for this migration and would live in a
-- separate file (pattern 0007, paralleling 0004 on the existing
-- tables).
--
-- Apply procedure:
--
--   1. Confirm `api_keys` exists in the target database and matches
--      the shape declared in `shared/api-keys-schema.ts` (notably:
--      site_id varchar(64) NOT NULL).
--   2. Run `npm run test:rls` against the target database:
--        TEST_DATABASE_URL=postgres://... npm run test:rls
--      The test file has been extended with a new describe block
--      covering api_keys SELECT / INSERT / UPDATE / DELETE isolation.
--      All assertions must pass BEFORE applying this migration, and
--      all must continue to pass AFTER.
--   3. Take a DB snapshot.
--   4. Apply inside a transaction:
--        BEGIN;
--        \i migrations/0006_add_api_keys_rls_policies.sql
--        -- Smoke test: verify a non-superuser role bound to site-a
--        -- cannot read site-b's keys.
--        COMMIT;
--   5. Record the apply in the next STATUS revision.
--
-- # The validateKey problem (READ THIS BEFORE APPLYING)
--
-- The SDK auth flow arrives at the server with an opaque key and
-- NO site context. The owning site is only learned AFTER the key is
-- looked up by its hash in `api_key_service.validateKey`. This means
-- the validateKey SELECT must run without `app.current_site_id` being
-- bound. Under the strict equality SELECT policy added by this
-- migration:
--
--     SELECT USING (site_id = current_setting('app.current_site_id', true))
--
-- an unbound session variable returns the empty string, and the
-- comparison to a non-empty site_id always fails. Consequence: under
-- a non-superuser app role with 0006 applied, validateKey will return
-- zero rows for every valid API key, and the SDK will see a blanket
-- 401 Unauthorized. The auth flow breaks.
--
-- Three deployment-time options for resolving this. Pick one before
-- applying 0006 to production. Each is reversible and none is a
-- one-way door:
--
--   (a) Run validateKey's SELECT under a Postgres superuser connection.
--       Simplest to implement — add a second DB client in
--       `server/db.ts` wired to a dedicated `api_key_lookup_url` env
--       var, and route validateKey through it. The superuser role
--       bypasses `ENABLE` policies (but would NOT bypass a future
--       `FORCE ROW LEVEL SECURITY` on api_keys — if 0007 lands later,
--       this approach needs a NO FORCE exception for the superuser
--       role, or swap to option (b)).
--
--   (b) Add a fifth policy allowing the validateKey lookup when a
--       dedicated session variable is set. This is a bypass flag, but
--       it is a server-controlled flag, not a request-controlled one:
--
--         CREATE POLICY api_key_auth_lookup ON api_keys
--           FOR SELECT
--           USING (
--             current_setting('app.api_key_lookup', true) = 'true'
--             OR site_id = current_setting('app.current_site_id', true)
--           );
--
--       Then wrap validateKey's SELECT in a transaction that sets
--       `app.api_key_lookup=true` before the query (analogous to
--       `withDbSiteScope` but for the auth bypass). Only the
--       validateKey code path would ever set this variable. Under
--       FORCE RLS this continues to work — the policy itself allows
--       the lookup.
--
--       This is the recommended option for long-term use. It keeps
--       validateKey on the same DB client as the rest of the app and
--       avoids introducing a superuser connection to production.
--
--   (c) Encode the site in the API key itself (e.g. prepend a
--       site-scoped identifier to `ff_{tier}_{random}`) and accept
--       the tradeoff that validating a key is now a
--       "trust-the-claim-then-verify" flow. Rejected during M1.8a
--       because it changes the key format wire protocol and requires
--       a key-rotation migration for all existing keys. Listed for
--       completeness only.
--
-- Migration 0006 ships all FOUR strict policies and explicitly does
-- NOT ship the optional bypass policy from option (b). The user is
-- expected to pick (a), (b), or (c) at apply time and, if (b),
-- submit a follow-up migration 0007 with the bypass policy +
-- corresponding code changes to `api-key-service.validateKey`.
--
-- # What the dev-query guard does with api_keys
--
-- The guard (M1.3, shipped in STATUS v8) now blocks direct `db.*` on
-- api_keys in NODE_ENV=development. This means:
--
--   - `createKey` / `listKeys` / `revokeKey` / `getKey` /
--     `updateLastUsed` all correctly pass through `scoped()` or
--     `withDbSiteScope()` as of M1.8a — they work in dev.
--   - `validateKey` and `cleanupExpiredKeys` use raw `db` by design.
--     In dev, both will throw from the guard. For `validateKey`
--     specifically, this is a known regression: developers running
--     the SDK auth path locally in NODE_ENV=development will hit a
--     guard throw. Workarounds: run that path under NODE_ENV=test,
--     unit-test `ApiKeyService.validateKey` in isolation, or
--     temporarily disable the guard for that one call site by
--     replacing the `db.select` with a direct pg client lookup.
--
-- # Rollback
--
-- To revert this migration completely:
--
--   DROP POLICY IF EXISTS "api_keys_isolation_select" ON "api_keys";
--   DROP POLICY IF EXISTS "api_keys_isolation_insert" ON "api_keys";
--   DROP POLICY IF EXISTS "api_keys_isolation_update" ON "api_keys";
--   DROP POLICY IF EXISTS "api_keys_isolation_delete" ON "api_keys";
--   ALTER TABLE "api_keys" DISABLE ROW LEVEL SECURITY;
--
-- The RLS test file must also be reverted (remove the new api_keys
-- describe block) if the rollback is intended to bring the repo
-- fully back to its pre-M1.8a state.
-- ============================================================================

-- =============================================================================
-- api_keys — site_id is NOT NULL
-- =============================================================================
--
-- Every row belongs to exactly one site. Strict equality on the bound
-- session variable, same shape as site_feature_overrides under 0003.

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_isolation_select" ON "api_keys";
CREATE POLICY "api_keys_isolation_select" ON "api_keys"
  FOR SELECT
  USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "api_keys_isolation_insert" ON "api_keys";
CREATE POLICY "api_keys_isolation_insert" ON "api_keys"
  FOR INSERT
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "api_keys_isolation_update" ON "api_keys";
CREATE POLICY "api_keys_isolation_update" ON "api_keys"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "api_keys_isolation_delete" ON "api_keys"
  ;
CREATE POLICY "api_keys_isolation_delete" ON "api_keys"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- Verification query (for manual post-migration check)
-- =============================================================================
--
-- After applying, verify all four policies are listed:
--
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'api_keys'
--   ORDER BY policyname;
--
-- Expect 4 rows: api_keys_isolation_select / _insert / _update / _delete.
--
-- And confirm RLS is enabled (but not forced):
--
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname = 'api_keys';
--
-- Expect relrowsecurity=true, relforcerowsecurity=false.
