/**
 * @file index.ts
 * @description AI Modules Index - Plug-and-Play AI Module System
 * @phase Phase 11 - Modular AI Architecture
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This file exports all AI modules and provides usage examples.
 *
 * USAGE EXAMPLE:
 * ==============
 *
 * ```typescript
 * import {
 *   initAIModuleOrchestrator,
 *   createClassificationModule,
 *   CLASSIFICATION_MODULE_MANIFEST,
 * } from "./services/ai-modules";
 *
 * // Initialize the orchestrator (CMS works fine without this!)
 * const orchestrator = await initAIModuleOrchestrator("basic", {
 *   globalMonthlyBudget: 5000, // $50/month
 * });
 *
 * // Register the classification module
 * const classificationModule = createClassificationModule();
 * await orchestrator.registerModule(
 *   CLASSIFICATION_MODULE_MANIFEST,
 *   classificationModule
 * );
 *
 * // Enable the module
 * await orchestrator.enableModule("ai-classification", {
 *   provider: "openai",
 *   model: "gpt-4o-mini",
 * });
 *
 * // Use the module
 * const result = await orchestrator.execute({
 *   requestId: "req-123",
 *   operation: "classify",
 *   input: {
 *     content: "This is an article about AI and machine learning...",
 *     title: "Introduction to AI",
 *   },
 * });
 * ```
 *
 * TIER SYSTEM:
 * ============
 *
 * Tier 0 (none):     CMS fully functional, no AI features
 * Tier 1 (basic):    Classification, tagging, suggestions
 * Tier 2 (advanced): + Assistant, generation, translation
 * Tier 3 (enterprise): + Custom models, training, embeddings
 *
 * COST CONTROL:
 * =============
 *
 * - Global monthly budget
 * - Per-module budgets
 * - Per-user budgets
 * - Alert thresholds (50%, 75%, 90%, 100%)
 * - Actions: block, warn, throttle
 *
 * FALLBACK BEHAVIOR:
 * ==================
 *
 * When AI is unavailable:
 * - skip: Skip the operation
 * - manual: Require manual input
 * - default_value: Use a default
 * - cached: Use cached result
 * - rule_based: Fall back to rules
 * - queue: Queue for later
 * - custom: Custom handler
 */

// =============================================================================
// CORE SYSTEM EXPORTS
// =============================================================================

export {
  // Registry
  AIModuleRegistryImpl,
  // Cost Control
  AICostControlServiceImpl,
  // Fallback Manager
  AIFallbackManager,
  // Orchestrator
  AIModuleOrchestrator,
  // Factory functions
  createDefaultCostControlConfig,
  createDefaultFallbackConfig,
  createAIModuleOrchestrator,
  // Singleton functions
  getAIModuleOrchestrator,
  initAIModuleOrchestrator,
  shutdownAIModuleOrchestrator,
} from "../ai-module-system";

// =============================================================================
// MODULE EXPORTS
// =============================================================================

export {
  ClassificationModule,
  createClassificationModule,
  CLASSIFICATION_MODULE_MANIFEST,
  type ClassificationModuleConfig,
  type ClassificationInput,
  type ClassificationResult,
} from "./classification-module";

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Tiers
  AIModuleTier,
  AIFeatureFlag,
  AITierConfig,
  // Providers
  AIProviderType,
  AIDeploymentType,
  AIProviderConfig,
  AIProviderCapability,
  AIModelDefinition,
  AIProviderRateLimits,
  AIProviderCosts,
  AIRetryConfig,
  // Modules
  AIModuleState,
  AIModuleManifest,
  AIModuleDependency,
  AIModuleCapability,
  AIModuleHooks,
  AIModuleAdminUI,
  AIModuleCostEstimate,
  AIModuleInstance,
  AIModuleUsage,
  AIModuleRegistry,
  AIModuleInterface,
  AIModuleRequest,
  AIModuleResponse,
  AIModuleHealthStatus,
  AIModuleStatistics,
  AIConfigValidationResult,
  // Cost Control
  AICostControlConfig,
  AIModuleBudget,
  AIUserBudget,
  AIThrottleConfig,
  AICostEntry,
  AICostCheckResult,
  AIUserUsage,
  AIGlobalUsage,
  AICostBreakdown,
  // Fallback
  AIFallbackConfig,
  AIFallbackBehavior,
  AIFallbackType,
  AIFallbackNotification,
  // Assistant
  AIAssistantModuleConfig,
  AIAssistantCapability,
  AIAssistantContextConfig,
  AIAssistantResponseConfig,
  AIAssistantSafetyConfig,
  // ML Taxonomy
  MLTaxonomyModuleConfig,
  MLTaxonomyStrategy,
  MLEmbeddingConfig,
  MLAutoLearningConfig,
  MLClusterDiscoveryConfig,
  // Deployment
  AIDeploymentPreference,
  AILocalPolicy,
  AICloudPolicy,
} from "@shared/cms/ai-module-types";

// Re-export constants
export { AI_TIER_CONFIGS, AI_ASSISTANT_CAPABILITIES } from "@shared/cms/ai-module-types";

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

import type { AIModuleTier, AICostControlConfig, AIFallbackConfig } from "@shared/cms/ai-module-types";
import { initAIModuleOrchestrator, AIModuleOrchestrator } from "../ai-module-system";
import { createClassificationModule, CLASSIFICATION_MODULE_MANIFEST } from "./classification-module";

/**
 * Initializes the AI system with common modules pre-registered.
 * This is a convenience function for quick setup.
 *
 * @param tier - The AI tier to use (default: "none")
 * @param options - Optional configuration
 * @returns The initialized orchestrator
 *
 * @example
 * ```typescript
 * // Quick setup with basic tier
 * const ai = await setupAISystem("basic");
 *
 * // Enable classification
 * await ai.enableModule("ai-classification");
 *
 * // Classify content
 * const result = await ai.execute({
 *   requestId: "1",
 *   operation: "classify",
 *   input: { content: "..." },
 * });
 * ```
 */
export async function setupAISystem(
  tier: AIModuleTier = "none",
  options?: {
    costControl?: Partial<AICostControlConfig>;
    fallback?: Partial<AIFallbackConfig>;
    autoEnableModules?: boolean;
  }
): Promise<AIModuleOrchestrator> {
  const orchestrator = await initAIModuleOrchestrator(
    tier,
    options?.costControl,
    options?.fallback
  );

  // Register built-in modules
  const classificationModule = createClassificationModule();
  await orchestrator.registerModule(CLASSIFICATION_MODULE_MANIFEST, classificationModule);

  // Auto-enable modules if requested and tier allows
  if (options?.autoEnableModules && tier !== "none") {
    try {
      await orchestrator.enableModule("ai-classification");
    } catch (error) {
      // Module may not be available at this tier - that's okay
    }
  }

  return orchestrator;
}

/**
 * Checks if AI features are available at the current tier.
 *
 * @param feature - The feature to check
 * @returns Whether the feature is available
 *
 * @example
 * ```typescript
 * if (isAIFeatureAvailable("classification")) {
 *   // Use AI classification
 * } else {
 *   // Fall back to manual classification
 * }
 * ```
 */
export function isAIFeatureAvailable(feature: string): boolean {
  const orchestrator = require("../ai-module-system").getAIModuleOrchestrator();
  if (!orchestrator) return false;
  return orchestrator.getRegistry().isFeatureAvailable(feature as any);
}

/**
 * Gets the current AI tier.
 *
 * @returns The current tier or "none" if AI is not initialized
 *
 * @example
 * ```typescript
 * const tier = getCurrentAITier();
 * console.log(`AI features at ${tier} level`);
 * ```
 */
export function getCurrentAITier(): AIModuleTier {
  const orchestrator = require("../ai-module-system").getAIModuleOrchestrator();
  if (!orchestrator) return "none";
  return orchestrator.getRegistry().getTier();
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * # AI Module System Architecture
 *
 * ## Overview
 *
 * The AI Module System provides a plug-and-play architecture for AI features
 * that ensures the CMS is fully functional without any AI dependencies.
 *
 * ## Key Principles
 *
 * 1. **CMS First**: The CMS works perfectly without AI. AI enhances, never requires.
 *
 * 2. **Tiered Architecture**: Four tiers from none to enterprise, each with
 *    specific features and cost caps.
 *
 * 3. **Provider Abstraction**: Swap between OpenAI, Claude, local Ollama, or
 *    custom providers without changing code.
 *
 * 4. **Cost Control**: Built-in budget management with alerts and throttling.
 *
 * 5. **Graceful Degradation**: When AI fails, the system falls back to manual
 *    input, cached values, or rule-based logic.
 *
 * ## Module Lifecycle
 *
 * ```
 * uninstalled → disabled → enabled → (degraded) → error
 *                  ↑_______________↓
 * ```
 *
 * ## Creating a Custom Module
 *
 * 1. Implement `AIModuleInterface`
 * 2. Define a `AIModuleManifest`
 * 3. Register with the orchestrator
 * 4. Handle health checks and fallbacks
 *
 * ## Example: Custom Translation Module
 *
 * ```typescript
 * const translationManifest: AIModuleManifest = {
 *   id: "my-translation",
 *   name: "My Translation Module",
 *   version: "1.0.0",
 *   requiredTier: "advanced",
 *   requiredFeatures: ["translation"],
 *   provides: [{ type: "translation", name: "Translation", description: "..." }],
 *   // ... more config
 * };
 *
 * class MyTranslationModule implements AIModuleInterface {
 *   manifest = translationManifest;
 *
 *   async initialize(config) { ... }
 *   async shutdown() { ... }
 *   async healthCheck() { ... }
 *   async process(request) { ... }
 *   getStatistics() { ... }
 *   async validateConfig(config) { ... }
 * }
 * ```
 */
