/**
 * @file ai-module-types.ts
 * @description Modular AI Architecture - Plug-and-Play AI System
 * @phase Phase 11 - Modular AI Architecture
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * KEY DESIGN PRINCIPLES:
 * =======================
 * 1. CMS is FULLY FUNCTIONAL without ANY AI modules
 * 2. AI features ENHANCE, never REQUIRED
 * 3. Admin can CAP AI costs per module
 * 4. Third-party AI modules can be added
 * 5. Local AI vs Cloud AI as swappable modules
 *
 * TIER ARCHITECTURE:
 * ==================
 * - Tier 0: None (CMS works perfectly)
 * - Tier 1: Basic (classification, tagging)
 * - Tier 2: Advanced (assistant, generation)
 * - Tier 3: Enterprise (custom models, training)
 *
 * INSPIRATION:
 * - Drupal module system (hooks, services)
 * - WordPress plugin architecture (filters, actions)
 * - Strapi plugin system (lifecycle hooks)
 * - VSCode extension API (activation events)
 */

import { z } from "zod";

// =============================================================================
// AI MODULE TIER DEFINITIONS
// =============================================================================

/**
 * AI capability tiers - determines what AI features are available.
 * System works at Tier 0 (none) with full functionality.
 */
export type AIModuleTier = "none" | "basic" | "advanced" | "enterprise";

/**
 * Tier configuration with feature flags.
 */
export interface AITierConfig {
  /** Tier identifier */
  tier: AIModuleTier;
  /** Human-readable name */
  name: string;
  /** Description of what this tier includes */
  description: string;
  /** Features included at this tier */
  features: AIFeatureFlag[];
  /** Monthly cost cap (in cents, 0 = no AI costs) */
  defaultMonthlyCostCap: number;
  /** Whether custom models are allowed */
  allowCustomModels: boolean;
  /** Whether training is allowed */
  allowTraining: boolean;
  /** Max concurrent AI requests */
  maxConcurrentRequests: number;
}

/**
 * Feature flags for AI capabilities.
 */
export type AIFeatureFlag =
  // Tier 0: None (no flags - CMS fully functional)
  // Tier 1: Basic
  | "classification"         // Content classification
  | "tagging"                // Auto-tagging
  | "taxonomy_suggestion"    // Taxonomy suggestions
  | "duplicate_detection"    // Content deduplication
  // Tier 2: Advanced
  | "text_generation"        // GPT-style text generation
  | "summarization"          // Content summarization
  | "translation"            // Machine translation
  | "sentiment_analysis"     // Sentiment detection
  | "assistant"              // AI assistant/chat
  | "image_captioning"       // Alt text generation
  | "seo_optimization"       // SEO suggestions
  // Tier 3: Enterprise
  | "custom_models"          // Custom fine-tuned models
  | "model_training"         // Train on your content
  | "embeddings"             // Vector embeddings
  | "semantic_search"        // AI-powered search
  | "image_generation"       // DALL-E, Stable Diffusion
  | "workflow_automation"    // AI-driven workflows
  | "predictive_fields"      // ML-predicted values
  | "cross_modal"            // Multi-modal AI
  ;

/**
 * Pre-defined tier configurations.
 */
export const AI_TIER_CONFIGS: Record<AIModuleTier, AITierConfig> = {
  none: {
    tier: "none",
    name: "No AI",
    description: "CMS operates without any AI features. Full functionality with manual workflows.",
    features: [],
    defaultMonthlyCostCap: 0,
    allowCustomModels: false,
    allowTraining: false,
    maxConcurrentRequests: 0,
  },
  basic: {
    tier: "basic",
    name: "Basic AI",
    description: "Essential AI features: classification, tagging, and suggestions.",
    features: ["classification", "tagging", "taxonomy_suggestion", "duplicate_detection"],
    defaultMonthlyCostCap: 5000, // $50/month
    allowCustomModels: false,
    allowTraining: false,
    maxConcurrentRequests: 5,
  },
  advanced: {
    tier: "advanced",
    name: "Advanced AI",
    description: "Full AI assistant with text generation, translation, and content optimization.",
    features: [
      "classification", "tagging", "taxonomy_suggestion", "duplicate_detection",
      "text_generation", "summarization", "translation", "sentiment_analysis",
      "assistant", "image_captioning", "seo_optimization",
    ],
    defaultMonthlyCostCap: 20000, // $200/month
    allowCustomModels: false,
    allowTraining: false,
    maxConcurrentRequests: 20,
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise AI",
    description: "Full AI suite with custom models, training, and advanced capabilities.",
    features: [
      "classification", "tagging", "taxonomy_suggestion", "duplicate_detection",
      "text_generation", "summarization", "translation", "sentiment_analysis",
      "assistant", "image_captioning", "seo_optimization",
      "custom_models", "model_training", "embeddings", "semantic_search",
      "image_generation", "workflow_automation", "predictive_fields", "cross_modal",
    ],
    defaultMonthlyCostCap: 100000, // $1000/month
    allowCustomModels: true,
    allowTraining: true,
    maxConcurrentRequests: 100,
  },
};

// =============================================================================
// AI PROVIDER ABSTRACTION
// =============================================================================

/**
 * Supported AI providers - pluggable architecture.
 */
export type AIProviderType =
  | "openai"           // OpenAI GPT models
  | "anthropic"        // Claude models
  | "google"           // Gemini models
  | "cohere"           // Cohere Command
  | "mistral"          // Mistral AI
  | "huggingface"      // HuggingFace Inference
  | "local_ollama"     // Local Ollama
  | "local_llamacpp"   // Local llama.cpp
  | "local_mlx"        // Apple MLX
  | "azure_openai"     // Azure OpenAI Service
  | "aws_bedrock"      // AWS Bedrock
  | "custom"           // Custom provider
  ;

/**
 * Provider deployment type.
 */
export type AIDeploymentType = "cloud" | "local" | "hybrid";

/**
 * AI provider configuration - abstracted interface.
 */
export interface AIProviderConfig {
  /** Provider identifier */
  id: string;
  /** Provider type */
  type: AIProviderType;
  /** Human-readable name */
  name: string;
  /** Deployment type */
  deployment: AIDeploymentType;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Priority (lower = higher priority) */
  priority: number;
  /** API endpoint (for custom/cloud providers) */
  endpoint?: string;
  /** API key reference (never store actual key here) */
  apiKeyRef?: string;
  /** Supported capabilities */
  capabilities: AIProviderCapability[];
  /** Model configurations */
  models: AIModelDefinition[];
  /** Rate limits */
  rateLimits: AIProviderRateLimits;
  /** Cost configuration */
  costs: AIProviderCosts;
  /** Health check configuration */
  healthCheck?: AIProviderHealthCheck;
  /** Custom headers for API calls */
  customHeaders?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: AIRetryConfig;
}

/**
 * Provider capabilities.
 */
export type AIProviderCapability =
  | "chat"              // Chat completions
  | "completion"        // Text completion
  | "embedding"         // Vector embeddings
  | "image_generation"  // Image generation
  | "image_analysis"    // Image understanding
  | "audio_transcription" // Speech to text
  | "audio_generation"  // Text to speech
  | "code_generation"   // Specialized code generation
  | "function_calling"  // Tool/function calling
  | "streaming"         // Streaming responses
  ;

/**
 * Model definition within a provider.
 */
export interface AIModelDefinition {
  /** Model identifier (as used in API calls) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model capabilities */
  capabilities: AIProviderCapability[];
  /** Context window size (tokens) */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Cost per 1K input tokens (in cents) */
  inputCostPer1K: number;
  /** Cost per 1K output tokens (in cents) */
  outputCostPer1K: number;
  /** Whether this model is recommended for this provider */
  recommended?: boolean;
  /** Supported modalities */
  modalities?: ("text" | "image" | "audio" | "video")[];
  /** Model-specific settings */
  settings?: Record<string, unknown>;
}

/**
 * Provider rate limits.
 */
export interface AIProviderRateLimits {
  /** Requests per minute */
  requestsPerMinute: number;
  /** Tokens per minute */
  tokensPerMinute: number;
  /** Requests per day */
  requestsPerDay: number;
  /** Concurrent requests */
  concurrentRequests: number;
}

/**
 * Provider cost configuration.
 */
export interface AIProviderCosts {
  /** Cost per request (base cost, in cents) */
  baseCostPerRequest?: number;
  /** Monthly minimum charge (in cents) */
  monthlyMinimum?: number;
  /** Volume discount tiers */
  volumeDiscounts?: Array<{
    minTokens: number;
    discountPercent: number;
  }>;
}

/**
 * Provider health check configuration.
 */
export interface AIProviderHealthCheck {
  /** Health check endpoint */
  endpoint?: string;
  /** Health check interval (ms) */
  intervalMs: number;
  /** Timeout for health check (ms) */
  timeoutMs: number;
  /** Number of failures before marking unhealthy */
  failureThreshold: number;
}

/**
 * Retry configuration.
 */
export interface AIRetryConfig {
  /** Maximum retries */
  maxRetries: number;
  /** Initial delay (ms) */
  initialDelayMs: number;
  /** Maximum delay (ms) */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Retry on these status codes */
  retryOnStatusCodes?: number[];
}

// =============================================================================
// AI MODULE SYSTEM
// =============================================================================

/**
 * AI module state.
 */
export type AIModuleState =
  | "uninstalled"   // Not installed
  | "disabled"      // Installed but disabled
  | "enabled"       // Enabled and ready
  | "degraded"      // Enabled but experiencing issues
  | "error"         // Failed to initialize
  ;

/**
 * AI module manifest - describes a pluggable AI module.
 */
export interface AIModuleManifest {
  /** Unique module identifier */
  id: string;
  /** Module name */
  name: string;
  /** Module version (semver) */
  version: string;
  /** Module description */
  description: string;
  /** Author/vendor */
  author: string;
  /** License */
  license: string;
  /** Module homepage/docs URL */
  homepage?: string;
  /** Minimum CMS version required */
  minCmsVersion: string;
  /** Minimum AI tier required */
  requiredTier: AIModuleTier;
  /** Required feature flags */
  requiredFeatures: AIFeatureFlag[];
  /** Module dependencies */
  dependencies?: AIModuleDependency[];
  /** Provided capabilities */
  provides: AIModuleCapability[];
  /** Module configuration schema */
  configSchema?: z.ZodType<unknown>;
  /** Default configuration */
  defaultConfig?: Record<string, unknown>;
  /** Lifecycle hooks */
  hooks?: AIModuleHooks;
  /** Admin UI configuration */
  adminUI?: AIModuleAdminUI;
  /** Cost estimation */
  costEstimate?: AIModuleCostEstimate;
}

/**
 * Module dependency.
 */
export interface AIModuleDependency {
  /** Module ID */
  moduleId: string;
  /** Version requirement (semver range) */
  versionRange: string;
  /** Whether this dependency is optional */
  optional?: boolean;
}

/**
 * Capability provided by a module.
 */
export interface AIModuleCapability {
  /** Capability type */
  type: AIFeatureFlag;
  /** Capability name */
  name: string;
  /** Description */
  description: string;
  /** Whether this is the primary capability */
  primary?: boolean;
}

/**
 * Module lifecycle hooks.
 */
export interface AIModuleHooks {
  /** Called when module is installed */
  onInstall?: string;  // Function name or path
  /** Called when module is enabled */
  onEnable?: string;
  /** Called when module is disabled */
  onDisable?: string;
  /** Called when module is uninstalled */
  onUninstall?: string;
  /** Called when module configuration changes */
  onConfigChange?: string;
  /** Called on CMS startup */
  onStartup?: string;
  /** Called on CMS shutdown */
  onShutdown?: string;
}

/**
 * Admin UI configuration for the module.
 */
export interface AIModuleAdminUI {
  /** Settings page component */
  settingsComponent?: string;
  /** Dashboard widget */
  dashboardWidget?: string;
  /** Menu items to add */
  menuItems?: Array<{
    label: string;
    path: string;
    icon?: string;
    parent?: string;
  }>;
}

/**
 * Cost estimation for the module.
 */
export interface AIModuleCostEstimate {
  /** Estimated cost per operation (cents) */
  perOperation?: number;
  /** Estimated monthly cost for typical usage (cents) */
  typicalMonthly?: number;
  /** Cost breakdown by operation type */
  breakdown?: Record<string, number>;
}

// =============================================================================
// AI MODULE REGISTRY
// =============================================================================

/**
 * Registered AI module instance.
 */
export interface AIModuleInstance {
  /** Module manifest */
  manifest: AIModuleManifest;
  /** Current state */
  state: AIModuleState;
  /** Current configuration */
  config: Record<string, unknown>;
  /** Installation timestamp */
  installedAt?: Date;
  /** Last enabled timestamp */
  enabledAt?: Date;
  /** Last error if in error state */
  lastError?: string;
  /** Usage statistics */
  usage?: AIModuleUsage;
}

/**
 * Module usage statistics.
 */
export interface AIModuleUsage {
  /** Total operations performed */
  totalOperations: number;
  /** Operations this month */
  operationsThisMonth: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Tokens this month */
  tokensThisMonth: number;
  /** Total cost (cents) */
  totalCost: number;
  /** Cost this month (cents) */
  costThisMonth: number;
  /** Last operation timestamp */
  lastOperationAt?: Date;
}

/**
 * AI module registry interface.
 */
export interface AIModuleRegistry {
  /** Register a new module */
  register(manifest: AIModuleManifest): Promise<void>;
  /** Unregister a module */
  unregister(moduleId: string): Promise<void>;
  /** Get a module by ID */
  get(moduleId: string): AIModuleInstance | null;
  /** Get all registered modules */
  getAll(): AIModuleInstance[];
  /** Get modules by capability */
  getByCapability(capability: AIFeatureFlag): AIModuleInstance[];
  /** Enable a module */
  enable(moduleId: string, config?: Record<string, unknown>): Promise<void>;
  /** Disable a module */
  disable(moduleId: string): Promise<void>;
  /** Update module configuration */
  updateConfig(moduleId: string, config: Record<string, unknown>): Promise<void>;
  /** Check if a feature is available */
  isFeatureAvailable(feature: AIFeatureFlag): boolean;
  /** Get provider for a capability */
  getProviderForCapability(capability: AIFeatureFlag): AIProviderConfig | null;
}

// =============================================================================
// COST CONTROL SYSTEM
// =============================================================================

/**
 * Cost control configuration.
 */
export interface AICostControlConfig {
  /** Global monthly budget (cents) */
  globalMonthlyBudget: number;
  /** Per-module budgets */
  moduleBudgets: Record<string, AIModuleBudget>;
  /** Per-user budgets */
  userBudgets?: Record<string, AIUserBudget>;
  /** Alert thresholds (percentage of budget) */
  alertThresholds: number[];
  /** Action when budget exceeded */
  onBudgetExceeded: "block" | "warn" | "throttle";
  /** Throttle configuration */
  throttleConfig?: AIThrottleConfig;
  /** Cost allocation method */
  costAllocation: "per_module" | "shared_pool" | "per_user";
}

/**
 * Per-module budget configuration.
 */
export interface AIModuleBudget {
  /** Module ID */
  moduleId: string;
  /** Monthly budget (cents) */
  monthlyBudget: number;
  /** Daily budget (cents, optional) */
  dailyBudget?: number;
  /** Per-operation limit (cents) */
  perOperationLimit?: number;
  /** Whether to inherit from global if not set */
  inheritGlobal?: boolean;
  /** Custom alert thresholds */
  alertThresholds?: number[];
}

/**
 * Per-user budget configuration.
 */
export interface AIUserBudget {
  /** User ID */
  userId: string;
  /** Monthly budget (cents) */
  monthlyBudget: number;
  /** Allowed modules */
  allowedModules?: string[];
  /** Denied modules */
  deniedModules?: string[];
}

/**
 * Throttle configuration.
 */
export interface AIThrottleConfig {
  /** Reduce rate to this percentage when throttling */
  throttlePercent: number;
  /** Duration to throttle (ms) */
  throttleDurationMs: number;
  /** Gradual ramp-up period (ms) */
  rampUpPeriodMs: number;
}

/**
 * Cost tracking entry.
 */
export interface AICostEntry {
  /** Unique entry ID */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** Module ID */
  moduleId: string;
  /** Provider used */
  provider: AIProviderType;
  /** Model used */
  model: string;
  /** Operation type */
  operation: string;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Cost (cents) */
  cost: number;
  /** User ID (if applicable) */
  userId?: string;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Cost control service interface.
 */
export interface AICostControlService {
  /** Check if operation is allowed within budget */
  checkBudget(moduleId: string, estimatedCost: number, userId?: string): Promise<AICostCheckResult>;
  /** Record a cost entry */
  recordCost(entry: Omit<AICostEntry, "id" | "timestamp">): Promise<void>;
  /** Get current usage for a module */
  getModuleUsage(moduleId: string): Promise<AIModuleUsage>;
  /** Get current usage for a user */
  getUserUsage(userId: string): Promise<AIUserUsage>;
  /** Get global usage */
  getGlobalUsage(): Promise<AIGlobalUsage>;
  /** Get cost breakdown */
  getCostBreakdown(period: "day" | "week" | "month"): Promise<AICostBreakdown>;
  /** Reset usage counters (for new billing period) */
  resetUsage(moduleId?: string): Promise<void>;
}

/**
 * Budget check result.
 */
export interface AICostCheckResult {
  /** Whether operation is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Remaining budget (cents) */
  remainingBudget: number;
  /** Current usage percentage */
  usagePercent: number;
  /** Whether throttling is active */
  throttled: boolean;
  /** Warnings */
  warnings?: string[];
}

/**
 * User usage statistics.
 */
export interface AIUserUsage {
  userId: string;
  operationsThisMonth: number;
  tokensThisMonth: number;
  costThisMonth: number;
  lastOperationAt?: Date;
}

/**
 * Global usage statistics.
 */
export interface AIGlobalUsage {
  totalOperationsThisMonth: number;
  totalTokensThisMonth: number;
  totalCostThisMonth: number;
  budgetRemainingThisMonth: number;
  projectedMonthlyCost: number;
  topModules: Array<{ moduleId: string; cost: number }>;
  topUsers: Array<{ userId: string; cost: number }>;
}

/**
 * Cost breakdown report.
 */
export interface AICostBreakdown {
  period: "day" | "week" | "month";
  startDate: Date;
  endDate: Date;
  totalCost: number;
  byModule: Record<string, number>;
  byProvider: Record<string, number>;
  byOperation: Record<string, number>;
  byDay: Array<{ date: string; cost: number }>;
}

// =============================================================================
// FALLBACK SYSTEM
// =============================================================================

/**
 * Fallback behavior when AI is disabled or unavailable.
 */
export interface AIFallbackBehavior {
  /** Fallback type */
  type: AIFallbackType;
  /** Custom fallback value */
  customValue?: unknown;
  /** Fallback function name */
  fallbackFunction?: string;
  /** User notification */
  userNotification?: AIFallbackNotification;
  /** Log fallback event */
  logEvent?: boolean;
}

/**
 * Fallback types.
 */
export type AIFallbackType =
  | "skip"              // Skip the AI operation entirely
  | "manual"            // Require manual input
  | "default_value"     // Use a default value
  | "cached"            // Use cached result
  | "rule_based"        // Fall back to rule-based logic
  | "queue"             // Queue for later processing
  | "custom"            // Custom fallback function
  ;

/**
 * User notification for fallback.
 */
export interface AIFallbackNotification {
  /** Show notification to user */
  show: boolean;
  /** Notification message */
  message: string;
  /** Notification type */
  type: "info" | "warning" | "error";
  /** Dismissable */
  dismissable: boolean;
}

/**
 * Fallback configuration per operation type.
 */
export interface AIFallbackConfig {
  /** Default fallback behavior */
  default: AIFallbackBehavior;
  /** Per-operation fallbacks */
  operations: Record<string, AIFallbackBehavior>;
  /** Global fallback message */
  globalMessage?: string;
  /** Enable graceful degradation */
  gracefulDegradation: boolean;
  /** Cache duration for fallback values (ms) */
  cacheDurationMs?: number;
}

// =============================================================================
// AI ASSISTANT MODULE
// =============================================================================

/**
 * AI Assistant as a standalone module with sub-capabilities.
 */
export interface AIAssistantModuleConfig {
  /** Whether assistant is enabled */
  enabled: boolean;
  /** Primary provider for the assistant */
  primaryProvider: AIProviderType;
  /** Fallback provider */
  fallbackProvider?: AIProviderType;
  /** Model to use */
  model: string;
  /** System prompt/personality */
  systemPrompt: string;
  /** Sub-capabilities */
  capabilities: AIAssistantCapability[];
  /** Context configuration */
  context: AIAssistantContextConfig;
  /** Response configuration */
  response: AIAssistantResponseConfig;
  /** Safety configuration */
  safety: AIAssistantSafetyConfig;
}

/**
 * Assistant sub-capabilities.
 */
export interface AIAssistantCapability {
  /** Capability ID */
  id: string;
  /** Capability name */
  name: string;
  /** Whether enabled */
  enabled: boolean;
  /** Description */
  description: string;
  /** Required feature flag */
  requiredFeature?: AIFeatureFlag;
  /** Custom configuration */
  config?: Record<string, unknown>;
}

/**
 * Pre-defined assistant capabilities.
 */
export const AI_ASSISTANT_CAPABILITIES: AIAssistantCapability[] = [
  {
    id: "content_help",
    name: "Content Writing Help",
    enabled: true,
    description: "Help with writing and editing content",
    requiredFeature: "text_generation",
  },
  {
    id: "seo_advice",
    name: "SEO Advice",
    enabled: true,
    description: "Provide SEO optimization suggestions",
    requiredFeature: "seo_optimization",
  },
  {
    id: "taxonomy_help",
    name: "Taxonomy Assistance",
    enabled: true,
    description: "Help with categorization and tagging",
    requiredFeature: "taxonomy_suggestion",
  },
  {
    id: "translation",
    name: "Translation",
    enabled: true,
    description: "Translate content between languages",
    requiredFeature: "translation",
  },
  {
    id: "summarization",
    name: "Summarization",
    enabled: true,
    description: "Summarize long content",
    requiredFeature: "summarization",
  },
  {
    id: "code_assistance",
    name: "Code Assistance",
    enabled: false,
    description: "Help with code snippets and technical content",
  },
  {
    id: "accessibility_check",
    name: "Accessibility Check",
    enabled: true,
    description: "Check content for accessibility issues",
  },
  {
    id: "general_qa",
    name: "General Q&A",
    enabled: true,
    description: "Answer general questions about the CMS",
  },
];

/**
 * Assistant context configuration.
 */
export interface AIAssistantContextConfig {
  /** Include current content in context */
  includeCurrentContent: boolean;
  /** Include content type schema */
  includeContentSchema: boolean;
  /** Include recent user actions */
  includeRecentActions: boolean;
  /** Max context tokens */
  maxContextTokens: number;
  /** Context window strategy */
  contextStrategy: "truncate" | "summarize" | "rolling";
}

/**
 * Assistant response configuration.
 */
export interface AIAssistantResponseConfig {
  /** Max response tokens */
  maxResponseTokens: number;
  /** Temperature */
  temperature: number;
  /** Enable streaming */
  streaming: boolean;
  /** Response format */
  format: "text" | "markdown" | "html";
  /** Include citations */
  includeCitations: boolean;
}

/**
 * Assistant safety configuration.
 */
export interface AIAssistantSafetyConfig {
  /** Content moderation enabled */
  moderationEnabled: boolean;
  /** Blocked topics */
  blockedTopics: string[];
  /** PII detection */
  piiDetection: boolean;
  /** Max messages per session */
  maxMessagesPerSession: number;
  /** Session timeout (ms) */
  sessionTimeoutMs: number;
}

// =============================================================================
// ML TAXONOMY ENHANCEMENT MODULE
// =============================================================================

/**
 * ML Taxonomy Enhancement as an optional module.
 */
export interface MLTaxonomyModuleConfig {
  /** Whether ML taxonomy is enabled */
  enabled: boolean;
  /** Classification strategy */
  strategy: MLTaxonomyStrategy;
  /** Embedding configuration */
  embeddings: MLEmbeddingConfig;
  /** Auto-learning configuration */
  autoLearning: MLAutoLearningConfig;
  /** Cluster discovery */
  clusterDiscovery: MLClusterDiscoveryConfig;
  /** Fallback to rules when ML unavailable */
  fallbackToRules: boolean;
}

/**
 * ML taxonomy strategy.
 */
export type MLTaxonomyStrategy =
  | "rules_only"           // Use only RSES rules (no ML)
  | "ml_assisted"          // ML suggests, rules decide
  | "ml_primary"           // ML primary, rules fallback
  | "ensemble"             // Combine ML and rules
  ;

/**
 * Embedding configuration for taxonomy.
 */
export interface MLEmbeddingConfig {
  /** Whether embeddings are enabled */
  enabled: boolean;
  /** Embedding provider */
  provider: AIProviderType;
  /** Embedding model */
  model: string;
  /** Embedding dimensions */
  dimensions: number;
  /** Vector database type */
  vectorDb: "memory" | "pinecone" | "weaviate" | "qdrant" | "chromadb";
  /** Similarity threshold */
  similarityThreshold: number;
}

/**
 * Auto-learning configuration.
 */
export interface MLAutoLearningConfig {
  /** Whether auto-learning is enabled */
  enabled: boolean;
  /** Learn from user corrections */
  learnFromCorrections: boolean;
  /** Minimum corrections before learning */
  minCorrectionsForLearning: number;
  /** Privacy-preserving learning */
  differentialPrivacy: boolean;
  /** Privacy epsilon */
  privacyEpsilon: number;
}

/**
 * Cluster discovery configuration.
 */
export interface MLClusterDiscoveryConfig {
  /** Whether cluster discovery is enabled */
  enabled: boolean;
  /** Clustering algorithm */
  algorithm: "kmeans" | "dbscan" | "hdbscan";
  /** Minimum cluster size */
  minClusterSize: number;
  /** Auto-suggest new taxonomy terms */
  suggestNewTerms: boolean;
  /** Require approval for new terms */
  requireApproval: boolean;
}

// =============================================================================
// LOCAL VS CLOUD AI CONFIGURATION
// =============================================================================

/**
 * Deployment preference configuration.
 */
export interface AIDeploymentPreference {
  /** Preferred deployment type */
  preferred: AIDeploymentType;
  /** Fallback deployment type */
  fallback?: AIDeploymentType;
  /** When to use local */
  localPolicy: AILocalPolicy;
  /** When to use cloud */
  cloudPolicy: AICloudPolicy;
}

/**
 * Local AI usage policy.
 */
export interface AILocalPolicy {
  /** Operations that should use local AI */
  preferredOperations: string[];
  /** Max tokens for local processing */
  maxTokens: number;
  /** Required GPU */
  requireGpu: boolean;
  /** Memory threshold (MB) */
  memoryThresholdMb: number;
  /** Timeout before falling back to cloud */
  timeoutMs: number;
}

/**
 * Cloud AI usage policy.
 */
export interface AICloudPolicy {
  /** Operations that should use cloud */
  preferredOperations: string[];
  /** Use cloud only when local unavailable */
  onlyWhenLocalUnavailable: boolean;
  /** Privacy-sensitive content policy */
  privacySensitivePolicy: "block" | "anonymize" | "allow";
  /** Region restrictions */
  allowedRegions?: string[];
}

// =============================================================================
// THIRD-PARTY MODULE INTERFACE
// =============================================================================

/**
 * Interface that third-party AI modules must implement.
 */
export interface AIModuleInterface {
  /** Module metadata */
  readonly manifest: AIModuleManifest;

  /** Initialize the module */
  initialize(config: Record<string, unknown>): Promise<void>;

  /** Shutdown the module */
  shutdown(): Promise<void>;

  /** Check if module is healthy */
  healthCheck(): Promise<AIModuleHealthStatus>;

  /** Process an AI request */
  process(request: AIModuleRequest): Promise<AIModuleResponse>;

  /** Get module statistics */
  getStatistics(): AIModuleStatistics;

  /** Validate configuration */
  validateConfig(config: Record<string, unknown>): Promise<AIConfigValidationResult>;
}

/**
 * Module health status.
 */
export interface AIModuleHealthStatus {
  healthy: boolean;
  status: "ok" | "degraded" | "error";
  message?: string;
  lastCheck: Date;
  details?: Record<string, unknown>;
}

/**
 * AI module request.
 */
export interface AIModuleRequest {
  /** Request ID */
  requestId: string;
  /** Operation type */
  operation: string;
  /** Input data */
  input: unknown;
  /** Request options */
  options?: Record<string, unknown>;
  /** User context */
  userContext?: {
    userId: string;
    roles: string[];
  };
  /** Timeout (ms) */
  timeout?: number;
}

/**
 * AI module response.
 */
export interface AIModuleResponse {
  /** Request ID */
  requestId: string;
  /** Whether successful */
  success: boolean;
  /** Output data */
  output?: unknown;
  /** Error if not successful */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Metadata */
  metadata: {
    processingTimeMs: number;
    tokensUsed?: number;
    cost?: number;
    provider?: string;
    model?: string;
    cached?: boolean;
  };
}

/**
 * Module statistics.
 */
export interface AIModuleStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  totalTokensUsed: number;
  totalCost: number;
  cacheHitRate: number;
  errorRate: number;
  uptimeSeconds: number;
}

/**
 * Configuration validation result.
 */
export interface AIConfigValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
  }>;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

export const aiTierConfigSchema = z.object({
  tier: z.enum(["none", "basic", "advanced", "enterprise"]),
  name: z.string().min(1),
  description: z.string(),
  features: z.array(z.string()),
  defaultMonthlyCostCap: z.number().min(0),
  allowCustomModels: z.boolean(),
  allowTraining: z.boolean(),
  maxConcurrentRequests: z.number().min(0),
});

export const aiProviderConfigSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  name: z.string().min(1),
  deployment: z.enum(["cloud", "local", "hybrid"]),
  enabled: z.boolean(),
  priority: z.number().int().min(0),
  endpoint: z.string().url().optional(),
  apiKeyRef: z.string().optional(),
  capabilities: z.array(z.string()),
  models: z.array(z.object({
    id: z.string(),
    name: z.string(),
    capabilities: z.array(z.string()),
    contextWindow: z.number().positive(),
    maxOutputTokens: z.number().positive(),
    inputCostPer1K: z.number().min(0),
    outputCostPer1K: z.number().min(0),
    recommended: z.boolean().optional(),
  })),
  rateLimits: z.object({
    requestsPerMinute: z.number().positive(),
    tokensPerMinute: z.number().positive(),
    requestsPerDay: z.number().positive(),
    concurrentRequests: z.number().positive(),
  }),
  costs: z.object({
    baseCostPerRequest: z.number().min(0).optional(),
    monthlyMinimum: z.number().min(0).optional(),
  }),
  timeout: z.number().positive().optional(),
});

export const aiCostControlConfigSchema = z.object({
  globalMonthlyBudget: z.number().min(0),
  moduleBudgets: z.record(z.object({
    moduleId: z.string(),
    monthlyBudget: z.number().min(0),
    dailyBudget: z.number().min(0).optional(),
    perOperationLimit: z.number().min(0).optional(),
    inheritGlobal: z.boolean().optional(),
  })),
  userBudgets: z.record(z.object({
    userId: z.string(),
    monthlyBudget: z.number().min(0),
    allowedModules: z.array(z.string()).optional(),
    deniedModules: z.array(z.string()).optional(),
  })).optional(),
  alertThresholds: z.array(z.number().min(0).max(100)),
  onBudgetExceeded: z.enum(["block", "warn", "throttle"]),
  costAllocation: z.enum(["per_module", "shared_pool", "per_user"]),
});

export const aiModuleManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().max(500),
  author: z.string().min(1),
  license: z.string(),
  homepage: z.string().url().optional(),
  minCmsVersion: z.string(),
  requiredTier: z.enum(["none", "basic", "advanced", "enterprise"]),
  requiredFeatures: z.array(z.string()),
  dependencies: z.array(z.object({
    moduleId: z.string(),
    versionRange: z.string(),
    optional: z.boolean().optional(),
  })).optional(),
  provides: z.array(z.object({
    type: z.string(),
    name: z.string(),
    description: z.string(),
    primary: z.boolean().optional(),
  })),
});

// =============================================================================
// EXPORTS
// =============================================================================
// All types above are inline-exported. Trailing `export type { … }` block
// removed 2026-04-14 to fix duplicate-export errors.
