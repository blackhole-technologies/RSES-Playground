/**
 * @file tenant-scoped-registry.ts
 * @description Central registration of multi-tenant tables.
 * @module lib
 *
 * This file is imported once at server startup (via server/index.ts) so the
 * tenant-scoped helper has the table → site_id column mapping ready before
 * any request handler runs.
 *
 * To add a new multi-tenant table:
 *   1. Add the table here with its site id column.
 *   2. Add an integration test asserting the helper enforces the binding.
 *   3. Update docs/STATUS-LATEST.md to note the new table is enforced.
 *
 * Centralizing registration here (rather than inside each schema file) keeps
 * the security policy in one auditable location.
 */

import { siteFeatureOverrides, featureRolloutHistory } from "@shared/schema";
import { apiKeys } from "@shared/api-keys-schema";
import {
  socialAccounts,
  socialPosts,
  socialCampaigns,
} from "@shared/social-media-schema";
import { registerMultiTenantTable } from "./tenant-scoped";

/**
 * Idempotent — safe to call multiple times. Returns the count of registered
 * tables for logging/health-check purposes.
 *
 * Registration history (newest first):
 *   - 2026-04-15 (M1.8b): socialAccounts, socialPosts, socialCampaigns —
 *     site_id NOT NULL on all three. The `socialPublishQueue` and
 *     `socialPostAnalytics` tables from the same schema file do NOT have
 *     a direct site_id column and are transitively scoped via foreign
 *     keys to socialPosts / socialAccounts; they are a known M1.8b gap
 *     and will need either a schema change (denormalize site_id) or a
 *     policy that uses a subquery in a future sub-milestone.
 *   - 2026-04-15 (M1.8a): apiKeys — site_id NOT NULL; validateKey path is
 *     resolved via the `app.api_key_lookup` bypass flag and migration 0007.
 *     See `server/services/api-keys/api-key-service.ts:validateKey`.
 *   - 2026-04-15 (M1.4 Phase A/B/C): siteFeatureOverrides, featureRolloutHistory.
 */
export function registerMultiTenantTables(): number {
  registerMultiTenantTable(siteFeatureOverrides, siteFeatureOverrides.siteId);
  registerMultiTenantTable(featureRolloutHistory, featureRolloutHistory.siteId);
  registerMultiTenantTable(apiKeys, apiKeys.siteId);
  registerMultiTenantTable(socialAccounts, socialAccounts.siteId);
  registerMultiTenantTable(socialPosts, socialPosts.siteId);
  registerMultiTenantTable(socialCampaigns, socialCampaigns.siteId);
  return 6;
}
