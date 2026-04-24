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
import {
  domains,
  siteRoleAssignments,
  siteAnalytics,
} from "@shared/multisite-schema";
import {
  userRoles,
  userPermissions,
  auditLogs,
} from "@shared/rbac-schema";
import { registerMultiTenantTable } from "./tenant-scoped";

/**
 * Idempotent — safe to call multiple times. Returns the count of registered
 * tables for logging/health-check purposes.
 *
 * Registration history (newest first):
 *   - 2026-04-17 (M1.8e): transitively-scoped tables — `socialPublishQueue`
 *     and `socialPostAnalytics`. Neither has a direct site_id column; tenancy
 *     is resolved through an EXISTS subquery to social_posts via post_id. These
 *     are NOT added to `registerMultiTenantTable()` because the helper's API
 *     assumes a direct siteId column — the direct-siteId helper would throw
 *     at `siteIdColumnFor()`. Their Layer-3 protection lives entirely in
 *     migration 0011; Layer-2 service-code discipline is enforced by a
 *     combination of (a) the existing pattern in pg-storage.ts (`getTopPerforming`
 *     uses `withDbSiteScope` + explicit JOIN to social_posts), and (b) worker
 *     bypass helpers added in M1.8e-follow (not yet shipped — see the apply
 *     prerequisite banner at the top of migration 0011).
 *   - 2026-04-15 (M1.8b): socialAccounts, socialPosts, socialCampaigns —
 *     site_id NOT NULL on all three.
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
  // M1.8c — multisite-schema tables. Only the 3 straightforward
  // NOT-NULL site_id tables are registered here. Deferred:
  //   - provisioningRequests (nullable site_id, set mid-lifecycle)
  //   - syndicationLinks (dual source/target site_id columns —
  //     novel policy shape, needs separate design)
  //   - sites (site_id IS the primary key — this is the registry
  //     table itself, not a multi-tenant table)
  registerMultiTenantTable(domains, domains.siteId);
  registerMultiTenantTable(siteRoleAssignments, siteRoleAssignments.siteId);
  registerMultiTenantTable(siteAnalytics, siteAnalytics.siteId);
  // M1.8d — rbac-schema tables. All three have NULLABLE site_id
  // ("null means global"). Policy uses the 0005 disjunctive INSERT
  // form: WITH CHECK (site_id IS NULL OR site_id = session_var).
  registerMultiTenantTable(userRoles, userRoles.siteId);
  registerMultiTenantTable(userPermissions, userPermissions.siteId);
  registerMultiTenantTable(auditLogs, auditLogs.siteId);
  return 12;
}
