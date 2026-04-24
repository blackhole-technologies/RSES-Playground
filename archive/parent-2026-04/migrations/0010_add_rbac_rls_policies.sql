-- Add tenant row-level security policies to user_roles, user_permissions, audit_logs
-- Migration: 0010_add_rbac_rls_policies
-- Milestone: M1.8d (fourth sub-milestone of M1.8 registry expansion)
-- Depends on: whichever migration created the RBAC tables
--
-- ============================================================================
-- MANUAL APPLY ONLY
-- ============================================================================
--
-- Three tables from shared/rbac-schema.ts with NULLABLE site_id
-- ("null means global"). Policy shape follows the 0005 precedent:
--
--   SELECT  — USING (site_id IS NULL OR site_id = session_var)
--             Tenants see global entries AND their own site's entries.
--   INSERT  — WITH CHECK (site_id IS NULL OR site_id = session_var)
--             Matches SELECT. Global inserts are allowed (admin actions
--             like "grant user-X the admin role globally"). Layer 1
--             (route auth + RBAC markers) gates who can reach these
--             write paths at all. See migration 0005 for the full
--             rationale on allowing NULL inserts.
--   UPDATE  — USING + WITH CHECK on strict equality (non-null only).
--             Tenants cannot modify global entries.
--   DELETE  — USING strict equality (non-null only).
--             Tenants cannot delete global entries.
--             audit_logs has NO delete policy — it is append-only by
--             design; the RBAC marker on the audit route enforces this.
--
-- Rollback:
--   DROP POLICY + DISABLE ROW LEVEL SECURITY on each table.
-- ============================================================================

-- =============================================================================
-- user_roles — site_id NULLABLE ("null means global")
-- =============================================================================

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_isolation_select" ON "user_roles";
CREATE POLICY "user_roles_isolation_select" ON "user_roles"
  FOR SELECT
  USING (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

DROP POLICY IF EXISTS "user_roles_isolation_insert" ON "user_roles";
CREATE POLICY "user_roles_isolation_insert" ON "user_roles"
  FOR INSERT
  WITH CHECK (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

DROP POLICY IF EXISTS "user_roles_isolation_update" ON "user_roles";
CREATE POLICY "user_roles_isolation_update" ON "user_roles"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "user_roles_isolation_delete" ON "user_roles";
CREATE POLICY "user_roles_isolation_delete" ON "user_roles"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- user_permissions — site_id NULLABLE ("null means global")
-- =============================================================================

ALTER TABLE "user_permissions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_permissions_isolation_select" ON "user_permissions";
CREATE POLICY "user_permissions_isolation_select" ON "user_permissions"
  FOR SELECT
  USING (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

DROP POLICY IF EXISTS "user_permissions_isolation_insert" ON "user_permissions";
CREATE POLICY "user_permissions_isolation_insert" ON "user_permissions"
  FOR INSERT
  WITH CHECK (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

DROP POLICY IF EXISTS "user_permissions_isolation_update" ON "user_permissions";
CREATE POLICY "user_permissions_isolation_update" ON "user_permissions"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));

DROP POLICY IF EXISTS "user_permissions_isolation_delete" ON "user_permissions";
CREATE POLICY "user_permissions_isolation_delete" ON "user_permissions"
  FOR DELETE
  USING (site_id = current_setting('app.current_site_id', true));

-- =============================================================================
-- audit_logs — site_id NULLABLE, append-only by design
-- =============================================================================
--
-- No DELETE policy: audit logs are immutable. The application enforces
-- this via RBAC markers on the audit route (no delete handler exists).
-- If a future need arises for audit log purging, it should run as a
-- superuser maintenance job, not through the app role.

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_isolation_select" ON "audit_logs";
CREATE POLICY "audit_logs_isolation_select" ON "audit_logs"
  FOR SELECT
  USING (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

DROP POLICY IF EXISTS "audit_logs_isolation_insert" ON "audit_logs";
CREATE POLICY "audit_logs_isolation_insert" ON "audit_logs"
  FOR INSERT
  WITH CHECK (
    site_id IS NULL
    OR site_id = current_setting('app.current_site_id', true)
  );

-- UPDATE on audit_logs: restricted to strict equality. Tenants cannot
-- modify global audit entries. In practice, audit log updates should
-- be extremely rare (the table is append-only by design), but the
-- policy exists for defense in depth.
DROP POLICY IF EXISTS "audit_logs_isolation_update" ON "audit_logs";
CREATE POLICY "audit_logs_isolation_update" ON "audit_logs"
  FOR UPDATE
  USING (site_id = current_setting('app.current_site_id', true))
  WITH CHECK (site_id = current_setting('app.current_site_id', true));
