/**
 * @file classification-module.ts
 * @description AI Classification Module - Example Plug-and-Play Module
 * @phase Phase 11 - Modular AI Architecture
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This module demonstrates how to implement a plug-and-play AI module.
 * It provides content classification capabilities that work with any
 * supported AI provider (OpenAI, Claude, local Ollama, etc.)
 *
 * KEY POINTS FOR THIRD-PARTY DEVELOPERS:
 * ======================================
 * 1. Implement AIModuleInterface
 * 2. Define a manifest with required features
 * 3. Handle graceful degradation when AI unavailable
 * 4. Track costs per operation
 * 5. Support multiple providers
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../../logger";
import type {
  AIModuleInterface,
  AIModuleManifest,
  AIModuleRequest,
  AIModuleResponse,
  AIModuleHealthStatus,
  AIModuleStatistics,
  AIConfigValidationResult,
  AIProviderType,
} from "@shared/cms/ai-module-types";

const log = createModuleLogger("ai-classification-module");

// =============================================================================
// MODULE MANIFEST
// =============================================================================

/**
 * Classification module manifest.
 * This defines the module's identity, requirements, and capabilities.
 */
export const CLASSIFICATION_MODULE_MANIFEST: AIModuleManifest = {
  id: "ai-classification",
  name: "AI Content Classification",
  version: "1.0.0",
  description: "Automatic content classification using AI. Supports taxonomy assignment, topic detection, and content categorization.",
  author: "CMS Core Team",
  license: "MIT",
  homepage: "https://cms.example.com/modules/ai-classification",
  minCmsVersion: "2.0.0",
  requiredTier: "basic", // Works at basic tier and above
  requiredFeatures: ["classification"],
  dependencies: [], // No dependencies
  provides: [
    {
      type: "classification",
      name: "Content Classification",
      description: "Classify content into categories using AI",
      primary: true,
    },
    {
      type: "tagging",
      name: "Auto-Tagging",
      description: "Automatically generate tags for content",
    },
    {
      type: "taxonomy_suggestion",
      name: "Taxonomy Suggestions",
      description: "Suggest taxonomy terms for content",
    },
  ],
  defaultConfig: {
    provider: "openai",
    model: "gpt-4o-mini",
    maxCategories: 5,
    minConfidence: 0.7,
    enableCaching: true,
    cacheTtlMs: 3600000, // 1 hour
    fallbackToRules: true,
  },
  hooks: {
    onEnable: "onModuleEnable",
    onDisable: "onModuleDisable",
    onConfigChange: "onConfigChange",
  },
  adminUI: {
    settingsComponent: "ClassificationSettings",
    dashboardWidget: "ClassificationStats",
    menuItems: [
      {
        label: "Classification",
        path: "/admin/ai/classification",
        icon: "tags",
        parent: "ai",
      },
    ],
  },
  costEstimate: {
    perOperation: 1, // $0.01 per classification
    typicalMonthly: 1000, // $10/month typical
    breakdown: {
      classify: 1,
      tag: 0.5,
      suggest_taxonomy: 0.5,
    },
  },
};

// =============================================================================
// MODULE CONFIGURATION
// =============================================================================

/**
 * Classification module configuration interface.
 */
export interface ClassificationModuleConfig {
  /** AI provider to use */
  provider: AIProviderType;
  /** Model to use */
  model: string;
  /** API key reference */
  apiKeyRef?: string;
  /** Maximum categories to return */
  maxCategories: number;
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
  /** Enable caching of results */
  enableCaching: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Fall back to rule-based classification when AI unavailable */
  fallbackToRules: boolean;
  /** Custom categories */
  customCategories?: string[];
  /** Taxonomy vocabulary to use */
  taxonomyVocabulary?: string;
  /** Custom system prompt */
  customSystemPrompt?: string;
}

// =============================================================================
// CLASSIFICATION REQUEST/RESPONSE
// =============================================================================

/**
 * Classification request input.
 */
export interface ClassificationInput {
  /** Content to classify */
  content: string;
  /** Content title (optional, improves accuracy) */
  title?: string;
  /** Content type */
  contentType?: string;
  /** Available categories (if predefined) */
  categories?: string[];
  /** Language of content */
  language?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Classification result.
 */
export interface ClassificationResult {
  /** Assigned categories with confidence scores */
  categories: Array<{
    id: string;
    name: string;
    confidence: number;
    path?: string[];
  }>;
  /** Generated tags */
  tags?: string[];
  /** Suggested taxonomy terms */
  taxonomyTerms?: Array<{
    vocabularyId: string;
    termId: string;
    termName: string;
    confidence: number;
  }>;
  /** Explanation of classification */
  explanation?: string;
  /** Model used */
  model: string;
  /** Provider used */
  provider: string;
}

// =============================================================================
// MODULE IMPLEMENTATION
// =============================================================================

/**
 * AI Classification Module implementation.
 * Demonstrates the plug-and-play module pattern.
 */
export class ClassificationModule extends EventEmitter implements AIModuleInterface {
  readonly manifest = CLASSIFICATION_MODULE_MANIFEST;

  private config: ClassificationModuleConfig;
  private initialized: boolean = false;
  private healthy: boolean = false;
  private lastHealthCheck: Date = new Date();

  // Statistics tracking
  private stats: AIModuleStatistics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    totalTokensUsed: 0,
    totalCost: 0,
    cacheHitRate: 0,
    errorRate: 0,
    uptimeSeconds: 0,
  };

  // Latency tracking for percentiles
  private latencies: number[] = [];
  private startTime: Date = new Date();

  // Simple cache
  private cache: Map<string, { result: ClassificationResult; expiresAt: number }> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor() {
    super();
    this.config = CLASSIFICATION_MODULE_MANIFEST.defaultConfig as ClassificationModuleConfig;
  }

  /**
   * Initializes the module.
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    log.info({ config }, "Initializing classification module");

    // Merge with default config
    this.config = {
      ...this.config,
      ...config,
    } as ClassificationModuleConfig;

    // Validate configuration
    const validation = await this.validateConfig(this.config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.map(e => e.message).join(", ")}`);
    }

    // Test provider connectivity
    await this.testProviderConnectivity();

    this.initialized = true;
    this.healthy = true;
    this.startTime = new Date();

    log.info({ provider: this.config.provider, model: this.config.model }, "Classification module initialized");
    this.emit("initialized");
  }

  /**
   * Shuts down the module.
   */
  async shutdown(): Promise<void> {
    log.info("Shutting down classification module");

    this.cache.clear();
    this.latencies = [];
    this.initialized = false;
    this.healthy = false;

    this.emit("shutdown");
  }

  /**
   * Performs a health check.
   */
  async healthCheck(): Promise<AIModuleHealthStatus> {
    const now = new Date();

    try {
      // Test with a simple classification
      const testResult = await this.testProviderConnectivity();

      this.healthy = true;
      this.lastHealthCheck = now;

      return {
        healthy: true,
        status: "ok",
        lastCheck: now,
        details: {
          provider: this.config.provider,
          model: this.config.model,
          cacheSize: this.cache.size,
          uptimeSeconds: this.stats.uptimeSeconds,
        },
      };
    } catch (error) {
      this.healthy = false;
      this.lastHealthCheck = now;

      return {
        healthy: false,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        lastCheck: now,
        details: {
          provider: this.config.provider,
          lastError: error,
        },
      };
    }
  }

  /**
   * Tests provider connectivity.
   */
  private async testProviderConnectivity(): Promise<boolean> {
    // In a real implementation, this would make a test API call
    // For now, simulate based on provider
    if (this.config.provider === "openai" && !this.config.apiKeyRef) {
      // OpenAI requires API key
      log.warn("OpenAI provider selected but no API key configured");
    }

    return true;
  }

  /**
   * Processes an AI request.
   */
  async process(request: AIModuleRequest): Promise<AIModuleResponse> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    if (!this.initialized) {
      return this.createErrorResponse(request, "MODULE_NOT_INITIALIZED", "Module not initialized", startTime);
    }

    try {
      const input = request.input as ClassificationInput;

      // Validate input
      if (!input.content || input.content.trim().length === 0) {
        return this.createErrorResponse(request, "INVALID_INPUT", "Content is required", startTime);
      }

      // Check cache
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(input);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.cacheHits++;
          this.updateStats(startTime, 0, 0, true);

          return {
            requestId: request.requestId,
            success: true,
            output: cached,
            metadata: {
              processingTimeMs: Date.now() - startTime,
              cached: true,
              provider: this.config.provider,
              model: this.config.model,
            },
          };
        }
        this.cacheMisses++;
      }

      // Perform classification
      const result = await this.classify(input);

      // Cache result
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(input);
        this.addToCache(cacheKey, result);
      }

      // Update statistics
      const tokensUsed = this.estimateTokens(input);
      const cost = this.estimateCost(tokensUsed);
      this.updateStats(startTime, tokensUsed, cost, false);

      this.stats.successfulRequests++;

      return {
        requestId: request.requestId,
        success: true,
        output: result,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          tokensUsed,
          cost,
          provider: this.config.provider,
          model: this.config.model,
          cached: false,
        },
      };
    } catch (error) {
      this.stats.failedRequests++;
      log.error({ requestId: request.requestId, error }, "Classification failed");

      // Try fallback if configured
      if (this.config.fallbackToRules) {
        const fallbackResult = this.ruleBasedClassification(request.input as ClassificationInput);

        return {
          requestId: request.requestId,
          success: true,
          output: fallbackResult,
          metadata: {
            processingTimeMs: Date.now() - startTime,
            provider: "rule_based",
            model: "rules",
            cached: false,
          },
        };
      }

      return this.createErrorResponse(
        request,
        "CLASSIFICATION_FAILED",
        error instanceof Error ? error.message : String(error),
        startTime
      );
    }
  }

  /**
   * Performs AI-based classification.
   */
  private async classify(input: ClassificationInput): Promise<ClassificationResult> {
    // Build the classification prompt
    const prompt = this.buildClassificationPrompt(input);

    // In a real implementation, this would call the AI provider
    // For now, simulate a response
    const simulatedResponse = await this.simulateAIClassification(input, prompt);

    return simulatedResponse;
  }

  /**
   * Builds the classification prompt.
   */
  private buildClassificationPrompt(input: ClassificationInput): string {
    const systemPrompt = this.config.customSystemPrompt ||
      `You are a content classification expert. Classify the following content into appropriate categories.
       Return a JSON object with:
       - categories: array of {id, name, confidence (0-1)}
       - tags: array of relevant tags
       - explanation: brief explanation of your classification`;

    const userPrompt = `
      Content to classify:
      ${input.title ? `Title: ${input.title}` : ""}
      ${input.content}

      ${input.categories ? `Available categories: ${input.categories.join(", ")}` : ""}
      ${input.language ? `Language: ${input.language}` : ""}
      ${input.context ? `Context: ${JSON.stringify(input.context)}` : ""}

      Return up to ${this.config.maxCategories} categories with confidence >= ${this.config.minConfidence}.
    `;

    return `${systemPrompt}\n\n${userPrompt}`;
  }

  /**
   * Simulates AI classification (for development).
   * In production, this would call the actual AI provider.
   */
  private async simulateAIClassification(
    input: ClassificationInput,
    _prompt: string
  ): Promise<ClassificationResult> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simple keyword-based classification for simulation
    const contentLower = (input.content + " " + (input.title || "")).toLowerCase();
    const categories: ClassificationResult["categories"] = [];
    const tags: string[] = [];

    // Detect categories based on keywords
    const categoryKeywords: Record<string, string[]> = {
      technology: ["ai", "software", "code", "programming", "computer", "tech", "api", "data"],
      business: ["revenue", "profit", "market", "company", "enterprise", "strategy"],
      science: ["research", "study", "experiment", "theory", "scientific"],
      health: ["medical", "health", "wellness", "disease", "treatment"],
      education: ["learning", "course", "tutorial", "education", "training"],
      entertainment: ["movie", "music", "game", "fun", "entertainment"],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      const matchCount = keywords.filter(k => contentLower.includes(k)).length;
      if (matchCount > 0) {
        const confidence = Math.min(0.95, 0.5 + matchCount * 0.15);
        if (confidence >= this.config.minConfidence) {
          categories.push({
            id: category,
            name: category.charAt(0).toUpperCase() + category.slice(1),
            confidence,
          });
        }
      }
    }

    // Sort by confidence and limit
    categories.sort((a, b) => b.confidence - a.confidence);
    categories.splice(this.config.maxCategories);

    // Extract tags (simple word extraction)
    const words = contentLower.split(/\s+/);
    const commonWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being"]);
    for (const word of words) {
      if (word.length > 4 && !commonWords.has(word) && tags.length < 10) {
        if (!tags.includes(word)) {
          tags.push(word);
        }
      }
    }

    return {
      categories: categories.length > 0 ? categories : [{ id: "general", name: "General", confidence: 0.5 }],
      tags: tags.slice(0, 5),
      explanation: `Content classified based on keyword analysis. Primary category: ${categories[0]?.name || "General"}`,
      model: this.config.model,
      provider: this.config.provider,
    };
  }

  /**
   * Rule-based classification fallback.
   */
  private ruleBasedClassification(input: ClassificationInput): ClassificationResult {
    // Very simple rule-based fallback
    const categories: ClassificationResult["categories"] = [];
    const contentLower = input.content.toLowerCase();

    // Simple pattern matching
    if (contentLower.includes("error") || contentLower.includes("bug")) {
      categories.push({ id: "technical", name: "Technical", confidence: 0.7 });
    }
    if (contentLower.includes("help") || contentLower.includes("question")) {
      categories.push({ id: "support", name: "Support", confidence: 0.6 });
    }

    if (categories.length === 0) {
      categories.push({ id: "general", name: "General", confidence: 0.5 });
    }

    return {
      categories,
      explanation: "Classified using rule-based fallback (AI unavailable)",
      model: "rules",
      provider: "rule_based",
    };
  }

  /**
   * Gets module statistics.
   */
  getStatistics(): AIModuleStatistics {
    // Update uptime
    this.stats.uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    // Calculate error rate
    this.stats.errorRate = this.stats.totalRequests > 0
      ? this.stats.failedRequests / this.stats.totalRequests
      : 0;

    // Calculate cache hit rate
    const totalCacheOps = this.cacheHits + this.cacheMisses;
    this.stats.cacheHitRate = totalCacheOps > 0 ? this.cacheHits / totalCacheOps : 0;

    // Calculate p95 latency
    if (this.latencies.length > 0) {
      const sorted = [...this.latencies].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      this.stats.p95LatencyMs = sorted[p95Index] || 0;
    }

    return { ...this.stats };
  }

  /**
   * Validates module configuration.
   */
  async validateConfig(config: Record<string, unknown>): Promise<AIConfigValidationResult> {
    const errors: AIConfigValidationResult["errors"] = [];
    const warnings: AIConfigValidationResult["warnings"] = [];

    // Validate provider
    const validProviders: AIProviderType[] = [
      "openai", "anthropic", "google", "cohere", "mistral",
      "huggingface", "local_ollama", "local_llamacpp", "local_mlx",
      "azure_openai", "aws_bedrock", "custom",
    ];

    if (!config.provider || !validProviders.includes(config.provider as AIProviderType)) {
      errors.push({
        path: "provider",
        message: `Invalid provider. Must be one of: ${validProviders.join(", ")}`,
        code: "INVALID_PROVIDER",
      });
    }

    // Validate confidence threshold
    const minConfidence = config.minConfidence as number;
    if (minConfidence !== undefined && (minConfidence < 0 || minConfidence > 1)) {
      errors.push({
        path: "minConfidence",
        message: "Confidence threshold must be between 0 and 1",
        code: "INVALID_CONFIDENCE",
      });
    }

    // Validate max categories
    const maxCategories = config.maxCategories as number;
    if (maxCategories !== undefined && (maxCategories < 1 || maxCategories > 20)) {
      errors.push({
        path: "maxCategories",
        message: "Max categories must be between 1 and 20",
        code: "INVALID_MAX_CATEGORIES",
      });
    }

    // Warnings
    if (!config.apiKeyRef && ["openai", "anthropic", "google", "cohere"].includes(config.provider as string)) {
      warnings.push({
        path: "apiKeyRef",
        message: `API key reference not set for ${config.provider}. Make sure to configure it via environment variables.`,
      });
    }

    if (!config.enableCaching) {
      warnings.push({
        path: "enableCaching",
        message: "Caching is disabled. This may increase costs for repeated classifications.",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Creates an error response.
   */
  private createErrorResponse(
    request: AIModuleRequest,
    code: string,
    message: string,
    startTime: number
  ): AIModuleResponse {
    return {
      requestId: request.requestId,
      success: false,
      error: { code, message },
      metadata: {
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Generates a cache key for the input.
   */
  private generateCacheKey(input: ClassificationInput): string {
    const key = JSON.stringify({
      content: input.content,
      title: input.title,
      categories: input.categories,
      language: input.language,
    });
    return this.hashString(key);
  }

  /**
   * Gets a result from cache.
   */
  private getFromCache(key: string): ClassificationResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Adds a result to cache.
   */
  private addToCache(key: string, result: ClassificationResult): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });

    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  /**
   * Simple string hash.
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Estimates tokens for input.
   */
  private estimateTokens(input: ClassificationInput): number {
    const text = (input.content || "") + (input.title || "");
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimates cost in cents.
   */
  private estimateCost(tokens: number): number {
    // Approximate cost: $0.01 per 1K tokens
    return Math.ceil(tokens * 0.01);
  }

  /**
   * Updates statistics.
   */
  private updateStats(startTime: number, tokens: number, cost: number, cached: boolean): void {
    const latency = Date.now() - startTime;

    if (!cached) {
      this.latencies.push(latency);
      if (this.latencies.length > 1000) {
        this.latencies.shift();
      }

      // Update average latency
      this.stats.averageLatencyMs =
        (this.stats.averageLatencyMs * (this.stats.totalRequests - 1) + latency) /
        this.stats.totalRequests;
    }

    this.stats.totalTokensUsed += tokens;
    this.stats.totalCost += cost;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): ClassificationModuleConfig {
    return { ...this.config };
  }

  /**
   * Checks if the module is healthy.
   */
  isHealthy(): boolean {
    return this.healthy;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates a new classification module instance.
 */
export function createClassificationModule(): ClassificationModule {
  return new ClassificationModule();
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  CLASSIFICATION_MODULE_MANIFEST,
  ClassificationModule,
};
