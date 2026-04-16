/**
 * @file ai-module-system.ts
 * @description Modular AI System Implementation - Plug-and-Play Architecture
 * @phase Phase 11 - Modular AI Architecture
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This module implements the plug-and-play AI architecture where:
 * - CMS is fully functional without any AI
 * - AI features enhance but are never required
 * - Admin can cap AI costs per module
 * - Third-party AI modules can be added
 *
 * ARCHITECTURE:
 * =============
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                         CMS Core                                 │
 * │  (Fully functional without AI)                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    AI Module System                              │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
 * │  │  Registry   │  │Cost Control │  │  Fallback   │             │
 * │  └─────────────┘  └─────────────┘  └─────────────┘             │
 * └─────────────────────────────────────────────────────────────────┘
 *                                │
 *         ┌──────────────────────┼──────────────────────┐
 *         ▼                      ▼                      ▼
 * ┌───────────────┐     ┌───────────────┐      ┌───────────────┐
 * │ Classification│     │   Assistant   │      │  ML Taxonomy  │
 * │    Module     │     │    Module     │      │    Module     │
 * └───────────────┘     └───────────────┘      └───────────────┘
 *         │                      │                      │
 *         └──────────────────────┼──────────────────────┘
 *                                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Provider Abstraction                          │
 * │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐   │
 * │  │ OpenAI │  │ Claude │  │ Ollama │  │ Custom │  │  None  │   │
 * │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘   │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../logger";
// AI_TIER_CONFIGS is a runtime const; the rest are pure types.
import { AI_TIER_CONFIGS } from "@shared/cms/ai-module-types";
import type {
  AIModuleTier,
  AIFeatureFlag,
  AITierConfig,
  AIProviderConfig,
  AIProviderType,
  AIModuleManifest,
  AIModuleInstance,
  AIModuleState,
  AIModuleRegistry,
  AIModuleUsage,
  AICostControlConfig,
  AIModuleBudget,
  AICostEntry,
  AICostCheckResult,
  AIGlobalUsage,
  AICostBreakdown,
  AIFallbackConfig,
  AIFallbackBehavior,
  AIFallbackNotification,
  AIModuleInterface,
  AIModuleRequest,
  AIModuleResponse,
  AIModuleHealthStatus,
} from "@shared/cms/ai-module-types";

const log = createModuleLogger("ai-module-system");

// =============================================================================
// AI MODULE REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * AI Module Registry - manages all AI modules in the system.
 * Implements plug-and-play module management.
 */
export class AIModuleRegistryImpl extends EventEmitter implements AIModuleRegistry {
  private modules: Map<string, AIModuleInstance> = new Map();
  private providers: Map<string, AIProviderConfig> = new Map();
  private currentTier: AIModuleTier = "none";
  private tierConfig: AITierConfig;

  constructor(tier: AIModuleTier = "none") {
    super();
    this.currentTier = tier;
    this.tierConfig = AI_TIER_CONFIGS[tier];
    log.info({ tier }, "AI Module Registry initialized");
  }

  /**
   * Sets the AI tier. This controls what features are available.
   */
  setTier(tier: AIModuleTier): void {
    const oldTier = this.currentTier;
    this.currentTier = tier;
    this.tierConfig = AI_TIER_CONFIGS[tier];

    log.info({ oldTier, newTier: tier }, "AI tier changed");
    this.emit("tier:changed", { oldTier, newTier: tier });

    // Disable modules that exceed the new tier
    for (const [moduleId, instance] of this.modules) {
      if (instance.state === "enabled") {
        const requiredTier = instance.manifest.requiredTier;
        if (!this.isTierSufficient(requiredTier)) {
          this.disable(moduleId);
          log.warn({ moduleId, requiredTier, currentTier: tier }, "Module disabled due to tier change");
        }
      }
    }
  }

  /**
   * Gets the current AI tier.
   */
  getTier(): AIModuleTier {
    return this.currentTier;
  }

  /**
   * Gets the tier configuration.
   */
  getTierConfig(): AITierConfig {
    return this.tierConfig;
  }

  /**
   * Checks if the current tier is sufficient for a required tier.
   */
  private isTierSufficient(requiredTier: AIModuleTier): boolean {
    const tierOrder: AIModuleTier[] = ["none", "basic", "advanced", "enterprise"];
    const currentIndex = tierOrder.indexOf(this.currentTier);
    const requiredIndex = tierOrder.indexOf(requiredTier);
    return currentIndex >= requiredIndex;
  }

  /**
   * Registers a new AI module.
   */
  async register(manifest: AIModuleManifest): Promise<void> {
    // Check if module already exists
    if (this.modules.has(manifest.id)) {
      throw new Error(`Module ${manifest.id} is already registered`);
    }

    // Validate manifest
    this.validateManifest(manifest);

    // Check dependencies
    await this.checkDependencies(manifest);

    // Create module instance
    const instance: AIModuleInstance = {
      manifest,
      state: "disabled",
      config: manifest.defaultConfig || {},
      installedAt: new Date(),
    };

    this.modules.set(manifest.id, instance);

    log.info({ moduleId: manifest.id, version: manifest.version }, "AI module registered");
    this.emit("module:registered", instance);
  }

  /**
   * Validates a module manifest.
   */
  private validateManifest(manifest: AIModuleManifest): void {
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error("Invalid manifest: missing required fields");
    }

    if (manifest.requiredFeatures.length > 0) {
      for (const feature of manifest.requiredFeatures) {
        if (!this.isValidFeatureFlag(feature)) {
          throw new Error(`Invalid feature flag: ${feature}`);
        }
      }
    }
  }

  /**
   * Checks if a feature flag is valid.
   */
  private isValidFeatureFlag(feature: string): feature is AIFeatureFlag {
    const validFeatures: AIFeatureFlag[] = [
      "classification", "tagging", "taxonomy_suggestion", "duplicate_detection",
      "text_generation", "summarization", "translation", "sentiment_analysis",
      "assistant", "image_captioning", "seo_optimization",
      "custom_models", "model_training", "embeddings", "semantic_search",
      "image_generation", "workflow_automation", "predictive_fields", "cross_modal",
    ];
    return validFeatures.includes(feature as AIFeatureFlag);
  }

  /**
   * Checks module dependencies.
   */
  private async checkDependencies(manifest: AIModuleManifest): Promise<void> {
    if (!manifest.dependencies) return;

    for (const dep of manifest.dependencies) {
      const depModule = this.modules.get(dep.moduleId);

      if (!depModule && !dep.optional) {
        throw new Error(`Required dependency not found: ${dep.moduleId}`);
      }

      if (depModule && !this.semverSatisfies(depModule.manifest.version, dep.versionRange)) {
        throw new Error(`Dependency version mismatch: ${dep.moduleId} requires ${dep.versionRange}`);
      }
    }
  }

  /**
   * Simple semver satisfaction check.
   */
  private semverSatisfies(version: string, range: string): boolean {
    // Simplified check - in production, use a proper semver library
    if (range.startsWith("^")) {
      const [major] = version.split(".");
      const [rangeMajor] = range.slice(1).split(".");
      return major === rangeMajor;
    }
    return version === range;
  }

  /**
   * Unregisters a module.
   */
  async unregister(moduleId: string): Promise<void> {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw new Error(`Module ${moduleId} not found`);
    }

    // Disable first if enabled
    if (instance.state === "enabled") {
      await this.disable(moduleId);
    }

    // Check if other modules depend on this one
    for (const [otherId, other] of this.modules) {
      if (other.manifest.dependencies?.some(d => d.moduleId === moduleId && !d.optional)) {
        throw new Error(`Cannot unregister: module ${otherId} depends on ${moduleId}`);
      }
    }

    this.modules.delete(moduleId);

    log.info({ moduleId }, "AI module unregistered");
    this.emit("module:unregistered", moduleId);
  }

  /**
   * Gets a module by ID.
   */
  get(moduleId: string): AIModuleInstance | null {
    return this.modules.get(moduleId) || null;
  }

  /**
   * Gets all registered modules.
   */
  getAll(): AIModuleInstance[] {
    return Array.from(this.modules.values());
  }

  /**
   * Gets modules by capability.
   */
  getByCapability(capability: AIFeatureFlag): AIModuleInstance[] {
    return Array.from(this.modules.values()).filter(
      instance => instance.manifest.provides.some(p => p.type === capability)
    );
  }

  /**
   * Enables a module.
   */
  async enable(moduleId: string, config?: Record<string, unknown>): Promise<void> {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw new Error(`Module ${moduleId} not found`);
    }

    // Check tier requirements
    if (!this.isTierSufficient(instance.manifest.requiredTier)) {
      throw new Error(
        `Module ${moduleId} requires tier ${instance.manifest.requiredTier}, but current tier is ${this.currentTier}`
      );
    }

    // Check feature availability
    for (const feature of instance.manifest.requiredFeatures) {
      if (!this.isFeatureAvailable(feature)) {
        throw new Error(`Required feature ${feature} is not available at current tier`);
      }
    }

    // Update configuration if provided
    if (config) {
      instance.config = { ...instance.config, ...config };
    }

    // Update state
    instance.state = "enabled";
    instance.enabledAt = new Date();

    log.info({ moduleId, config: instance.config }, "AI module enabled");
    this.emit("module:enabled", instance);
  }

  /**
   * Disables a module.
   */
  async disable(moduleId: string): Promise<void> {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw new Error(`Module ${moduleId} not found`);
    }

    instance.state = "disabled";

    log.info({ moduleId }, "AI module disabled");
    this.emit("module:disabled", moduleId);
  }

  /**
   * Updates module configuration.
   */
  async updateConfig(moduleId: string, config: Record<string, unknown>): Promise<void> {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw new Error(`Module ${moduleId} not found`);
    }

    const oldConfig = { ...instance.config };
    instance.config = { ...instance.config, ...config };

    log.info({ moduleId, oldConfig, newConfig: instance.config }, "AI module config updated");
    this.emit("module:config_updated", { moduleId, oldConfig, newConfig: instance.config });
  }

  /**
   * Checks if a feature is available at the current tier.
   */
  isFeatureAvailable(feature: AIFeatureFlag): boolean {
    return this.tierConfig.features.includes(feature);
  }

  /**
   * Gets the provider configuration for a capability.
   */
  getProviderForCapability(capability: AIFeatureFlag): AIProviderConfig | null {
    // Find enabled modules that provide this capability
    const modules = this.getByCapability(capability);
    const enabledModule = modules.find(m => m.state === "enabled");

    if (!enabledModule) return null;

    // Get provider from module config or default
    const providerId = enabledModule.config.provider as string;
    return this.providers.get(providerId) || null;
  }

  /**
   * Registers an AI provider.
   */
  registerProvider(config: AIProviderConfig): void {
    this.providers.set(config.id, config);
    log.info({ providerId: config.id, type: config.type }, "AI provider registered");
    this.emit("provider:registered", config);
  }

  /**
   * Gets all registered providers.
   */
  getProviders(): AIProviderConfig[] {
    return Array.from(this.providers.values());
  }

  /**
   * Gets enabled modules count.
   */
  getEnabledCount(): number {
    return Array.from(this.modules.values()).filter(m => m.state === "enabled").length;
  }

  /**
   * Gets module statistics summary.
   */
  getStatsSummary(): {
    total: number;
    enabled: number;
    disabled: number;
    error: number;
    tier: AIModuleTier;
    availableFeatures: AIFeatureFlag[];
  } {
    const modules = Array.from(this.modules.values());
    return {
      total: modules.length,
      enabled: modules.filter(m => m.state === "enabled").length,
      disabled: modules.filter(m => m.state === "disabled").length,
      error: modules.filter(m => m.state === "error").length,
      tier: this.currentTier,
      availableFeatures: this.tierConfig.features as AIFeatureFlag[],
    };
  }
}

// =============================================================================
// AI COST CONTROL SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Cost control service - manages AI spending limits and tracking.
 */
export class AICostControlServiceImpl extends EventEmitter {
  private config: AICostControlConfig;
  private costEntries: AICostEntry[] = [];
  private moduleUsage: Map<string, AIModuleUsage> = new Map();
  private currentMonth: string;

  constructor(config: AICostControlConfig) {
    super();
    this.config = config;
    this.currentMonth = this.getCurrentMonthKey();
    log.info({ globalBudget: config.globalMonthlyBudget }, "AI Cost Control Service initialized");
  }

  /**
   * Gets the current month key (YYYY-MM).
   */
  private getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  /**
   * Checks and resets usage if month has changed.
   */
  private checkMonthRollover(): void {
    const currentMonth = this.getCurrentMonthKey();
    if (currentMonth !== this.currentMonth) {
      log.info({ oldMonth: this.currentMonth, newMonth: currentMonth }, "Month rollover, resetting usage");
      this.currentMonth = currentMonth;
      this.resetAllUsage();
    }
  }

  /**
   * Resets all usage counters.
   */
  private resetAllUsage(): void {
    for (const usage of this.moduleUsage.values()) {
      usage.operationsThisMonth = 0;
      usage.tokensThisMonth = 0;
      usage.costThisMonth = 0;
    }
    this.emit("usage:reset");
  }

  /**
   * Checks if an operation is allowed within budget.
   */
  async checkBudget(
    moduleId: string,
    estimatedCost: number,
    userId?: string
  ): Promise<AICostCheckResult> {
    this.checkMonthRollover();

    const warnings: string[] = [];

    // Check global budget
    const globalUsage = await this.getGlobalUsage();
    if (globalUsage.totalCostThisMonth + estimatedCost > this.config.globalMonthlyBudget) {
      return {
        allowed: this.config.onBudgetExceeded !== "block",
        reason: "Global monthly budget exceeded",
        remainingBudget: this.config.globalMonthlyBudget - globalUsage.totalCostThisMonth,
        usagePercent: (globalUsage.totalCostThisMonth / this.config.globalMonthlyBudget) * 100,
        throttled: this.config.onBudgetExceeded === "throttle",
        warnings: ["Global budget limit reached"],
      };
    }

    // Check module budget
    const moduleBudget = this.config.moduleBudgets[moduleId];
    if (moduleBudget) {
      const moduleUsage = await this.getModuleUsage(moduleId);
      if (moduleUsage.costThisMonth + estimatedCost > moduleBudget.monthlyBudget) {
        return {
          allowed: this.config.onBudgetExceeded !== "block",
          reason: `Module ${moduleId} monthly budget exceeded`,
          remainingBudget: moduleBudget.monthlyBudget - moduleUsage.costThisMonth,
          usagePercent: (moduleUsage.costThisMonth / moduleBudget.monthlyBudget) * 100,
          throttled: this.config.onBudgetExceeded === "throttle",
          warnings: [`Module ${moduleId} budget limit reached`],
        };
      }

      // Check per-operation limit
      if (moduleBudget.perOperationLimit && estimatedCost > moduleBudget.perOperationLimit) {
        return {
          allowed: false,
          reason: `Operation cost ${estimatedCost} exceeds per-operation limit ${moduleBudget.perOperationLimit}`,
          remainingBudget: moduleBudget.monthlyBudget - moduleUsage.costThisMonth,
          usagePercent: (moduleUsage.costThisMonth / moduleBudget.monthlyBudget) * 100,
          throttled: false,
          warnings: ["Per-operation cost limit exceeded"],
        };
      }
    }

    // Check user budget
    if (userId && this.config.userBudgets?.[userId]) {
      const userBudget = this.config.userBudgets[userId];
      const userUsage = await this.getUserUsage(userId);

      if (userUsage.costThisMonth + estimatedCost > userBudget.monthlyBudget) {
        return {
          allowed: this.config.onBudgetExceeded !== "block",
          reason: `User ${userId} monthly budget exceeded`,
          remainingBudget: userBudget.monthlyBudget - userUsage.costThisMonth,
          usagePercent: (userUsage.costThisMonth / userBudget.monthlyBudget) * 100,
          throttled: this.config.onBudgetExceeded === "throttle",
          warnings: [`User budget limit reached`],
        };
      }
    }

    // Check alert thresholds
    const usagePercent = (globalUsage.totalCostThisMonth / this.config.globalMonthlyBudget) * 100;
    for (const threshold of this.config.alertThresholds) {
      if (usagePercent >= threshold) {
        warnings.push(`Usage at ${usagePercent.toFixed(1)}% of budget (threshold: ${threshold}%)`);
      }
    }

    return {
      allowed: true,
      remainingBudget: this.config.globalMonthlyBudget - globalUsage.totalCostThisMonth,
      usagePercent,
      throttled: false,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Records a cost entry.
   */
  async recordCost(entry: Omit<AICostEntry, "id" | "timestamp">): Promise<void> {
    this.checkMonthRollover();

    const fullEntry: AICostEntry = {
      ...entry,
      id: `cost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date(),
    };

    this.costEntries.push(fullEntry);

    // Update module usage
    const usage = this.moduleUsage.get(entry.moduleId) || this.createEmptyUsage();
    usage.totalOperations++;
    usage.operationsThisMonth++;
    usage.totalTokens += entry.inputTokens + entry.outputTokens;
    usage.tokensThisMonth += entry.inputTokens + entry.outputTokens;
    usage.totalCost += entry.cost;
    usage.costThisMonth += entry.cost;
    usage.lastOperationAt = new Date();
    this.moduleUsage.set(entry.moduleId, usage);

    log.debug({ entry: fullEntry }, "AI cost recorded");
    this.emit("cost:recorded", fullEntry);

    // Check and emit threshold alerts
    const globalUsage = await this.getGlobalUsage();
    const usagePercent = (globalUsage.totalCostThisMonth / this.config.globalMonthlyBudget) * 100;

    for (const threshold of this.config.alertThresholds) {
      if (usagePercent >= threshold) {
        this.emit("budget:threshold_reached", { threshold, usagePercent, globalUsage });
      }
    }
  }

  /**
   * Creates empty usage record.
   */
  private createEmptyUsage(): AIModuleUsage {
    return {
      totalOperations: 0,
      operationsThisMonth: 0,
      totalTokens: 0,
      tokensThisMonth: 0,
      totalCost: 0,
      costThisMonth: 0,
    };
  }

  /**
   * Gets module usage statistics.
   */
  async getModuleUsage(moduleId: string): Promise<AIModuleUsage> {
    this.checkMonthRollover();
    return this.moduleUsage.get(moduleId) || this.createEmptyUsage();
  }

  /**
   * Gets user usage statistics.
   */
  async getUserUsage(userId: string): Promise<{
    userId: string;
    operationsThisMonth: number;
    tokensThisMonth: number;
    costThisMonth: number;
    lastOperationAt?: Date;
  }> {
    this.checkMonthRollover();

    const userEntries = this.costEntries.filter(e => e.userId === userId);
    const thisMonth = this.getCurrentMonthKey();
    const thisMonthEntries = userEntries.filter(e =>
      `${e.timestamp.getFullYear()}-${String(e.timestamp.getMonth() + 1).padStart(2, "0")}` === thisMonth
    );

    return {
      userId,
      operationsThisMonth: thisMonthEntries.length,
      tokensThisMonth: thisMonthEntries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0),
      costThisMonth: thisMonthEntries.reduce((sum, e) => sum + e.cost, 0),
      lastOperationAt: userEntries.length > 0
        ? new Date(Math.max(...userEntries.map(e => e.timestamp.getTime())))
        : undefined,
    };
  }

  /**
   * Gets global usage statistics.
   */
  async getGlobalUsage(): Promise<AIGlobalUsage> {
    this.checkMonthRollover();

    const thisMonth = this.getCurrentMonthKey();
    const thisMonthEntries = this.costEntries.filter(e =>
      `${e.timestamp.getFullYear()}-${String(e.timestamp.getMonth() + 1).padStart(2, "0")}` === thisMonth
    );

    // Aggregate by module
    const moduleAgg: Record<string, number> = {};
    const userAgg: Record<string, number> = {};

    for (const entry of thisMonthEntries) {
      moduleAgg[entry.moduleId] = (moduleAgg[entry.moduleId] || 0) + entry.cost;
      if (entry.userId) {
        userAgg[entry.userId] = (userAgg[entry.userId] || 0) + entry.cost;
      }
    }

    const totalCostThisMonth = thisMonthEntries.reduce((sum, e) => sum + e.cost, 0);

    // Calculate projected monthly cost based on daily average
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const dailyAverage = totalCostThisMonth / dayOfMonth;
    const projectedMonthlyCost = dailyAverage * daysInMonth;

    return {
      totalOperationsThisMonth: thisMonthEntries.length,
      totalTokensThisMonth: thisMonthEntries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0),
      totalCostThisMonth,
      budgetRemainingThisMonth: this.config.globalMonthlyBudget - totalCostThisMonth,
      projectedMonthlyCost,
      topModules: Object.entries(moduleAgg)
        .map(([moduleId, cost]) => ({ moduleId, cost }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10),
      topUsers: Object.entries(userAgg)
        .map(([userId, cost]) => ({ userId, cost }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10),
    };
  }

  /**
   * Gets cost breakdown for a period.
   */
  async getCostBreakdown(period: "day" | "week" | "month"): Promise<AICostBreakdown> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "day":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        const dayOfWeek = now.getDay();
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const entries = this.costEntries.filter(e => e.timestamp >= startDate);

    // Aggregate
    const byModule: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    for (const entry of entries) {
      byModule[entry.moduleId] = (byModule[entry.moduleId] || 0) + entry.cost;
      byProvider[entry.provider] = (byProvider[entry.provider] || 0) + entry.cost;
      byOperation[entry.operation] = (byOperation[entry.operation] || 0) + entry.cost;

      const dayKey = entry.timestamp.toISOString().split("T")[0];
      byDay[dayKey] = (byDay[dayKey] || 0) + entry.cost;
    }

    return {
      period,
      startDate,
      endDate: now,
      totalCost: entries.reduce((sum, e) => sum + e.cost, 0),
      byModule,
      byProvider,
      byOperation,
      byDay: Object.entries(byDay)
        .map(([date, cost]) => ({ date, cost }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Resets usage counters.
   */
  async resetUsage(moduleId?: string): Promise<void> {
    if (moduleId) {
      const usage = this.moduleUsage.get(moduleId);
      if (usage) {
        usage.operationsThisMonth = 0;
        usage.tokensThisMonth = 0;
        usage.costThisMonth = 0;
      }
    } else {
      this.resetAllUsage();
    }
    log.info({ moduleId }, "AI usage counters reset");
  }

  /**
   * Updates the cost control configuration.
   */
  updateConfig(config: Partial<AICostControlConfig>): void {
    this.config = { ...this.config, ...config };
    log.info({ config: this.config }, "Cost control config updated");
    this.emit("config:updated", this.config);
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): AICostControlConfig {
    return this.config;
  }
}

// =============================================================================
// AI FALLBACK MANAGER IMPLEMENTATION
// =============================================================================

/**
 * Fallback manager - handles graceful degradation when AI is unavailable.
 */
export class AIFallbackManager {
  private config: AIFallbackConfig;
  private cache: Map<string, { value: unknown; expiresAt: number }> = new Map();

  constructor(config: AIFallbackConfig) {
    this.config = config;
    log.info("AI Fallback Manager initialized");
  }

  /**
   * Gets the fallback behavior for an operation.
   */
  getFallbackBehavior(operation: string): AIFallbackBehavior {
    return this.config.operations[operation] || this.config.default;
  }

  /**
   * Executes fallback for an operation.
   */
  async executeFallback<T>(
    operation: string,
    context: {
      input?: unknown;
      previousValue?: T;
      defaultValue?: T;
    }
  ): Promise<{
    value: T | undefined;
    source: string;
    notification?: AIFallbackNotification;
  }> {
    const behavior = this.getFallbackBehavior(operation);

    if (behavior.logEvent) {
      log.info({ operation, behavior: behavior.type }, "Executing AI fallback");
    }

    switch (behavior.type) {
      case "skip":
        return {
          value: undefined,
          source: "skip",
          notification: behavior.userNotification,
        };

      case "manual":
        return {
          value: undefined,
          source: "manual_required",
          notification: behavior.userNotification || {
            show: true,
            message: "AI is unavailable. Please enter the value manually.",
            type: "info",
            dismissable: true,
          },
        };

      case "default_value":
        return {
          value: behavior.customValue as T ?? context.defaultValue,
          source: "default",
          notification: behavior.userNotification,
        };

      case "cached":
        const cacheKey = this.getCacheKey(operation, context.input);
        const cached = this.getFromCache<T>(cacheKey);
        if (cached !== null) {
          return {
            value: cached,
            source: "cache",
            notification: behavior.userNotification,
          };
        }
        // Fall through to manual if no cache
        return {
          value: context.previousValue,
          source: "previous_or_manual",
          notification: behavior.userNotification,
        };

      case "rule_based":
        // Would execute rule-based logic here
        return {
          value: context.defaultValue,
          source: "rule_based",
          notification: behavior.userNotification,
        };

      case "queue":
        // Would queue for later processing
        log.info({ operation }, "Operation queued for later AI processing");
        return {
          value: undefined,
          source: "queued",
          notification: behavior.userNotification || {
            show: true,
            message: "AI processing has been queued and will complete when available.",
            type: "info",
            dismissable: true,
          },
        };

      case "custom":
        // Would execute custom fallback function
        return {
          value: context.defaultValue,
          source: "custom",
          notification: behavior.userNotification,
        };

      default:
        return {
          value: undefined,
          source: "unknown",
        };
    }
  }

  /**
   * Caches a value for fallback use.
   */
  cacheValue(operation: string, input: unknown, value: unknown): void {
    if (!this.config.cacheDurationMs) return;

    const key = this.getCacheKey(operation, input);
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.cacheDurationMs,
    });
  }

  /**
   * Gets a value from cache.
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Generates a cache key.
   */
  private getCacheKey(operation: string, input: unknown): string {
    const inputHash = JSON.stringify(input);
    return `${operation}:${this.simpleHash(inputHash)}`;
  }

  /**
   * Simple string hash.
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Checks if graceful degradation is enabled.
   */
  isGracefulDegradationEnabled(): boolean {
    return this.config.gracefulDegradation;
  }

  /**
   * Updates configuration.
   */
  updateConfig(config: Partial<AIFallbackConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// AI MODULE ORCHESTRATOR
// =============================================================================

/**
 * Orchestrates the entire AI module system.
 * This is the main entry point for AI operations.
 */
export class AIModuleOrchestrator extends EventEmitter {
  private registry: AIModuleRegistryImpl;
  private costControl: AICostControlServiceImpl;
  private fallbackManager: AIFallbackManager;
  private moduleImplementations: Map<string, AIModuleInterface> = new Map();
  private initialized: boolean = false;

  constructor(config: {
    tier?: AIModuleTier;
    costControl: AICostControlConfig;
    fallback: AIFallbackConfig;
  }) {
    super();

    this.registry = new AIModuleRegistryImpl(config.tier || "none");
    this.costControl = new AICostControlServiceImpl(config.costControl);
    this.fallbackManager = new AIFallbackManager(config.fallback);

    // Forward events
    this.registry.on("module:enabled", (instance) => this.emit("module:enabled", instance));
    this.registry.on("module:disabled", (moduleId) => this.emit("module:disabled", moduleId));
    this.registry.on("tier:changed", (data) => this.emit("tier:changed", data));
    this.costControl.on("budget:threshold_reached", (data) => this.emit("budget:threshold_reached", data));

    log.info({ tier: config.tier }, "AI Module Orchestrator initialized");
  }

  /**
   * Initializes the orchestrator.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize any enabled modules
    for (const instance of this.registry.getAll()) {
      if (instance.state === "enabled") {
        await this.initializeModule(instance.manifest.id);
      }
    }

    this.initialized = true;
    log.info("AI Module Orchestrator fully initialized");
    this.emit("initialized");
  }

  /**
   * Initializes a specific module implementation.
   */
  private async initializeModule(moduleId: string): Promise<void> {
    const impl = this.moduleImplementations.get(moduleId);
    if (!impl) return;

    const instance = this.registry.get(moduleId);
    if (!instance) return;

    try {
      await impl.initialize(instance.config);
      log.info({ moduleId }, "Module implementation initialized");
    } catch (error) {
      log.error({ moduleId, error }, "Failed to initialize module implementation");
      instance.state = "error";
      instance.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Registers a module with its implementation.
   */
  async registerModule(
    manifest: AIModuleManifest,
    implementation?: AIModuleInterface
  ): Promise<void> {
    await this.registry.register(manifest);

    if (implementation) {
      this.moduleImplementations.set(manifest.id, implementation);
    }
  }

  /**
   * Enables a module.
   */
  async enableModule(moduleId: string, config?: Record<string, unknown>): Promise<void> {
    await this.registry.enable(moduleId, config);
    await this.initializeModule(moduleId);
  }

  /**
   * Disables a module.
   */
  async disableModule(moduleId: string): Promise<void> {
    const impl = this.moduleImplementations.get(moduleId);
    if (impl) {
      await impl.shutdown();
    }
    await this.registry.disable(moduleId);
  }

  /**
   * Executes an AI operation.
   * This is the main entry point for all AI operations.
   */
  async execute<T = unknown>(request: AIModuleRequest): Promise<AIModuleResponse> {
    const startTime = Date.now();

    // Check if any AI is available
    if (this.registry.getTier() === "none") {
      return this.handleNoAI(request);
    }

    // Find a module that can handle this operation
    const module = this.findModuleForOperation(request.operation);
    if (!module) {
      return this.handleNoModule(request);
    }

    // Check budget
    const estimatedCost = this.estimateCost(request);
    const budgetCheck = await this.costControl.checkBudget(
      module.manifest.id,
      estimatedCost,
      request.userContext?.userId
    );

    if (!budgetCheck.allowed) {
      return this.handleBudgetExceeded(request, budgetCheck);
    }

    // Execute the operation
    try {
      const impl = this.moduleImplementations.get(module.manifest.id);
      if (!impl) {
        throw new Error(`No implementation for module ${module.manifest.id}`);
      }

      const response = await impl.process(request);

      // Record cost
      await this.costControl.recordCost({
        moduleId: module.manifest.id,
        provider: response.metadata.provider as AIProviderType || "unknown",
        model: response.metadata.model || "unknown",
        operation: request.operation,
        inputTokens: response.metadata.tokensUsed || 0,
        outputTokens: 0,
        cost: response.metadata.cost || 0,
        userId: request.userContext?.userId,
        metadata: request.options,
      });

      // Cache for fallback
      this.fallbackManager.cacheValue(request.operation, request.input, response.output);

      return response;
    } catch (error) {
      log.error({ requestId: request.requestId, error }, "AI operation failed");

      // Execute fallback
      const fallback = await this.fallbackManager.executeFallback<T>(
        request.operation,
        { input: request.input }
      );

      return {
        requestId: request.requestId,
        success: false,
        error: {
          code: "AI_OPERATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
        output: fallback.value,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          cached: fallback.source === "cache",
        },
      };
    }
  }

  /**
   * Handles requests when AI is completely disabled.
   */
  private async handleNoAI(request: AIModuleRequest): Promise<AIModuleResponse> {
    const fallback = await this.fallbackManager.executeFallback(
      request.operation,
      { input: request.input }
    );

    return {
      requestId: request.requestId,
      success: false,
      error: {
        code: "AI_DISABLED",
        message: "AI features are disabled. CMS is operating without AI.",
      },
      output: fallback.value,
      metadata: {
        processingTimeMs: 0,
      },
    };
  }

  /**
   * Handles requests when no module can process the operation.
   */
  private async handleNoModule(request: AIModuleRequest): Promise<AIModuleResponse> {
    const fallback = await this.fallbackManager.executeFallback(
      request.operation,
      { input: request.input }
    );

    return {
      requestId: request.requestId,
      success: false,
      error: {
        code: "NO_MODULE_AVAILABLE",
        message: `No AI module available for operation: ${request.operation}`,
      },
      output: fallback.value,
      metadata: {
        processingTimeMs: 0,
      },
    };
  }

  /**
   * Handles requests when budget is exceeded.
   */
  private async handleBudgetExceeded(
    request: AIModuleRequest,
    budgetCheck: AICostCheckResult
  ): Promise<AIModuleResponse> {
    const fallback = await this.fallbackManager.executeFallback(
      request.operation,
      { input: request.input }
    );

    return {
      requestId: request.requestId,
      success: false,
      error: {
        code: "BUDGET_EXCEEDED",
        message: budgetCheck.reason || "AI budget exceeded",
        details: {
          remainingBudget: budgetCheck.remainingBudget,
          usagePercent: budgetCheck.usagePercent,
        },
      },
      output: fallback.value,
      metadata: {
        processingTimeMs: 0,
      },
    };
  }

  /**
   * Finds a module that can handle an operation.
   */
  private findModuleForOperation(operation: string): AIModuleInstance | null {
    // Map operation to feature
    const operationToFeature: Record<string, AIFeatureFlag> = {
      "classify": "classification",
      "tag": "tagging",
      "suggest_taxonomy": "taxonomy_suggestion",
      "generate_text": "text_generation",
      "summarize": "summarization",
      "translate": "translation",
      "analyze_sentiment": "sentiment_analysis",
      "assist": "assistant",
      "generate_alt_text": "image_captioning",
      "optimize_seo": "seo_optimization",
      "generate_image": "image_generation",
      "embed": "embeddings",
      "semantic_search": "semantic_search",
    };

    const feature = operationToFeature[operation];
    if (!feature) return null;

    const modules = this.registry.getByCapability(feature);
    return modules.find(m => m.state === "enabled") || null;
  }

  /**
   * Estimates cost for an operation.
   */
  private estimateCost(request: AIModuleRequest): number {
    // Simple estimation based on input size
    const inputSize = JSON.stringify(request.input).length;
    const estimatedTokens = Math.ceil(inputSize / 4);
    // Assume $0.01 per 1K tokens as rough estimate
    return Math.ceil(estimatedTokens * 0.01);
  }

  /**
   * Gets the registry.
   */
  getRegistry(): AIModuleRegistryImpl {
    return this.registry;
  }

  /**
   * Gets the cost control service.
   */
  getCostControl(): AICostControlServiceImpl {
    return this.costControl;
  }

  /**
   * Gets the fallback manager.
   */
  getFallbackManager(): AIFallbackManager {
    return this.fallbackManager;
  }

  /**
   * Sets the AI tier.
   */
  setTier(tier: AIModuleTier): void {
    this.registry.setTier(tier);
  }

  /**
   * Gets system status.
   */
  getStatus(): {
    initialized: boolean;
    tier: AIModuleTier;
    moduleStats: ReturnType<AIModuleRegistryImpl["getStatsSummary"]>;
    budgetStatus: Promise<AIGlobalUsage>;
  } {
    return {
      initialized: this.initialized,
      tier: this.registry.getTier(),
      moduleStats: this.registry.getStatsSummary(),
      budgetStatus: this.costControl.getGlobalUsage(),
    };
  }

  /**
   * Shuts down the orchestrator.
   */
  async shutdown(): Promise<void> {
    // Shutdown all module implementations
    for (const [moduleId, impl] of this.moduleImplementations) {
      try {
        await impl.shutdown();
        log.info({ moduleId }, "Module implementation shut down");
      } catch (error) {
        log.error({ moduleId, error }, "Error shutting down module");
      }
    }

    this.initialized = false;
    log.info("AI Module Orchestrator shut down");
    this.emit("shutdown");
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Creates a default cost control configuration.
 */
export function createDefaultCostControlConfig(): AICostControlConfig {
  return {
    globalMonthlyBudget: 10000, // $100/month in cents
    moduleBudgets: {},
    alertThresholds: [50, 75, 90, 100],
    onBudgetExceeded: "warn",
    costAllocation: "per_module",
  };
}

/**
 * Creates a default fallback configuration.
 */
export function createDefaultFallbackConfig(): AIFallbackConfig {
  return {
    default: {
      type: "skip",
      logEvent: true,
      userNotification: {
        show: true,
        message: "AI features are temporarily unavailable.",
        type: "info",
        dismissable: true,
      },
    },
    operations: {
      classify: { type: "rule_based", logEvent: true },
      tag: { type: "manual", logEvent: true },
      generate_text: { type: "manual", logEvent: true },
      summarize: { type: "skip", logEvent: true },
      translate: { type: "queue", logEvent: true },
    },
    gracefulDegradation: true,
    cacheDurationMs: 3600000, // 1 hour
  };
}

/**
 * Creates the AI Module Orchestrator with default configuration.
 */
export function createAIModuleOrchestrator(
  tier: AIModuleTier = "none",
  costControl?: Partial<AICostControlConfig>,
  fallback?: Partial<AIFallbackConfig>
): AIModuleOrchestrator {
  return new AIModuleOrchestrator({
    tier,
    costControl: { ...createDefaultCostControlConfig(), ...costControl },
    fallback: { ...createDefaultFallbackConfig(), ...fallback },
  });
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let orchestratorInstance: AIModuleOrchestrator | null = null;

/**
 * Gets the singleton orchestrator instance.
 */
export function getAIModuleOrchestrator(): AIModuleOrchestrator | null {
  return orchestratorInstance;
}

/**
 * Initializes the singleton orchestrator.
 */
export async function initAIModuleOrchestrator(
  tier: AIModuleTier = "none",
  costControl?: Partial<AICostControlConfig>,
  fallback?: Partial<AIFallbackConfig>
): Promise<AIModuleOrchestrator> {
  if (orchestratorInstance) {
    log.warn("AI Module Orchestrator already initialized");
    return orchestratorInstance;
  }

  orchestratorInstance = createAIModuleOrchestrator(tier, costControl, fallback);
  await orchestratorInstance.initialize();

  return orchestratorInstance;
}

/**
 * Shuts down the singleton orchestrator.
 */
export async function shutdownAIModuleOrchestrator(): Promise<void> {
  if (orchestratorInstance) {
    await orchestratorInstance.shutdown();
    orchestratorInstance = null;
  }
}
