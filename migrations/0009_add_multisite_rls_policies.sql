-- Add tenant row-level security policies to domains, site_role_assignments, site_analytics
-- Migration: 0009_add_multisite_rls_policies
-- Milestone: M1.8c (third sub-milestone of M1.8 registry expansion)
-- Depends on: whichever migration created the multisite tables
--
-- ============================================================================
-- MANUAL APPLY ONLY
-- ============================================================================
--
-- Three tables from shared/multisite-schema.ts with direct site_id NOT NULL:
--   - domains
--   - site_role_assignments
--   - site_analytics
--
-- Same strict-equality shape as 0003/0006/0008. ENABLE only, no FORCE.
--
-- Tables NOT covered (deferred):
--   - provisioning_requests (site_id NULLABLE, set mid-lifecycle)
--   - syndication_links (dual source_site_id / target_site_id columns —
--     needs a novel OR-based policy design)
--   - sites (site_id IS the primary key — registry table, not tenant data)
--
-- Rollback:
--   DROP POLICY + DISABLE ROW LEVEL SECURITY on each table.
-- ============================================================================

-- domains
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domains_isolation_select" ON "domains";
CREATE POLICY "domains_isolation_select" ON "domains"
  FOR SELECT USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "domains_isolation_insert" ON "domains";
CREATE POLICY "domains_isolation_insert" ON "domains"
  FOR INSERT WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "domains_isolation_update" ON "domains";
CREATE POLICY "domains_isolation_update" ON "domains"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "domains_isolation_delete" ON "domains";
CREATE POLICY "domains_isolation_delete" ON "domains"
  FOR DELETE USING (site_id = current_setting('app.current_site_id', true));

-- site_role_assignments
ALTER TABLE "site_role_assignments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_assignments_isolation_select" ON "site_role_assignments";
CREATE POLICY "role_assignments_isolation_select" ON "site_role_assignments"
  FOR SELECT USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "role_assignments_isolation_insert" ON "site_role_assignments";
CREATE POLICY "role_assignments_isolation_insert" ON "site_role_assignments"
  FOR INSERT WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "role_assignments_isolation_update" ON "site_role_assignments";
CREATE POLICY "role_assignments_isolation_update" ON "site_role_assignments"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "role_assignments_isolation_delete" ON "site_role_assignments";
CREATE POLICY "role_assignments_isolation_delete" ON "site_role_assignments"
  FOR DELETE USING (site_id = current_setting('app.current_site_id', true));

-- site_analytics
ALTER TABLE "site_analytics" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_isolation_select" ON "site_analytics";
CREATE POLICY "analytics_isolation_select" ON "site_analytics"
  FOR SELECT USING (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "analytics_isolation_insert" ON "site_analytics";
CREATE POLICY "analytics_isolation_insert" ON "site_analytics"
  FOR INSERT WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "analytics_isolation_update" ON "site_analytics";
CREATE POLICY "analytics_isolation_update" ON "site_analytics"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "analytics_isolation_delete" ON "site_analytics";
CREATE POLICY "analytics_isolation_delete" ON "site_analytics"
  FOR DELETE USING (site_id = current_setting('app.current_site_id', true));
