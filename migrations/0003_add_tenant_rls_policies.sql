-- Add tenant row-level security policies
-- Migration: 0003_add_tenant_rls_policies
-- Milestone: M1.4 Phase B (ROADMAP_2026-04-14_v5.md)
-- Depends on: 0001_add_feature_flags_tables (provides site_feature_overrides, feature_rollout_history)
--
-- # What this migration does
--
-- Adds Postgres row-level security policies on the two multi-tenant
-- tables currently registered in server/lib/tenant-scoped-registry.ts.
-- Every SELECT/INSERT/UPDATE/DELETE executed by a non-superuser role is
-- filtered by the session variable `app.current_site_id` set via
-- `set_config('app.current_site_id', <site>, true)` in a transaction.
--
-- The application already sets this variable per-query via the
-- `withDbSiteScope` helper added in Phase A (see
-- `server/lib/tenant-scoped.ts`). If that helper is not used and a
-- direct `db.select()` call hits one of these tables, the policy
-- returns zero rows (because the empty-string default cannot match
-- any real `site_id`), and inserts fail outright.
--
-- # What this migration does NOT do
--
-- This migration uses `ENABLE ROW LEVEL SECURITY`, not `FORCE ROW
-- LEVEL SECURITY`. The distinction matters:
--
--   ENABLE — policies apply to non-superuser roles (the app's DB user
--            in production). Superusers and table owners bypass the
--            policies entirely. This is reversible: dropping the
--            policies restores pre-migration behavior.
--
--   FORCE  — policies apply to *every* role, including superusers and
--            the table owner. This is a one-way door without a
--            rollback migration.
--
-- The FORCE flip happens in a separate migration (0004) that is
-- staged but not applied until Phase C integration tests have been
-- run against staging. See docs/STATUS-LATEST.md for the procedure.
--
-- # Fail-closed semantics
--
-- `current_setting('app.current_site_id', true)` returns the empty
-- string when the setting has not been set (the `true` second argument
-- means "missing_ok"). Comparing `site_id = ''` matches no real rows
-- because every registered row has a non-empty string site_id. That
-- is the fail-closed property: a forgotten set_config call yields
-- zero rows instead of leaking every tenant's data.
--
-- # Rollback
--
-- To revert this migration:
--   DROP POLICY IF EXISTS site_isolation_select ON site_feature_overrides;
--   DROP POLICY IF EXISTS site_isolation_insert ON site_feature_overrides;
--   DROP POLICY IF EXISTS site_isolation_update ON site_feature_overrides;
--   DROP POLICY IF EXISTS site_isolation_delete ON site_feature_overrides;
--   ALTER TABLE site_feature_overrides DISABLE ROW LEVEL SECURITY;
--   -- and repeat for feature_rollout_history
--
-- No data is moved, dropped, or re-shaped. This is a pure policy
-- addition — existing rows are unaffected, and the app continues to
-- function identically as long as `withDbSiteScope` is on the path.

-- =============================================================================
-- site_feature_overrides — site_id is NOT NULL
-- =============================================================================
--
-- Every row belongs to exactly one site, so policies are strict
-- equality on the bound session variable.

ALTER TABLE "site_feature_overrides" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_isolation_select" ON "site_feature_overrides";
CREATE POLICY "site_isolation_select" ON "site_feature_overrides"
  FOR SELECT
  USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "site_isolation_insert" ON "site_feature_overrides";
CREATE POLICY "site_isolation_insert" ON "site_feature_overrides"
  FOR INSERT
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "site_isolation_update" ON "site_feature_overrides";
CREATE POLICY "site_isolation_update" ON "site_feature_overrides"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "site_isolation_delete" ON "site_feature_overrides";
CREATE POLICY "site_isolation_delete" ON "site_feature_overrides"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- feature_rollout_history — site_id is NULLABLE
-- =============================================================================
--
-- Some rows are global (system-wide flag changes) and have NULL
-- site_id. Tenants should be able to *read* those global rows because
-- they are effectively public history. But a tenant must not be able
-- to *insert* a NULL row, because that would let a malicious caller
-- forge global-scoped records to hide cross-tenant activity.
--
-- Policy strategy:
--   SELECT — USING (site_id IS NULL OR site_id = ...)
--     Read global rows OR rows for the bound site.
--   INSERT — WITH CHECK (site_id = ...)
--     New rows MUST belong to the bound site. NULL site_id inserts
--     are rejected at the policy layer. Admin tools that legitimately
--     need to write global rows bypass the helper entirely and run
--     as a superuser with FORCE off.
--   UPDATE — USING + WITH CHECK on the bound site only.
--     A tenant cannot update global rows or move rows between sites.
--   DELETE — USING (site_id = ...).
--     A tenant cannot delete global rows.

ALTER TABLE "feature_rollout_history" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_isolation_select" ON "feature_rollout_history";
CREATE POLICY "site_isolation_select" ON "feature_rollout_history"
  FOR SELECT
  USING (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

DROP POLICY IF EXISTS "site_isolation_insert" ON "feature_rollout_history";
CREATE POLICY "site_isolation_insert" ON "feature_rollout_history"
  FOR INSERT
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "site_isolation_update" ON "feature_rollout_history";
CREATE POLICY "site_isolation_update" ON "feature_rollout_history"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "site_isolation_delete" ON "feature_rollout_history";
CREATE POLICY "site_isolation_delete" ON "feature_rollout_history"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- Verification query (for manual post-migration check)
-- =============================================================================
--
-- After applying, verify policies are listed:
--
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('site_feature_overrides', 'feature_rollout_history')
--   ORDER BY tablename, policyname;
--
-- Expect 4 policies on site_feature_overrides and 4 on
-- feature_rollout_history (SELECT/INSERT/UPDATE/DELETE on each).
