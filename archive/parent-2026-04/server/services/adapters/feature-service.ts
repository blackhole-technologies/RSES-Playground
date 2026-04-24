/**
 * @file feature-service.ts
 * @description Feature service adapter for site context middleware
 * @module services/adapters
 * @phase Phase 1 - Foundation Realignment
 */

import type { SiteFeatures } from "../../multisite/types";
import type { FeatureService } from "../../multisite/site/site-context";
import { getFeatureFlagsService } from "../feature-flags";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("feature-service-adapter");

/**
 * Default features by tier.
 */
const tierDefaults: Record<string, Partial<SiteFeatures>> = {
  free: {
    rsesEnabled: true,
    aiEnabled: false,
    quantumEnabled: false,
    realTimeEnabled: false,
    versioningEnabled: false,
    workflowEnabled: false,
    customCodeEnabled: false,
  },
  pro: {
    rsesEnabled: true,
    aiEnabled: true,
    quantumEnabled: false,
    realTimeEnabled: true,
    versioningEnabled: true,
    workflowEnabled: true,
    customCodeEnabled: false,
  },
  enterprise: {
    rsesEnabled: true,
    aiEnabled: true,
    quantumEnabled: true,
    realTimeEnabled: true,
    versioningEnabled: true,
    workflowEnabled: true,
    customCodeEnabled: true,
  },
};

/**
 * Maps feature flag keys to SiteFeatures properties.
 */
const flagToFeatureMap: Record<string, keyof SiteFeatures> = {
  rses_enabled: "rsesEnabled",
  ai_enabled: "aiEnabled",
  quantum_enabled: "quantumEnabled",
  realtime_enabled: "realTimeEnabled",
  versioning_enabled: "versioningEnabled",
  workflow_enabled: "workflowEnabled",
  custom_code_enabled: "customCodeEnabled",
};

/**
 * Creates a FeatureService adapter that resolves features using the feature flags system.
 */
export function createFeatureServiceAdapter(): FeatureService {
  return {
    async resolveFeatures(siteId: string, tier: string): Promise<SiteFeatures> {
      // Start with tier defaults
      const defaults = tierDefaults[tier] || tierDefaults.free;
      const features: SiteFeatures = {
        rsesEnabled: defaults.rsesEnabled ?? true,
        aiEnabled: defaults.aiEnabled ?? false,
        quantumEnabled: defaults.quantumEnabled ?? false,
        realTimeEnabled: defaults.realTimeEnabled ?? false,
        versioningEnabled: defaults.versioningEnabled ?? false,
        workflowEnabled: defaults.workflowEnabled ?? false,
        customCodeEnabled: defaults.customCodeEnabled ?? false,
      };

      try {
        // Get feature flags service
        const flagService = getFeatureFlagsService();

        // Evaluate each feature flag for this site
        const context = { siteId, tier };

        for (const [flagKey, featureKey] of Object.entries(flagToFeatureMap)) {
          try {
            const result = await flagService.evaluate(flagKey, context);
            // EvaluationResult doesn't have an `evaluated` field; the
            // presence of `enabled` indicates a real evaluation.
            (features as any)[featureKey] = result.enabled;
          } catch {
            // Flag doesn't exist, use default
          }
        }

        log.debug({ siteId, tier, features }, "Resolved features");
        return features;
      } catch (error) {
        log.warn({ error, siteId, tier }, "Failed to resolve features, using defaults");
        return features;
      }
    },
  };
}

/**
 * Gets the default features for a tier.
 */
export function getDefaultFeaturesForTier(tier: string): SiteFeatures {
  const defaults = tierDefaults[tier] || tierDefaults.free;
  return {
    rsesEnabled: defaults.rsesEnabled ?? true,
    aiEnabled: defaults.aiEnabled ?? false,
    quantumEnabled: defaults.quantumEnabled ?? false,
    realTimeEnabled: defaults.realTimeEnabled ?? false,
    versioningEnabled: defaults.versioningEnabled ?? false,
    workflowEnabled: defaults.workflowEnabled ?? false,
    customCodeEnabled: defaults.customCodeEnabled ?? false,
  };
}

export { tierDefaults, flagToFeatureMap };
