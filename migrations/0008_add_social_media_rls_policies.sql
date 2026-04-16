-- Add tenant row-level security policies to social_accounts, social_posts, social_campaigns
-- Migration: 0008_add_social_media_rls_policies
-- Milestone: M1.8b (ROADMAP_2026-04-15_v7.md — second sub-milestone of M1.8)
-- Depends on: whichever earlier migration created social_accounts, social_posts, social_campaigns
--
-- ============================================================================
-- MANUAL APPLY ONLY — review, test, then apply
-- ============================================================================
--
-- This migration adds the standard 4-policy set (SELECT/INSERT/UPDATE/
-- DELETE, strict site_id equality) to each of the three social_media
-- tables that carry a direct `site_id` column:
--
--   - social_accounts    (site_id text NOT NULL)
--   - social_posts       (site_id text NOT NULL)
--   - social_campaigns   (site_id text NOT NULL)
--
-- Same shape as `0003_add_tenant_rls_policies.sql` (Phase B on
-- site_feature_overrides) and `0006_add_api_keys_rls_policies.sql`
-- (M1.8a on api_keys). `ENABLE ROW LEVEL SECURITY` only — no FORCE.
-- The FORCE flip for these tables is out of scope for this migration
-- and would live in a future file paralleling `0004` / `0008a`.
--
-- # Tables NOT covered
--
-- Two other tables from `shared/social-media-schema.ts` are NOT
-- covered by this migration because they do NOT have a direct
-- `site_id` column:
--
--   - social_publish_queue  (post_id FK → social_posts, account_id FK → social_accounts)
--   - social_post_analytics (post_id FK → social_posts)
--
-- These tables inherit their tenant binding transitively via their
-- foreign keys. Options for protecting them:
--
--   (a) Add a denormalized `site_id` column via a schema migration
--       and populate it from the parent row. Pros: simple strict
--       equality policy; clean grep-auditable contract. Cons:
--       schema churn, data migration, risk of the denormalized
--       column drifting from the parent.
--
--   (b) Write a policy that uses a subquery against the parent
--       table:
--         USING (post_id IN (
--           SELECT id FROM social_posts
--         ))
--       The subquery itself is subject to RLS on social_posts, so
--       it transitively filters to the caller's site. Pros: no
--       schema change. Cons: subquery policy is expensive under
--       repeated reads; joins become non-trivial.
--
--   (c) Rely on the service-layer discipline that queue / analytics
--       access always flows through a parent-table lookup first.
--       Pros: zero migration cost. Cons: no structural defense;
--       relies on code review to catch bypasses.
--
-- M1.8b ships option (c) by default — the tables are not registered
-- and have no RLS policies, so their direct reads bypass any Layer-3
-- defense. A future sub-milestone (M1.8b-follow or M1.8c) should
-- pick (a) or (b). STATUS v11 documents this gap.
--
-- # Apply procedure
--
--   1. Confirm the three tables exist in the target database and
--      match the shapes in `shared/social-media-schema.ts`.
--   2. Run `npm run test:rls` against the target database. The test
--      file has been extended with assertions for each of the three
--      tables; all must pass before and after applying this
--      migration.
--   3. Take a DB snapshot.
--   4. Apply inside a transaction:
--        BEGIN;
--        \i migrations/0008_add_social_media_rls_policies.sql
--        -- Smoke test: a non-superuser role bound to site-a cannot
--        -- see site-b's rows in any of the three tables.
--        COMMIT;
--   5. Record the apply in the next STATUS revision.
--
-- # Interaction with the M1.3 dev-query guard (STATUS v8)
--
-- As soon as the three tables are registered in
-- `server/lib/tenant-scoped-registry.ts` (done in M1.8b), the guard
-- starts throwing in NODE_ENV=development on any raw `db.*` access
-- to them. The v11 conversion converts the per-site methods in
-- `server/services/social-media/pg-storage.ts`, but the by-id
-- methods (getById/update/delete/etc.) are marked FIXME and still
-- use raw `db`. Those methods will throw loudly when exercised in
-- development. Test / production / CI runs (NODE_ENV=test or
-- production) are unaffected because the guard is dev-only.
--
-- # Rollback
--
-- To revert this migration completely:
--
--   -- social_accounts
--   DROP POLICY IF EXISTS "social_accounts_isolation_select" ON "social_accounts";
--   DROP POLICY IF EXISTS "social_accounts_isolation_insert" ON "social_accounts";
--   DROP POLICY IF EXISTS "social_accounts_isolation_update" ON "social_accounts";
--   DROP POLICY IF EXISTS "social_accounts_isolation_delete" ON "social_accounts";
--   ALTER TABLE "social_accounts" DISABLE ROW LEVEL SECURITY;
--
--   -- social_posts (same 5 statements)
--   -- social_campaigns (same 5 statements)
--
-- ============================================================================

-- =============================================================================
-- social_accounts — site_id is NOT NULL
-- =============================================================================

ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_accounts_isolation_select" ON "social_accounts";
CREATE POLICY "social_accounts_isolation_select" ON "social_accounts"
  FOR SELECT
  USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_accounts_isolation_insert" ON "social_accounts";
CREATE POLICY "social_accounts_isolation_insert" ON "social_accounts"
  FOR INSERT
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_accounts_isolation_update" ON "social_accounts";
CREATE POLICY "social_accounts_isolation_update" ON "social_accounts"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_accounts_isolation_delete" ON "social_accounts";
CREATE POLICY "social_accounts_isolation_delete" ON "social_accounts"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- social_posts — site_id is NOT NULL
-- =============================================================================

ALTER TABLE "social_posts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_posts_isolation_select" ON "social_posts";
CREATE POLICY "social_posts_isolation_select" ON "social_posts"
  FOR SELECT
  USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_posts_isolation_insert" ON "social_posts";
CREATE POLICY "social_posts_isolation_insert" ON "social_posts"
  FOR INSERT
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_posts_isolation_update" ON "social_posts";
CREATE POLICY "social_posts_isolation_update" ON "social_posts"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_posts_isolation_delete" ON "social_posts";
CREATE POLICY "social_posts_isolation_delete" ON "social_posts"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- social_campaigns — site_id is NOT NULL
-- =============================================================================

ALTER TABLE "social_campaigns" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_campaigns_isolation_select" ON "social_campaigns";
CREATE POLICY "social_campaigns_isolation_select" ON "social_campaigns"
  FOR SELECT
  USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_campaigns_isolation_insert" ON "social_campaigns";
CREATE POLICY "social_campaigns_isolation_insert" ON "social_campaigns"
  FOR INSERT
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_campaigns_isolation_update" ON "social_campaigns";
CREATE POLICY "social_campaigns_isolation_update" ON "social_campaigns"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "social_campaigns_isolation_delete" ON "social_campaigns";
CREATE POLICY "social_campaigns_isolation_delete" ON "social_campaigns"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- Verification query
-- =============================================================================
--
-- After applying, verify 12 policies total across the three tables:
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE tablename IN ('social_accounts', 'social_posts', 'social_campaigns')
--   ORDER BY tablename, cmd;
--
-- Expect 4 rows per table = 12 rows total. And verify RLS is enabled
-- but not forced on all three:
--
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname IN ('social_accounts', 'social_posts', 'social_campaigns');
--
-- Expect relrowsecurity=true, relforcerowsecurity=false on all three.
