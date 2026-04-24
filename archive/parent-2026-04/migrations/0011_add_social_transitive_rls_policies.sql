-- Add tenant row-level security policies to social_publish_queue, social_post_analytics
-- Migration: 0011_add_social_transitive_rls_policies
-- Milestone: M1.8e (fifth sub-milestone of M1.8 registry expansion — transitive scoping)
-- Depends on: 0008 (social_accounts/posts/campaigns RLS — provides the parent policies
--             this migration's subqueries implicitly inherit through PostgreSQL's RLS
--             evaluation semantics).
--
-- ============================================================================
-- APPLY PREREQUISITE — READ BEFORE APPLYING
-- ============================================================================
--
-- This migration is APPLY-SAFE ONLY AFTER the publishing-queue worker and
-- the analytics collector are refactored to thread siteId / set the worker
-- bypass session variables they need.
--
-- Current state (2026-04-17): the worker in server/services/social-media/
-- publishing-queue.ts:210 (processQueue) and its underlying pg-storage
-- methods (getNextBatch, getPending, getFailedForRetry, markCompleted,
-- markFailed, delete, etc.) currently run with no site session variable
-- set. Applying this migration without the worker wiring would cause:
--
--   - getNextBatch / getPending / getFailedForRetry to return zero rows
--     (strict subquery fails with no session var; bypass policy's var
--     has not been set either).
--   - markCompleted / markFailed (which internally call update()) to
--     fail the UPDATE subquery check and rollback the status change.
--   - create() (the app-path enqueue) to fail INSERT WITH CHECK unless
--     the caller has already entered withDbSiteScope.
--
-- Proper apply sequence (tracked as M1.8e-follow):
--
--   1. Add `withPublishQueueWorkerScope(fn)` helper that wraps its
--      argument in a transaction with `set_config('app.publish_queue_worker',
--      'true', true)`. Mirrors `withApiKeyLookupScope` in api-key-service.ts.
--   2. Refactor publishing-queue.ts worker read paths to use the helper.
--   3. Refactor publishing-queue.ts worker write paths (markCompleted,
--      markFailed, delete) to enter withDbSiteScope keyed on the job's
--      post.site_id before the write.
--   4. Refactor enqueue() to enter withDbSiteScope(post.siteId) before
--      calling queueStorage.create().
--   5. Same four-step pattern for analytics: helper, collector reads,
--      collector writes, app-path writes.
--   6. Apply migration 0011.
--
-- ============================================================================
-- POLICY MODEL
-- ============================================================================
--
-- Both tables scope via a post_id foreign key to social_posts, whose
-- site_id is the tenant key. No direct site_id column exists on either
-- table. The policies use an EXISTS subquery to resolve the tenant.
--
-- SHAPE (both tables):
--
--   SELECT  — strict subquery OR worker bypass (SELECT-only)
--   INSERT  — strict subquery only (no worker bypass — writes must
--             be explicit about the site they target)
--   UPDATE  — strict subquery only
--   DELETE  — strict subquery only
--
-- The worker bypass is intentionally SELECT-only, mirroring the
-- validateKey option-(b) pattern from migration 0007. Rationale:
--
--   1. Contained surface area. Bypass flag is set via literal
--      'true' in a helper function inside the service module.
--      grep auditable.
--   2. Transaction-local. set_config('app.foo', 'true', true)
--      with is_local=true auto-clears on COMMIT/ROLLBACK.
--   3. Cannot smuggle writes. INSERT/UPDATE/DELETE policies do
--      not consult the bypass flag, so setting it does not widen
--      write scope beyond strict subquery.
--
-- The INSERT/UPDATE/DELETE strict policy depends on the parent
-- social_posts being visible under the session's current_site_id.
-- Because social_posts itself has RLS from migration 0008, the
-- subquery returns zero rows when the app session is bound to a
-- different site. This means cross-tenant writes are rejected
-- whether the policy is evaluated standalone or against a JOIN.
--
-- ============================================================================
-- APPLY ORDER CONTEXT (as of this migration)
-- ============================================================================
--
-- The full chain from v11 becomes:
--   0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 → 0004
--
-- 0011 slots in after 0008 (its policy subqueries require 0008's
-- social_posts policies to be live) and before 0004 (which only
-- affects feature-flag tables, independent of social-media).
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- For each table:
--   DROP POLICY IF EXISTS <name> ON <table>;
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
--
-- ============================================================================

-- =============================================================================
-- social_publish_queue — transitive via post_id → social_posts.site_id
-- =============================================================================

ALTER TABLE "social_publish_queue" ENABLE ROW LEVEL SECURITY;

-- SELECT: strict subquery (app path), OR worker bypass (SELECT-only)
DROP POLICY IF EXISTS "publish_queue_isolation_select" ON "social_publish_queue";
CREATE POLICY "publish_queue_isolation_select" ON "social_publish_queue"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_publish_queue.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

-- Additive PERMISSIVE SELECT policy for the background worker.
-- OR-combines with the strict policy per PostgreSQL PERMISSIVE semantics.
-- Keyed on a dedicated session var so the bypass is grep-auditable.
DROP POLICY IF EXISTS "publish_queue_worker_bypass" ON "social_publish_queue";
CREATE POLICY "publish_queue_worker_bypass" ON "social_publish_queue"
  FOR SELECT
  USING (current_setting('app.publish_queue_worker', true) = 'true');

-- INSERT: strict subquery only. Caller MUST have a site session bound.
DROP POLICY IF EXISTS "publish_queue_isolation_insert" ON "social_publish_queue";
CREATE POLICY "publish_queue_isolation_insert" ON "social_publish_queue"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_publish_queue.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

-- UPDATE: strict subquery only. Worker writes must be per-site scoped.
DROP POLICY IF EXISTS "publish_queue_isolation_update" ON "social_publish_queue";
CREATE POLICY "publish_queue_isolation_update" ON "social_publish_queue"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_publish_queue.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_publish_queue.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

-- DELETE: strict subquery only.
DROP POLICY IF EXISTS "publish_queue_isolation_delete" ON "social_publish_queue";
CREATE POLICY "publish_queue_isolation_delete" ON "social_publish_queue"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_publish_queue.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

-- =============================================================================
-- social_post_analytics — transitive via post_id → social_posts.site_id
-- =============================================================================

ALTER TABLE "social_post_analytics" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_analytics_isolation_select" ON "social_post_analytics";
CREATE POLICY "post_analytics_isolation_select" ON "social_post_analytics"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_analytics.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

-- Analytics collector bypass — separate session var from the publish
-- queue worker so the bypass scope is tightly bounded and the two
-- subsystems can be refactored independently.
DROP POLICY IF EXISTS "post_analytics_collector_bypass" ON "social_post_analytics";
CREATE POLICY "post_analytics_collector_bypass" ON "social_post_analytics"
  FOR SELECT
  USING (current_setting('app.analytics_collector', true) = 'true');

DROP POLICY IF EXISTS "post_analytics_isolation_insert" ON "social_post_analytics";
CREATE POLICY "post_analytics_isolation_insert" ON "social_post_analytics"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_analytics.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

DROP POLICY IF EXISTS "post_analytics_isolation_update" ON "social_post_analytics";
CREATE POLICY "post_analytics_isolation_update" ON "social_post_analytics"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_analytics.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_analytics.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );

DROP POLICY IF EXISTS "post_analytics_isolation_delete" ON "social_post_analytics";
CREATE POLICY "post_analytics_isolation_delete" ON "social_post_analytics"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM social_posts sp
      WHERE sp.id = social_post_analytics.post_id
        AND sp.site_id = current_setting('app.current_site_id', true)
    )
  );
