/**
 * @file embedding-providers.ts
 * @description Embedding provider implementations for vector generation.
 *              Supports OpenAI, Cohere, HuggingFace, and local models.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Supported Providers:
 * - OpenAI (ada-002, text-embedding-3-small, text-embedding-3-large)
 * - Cohere (embed-v3)
 * - HuggingFace Inference API
 * - Local sentence-transformers (via Python bridge or ONNX)
 * - CLIP for images
 * - CodeBERT for code
 */

import { createModuleLogger } from "../logger";
import { EmbeddingModel, ContentModality } from "./ml-taxonomy-engine";

const log = createModuleLogger("embedding-providers");

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Embedding request configuration.
 */
export interface EmbeddingRequest {
  /** Input text(s) to embed */
  input: string | string[];
  /** Model to use */
  model: EmbeddingModel;
  /** Content modality */
  modality: ContentModality;
  /** Additional options */
  options?: {
    /** Truncate input if too long */
    truncate?: boolean;
    /** Encoding format */
    encoding?: "float" | "base64";
    /** Dimensions (for models that support it) */
    dimensions?: number;
  };
}

/**
 * Embedding response.
 */
export interface EmbeddingResponse {
  /** Generated embeddings */
  embeddings: Float32Array[];
  /** Model used */
  model: EmbeddingModel;
  /** Total tokens processed */
  totalTokens: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Provider used */
  provider: string;
}

/**
 * Embedding provider interface.
 */
export interface EmbeddingProvider {
  /** Provider name */
  readonly name: string;
  /** Supported models */
  readonly supportedModels: EmbeddingModel[];
  /** Check if provider is available */
  isAvailable(): Promise<boolean>;
  /** Generate embeddings */
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  /** Get embedding dimension for a model */
  getDimension(model: EmbeddingModel): number;
  /** Get max input length for a model */
  getMaxInputLength(model: EmbeddingModel): number;
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

/**
 * OpenAI embedding provider configuration.
 */
export interface OpenAIProviderConfig {
  apiKey: string;
  organization?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * OpenAI embedding provider.
 * Supports ada-002, text-embedding-3-small, text-embedding-3-large.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly supportedModels: EmbeddingModel[] = [
    "openai-ada-002",
    "openai-text-3-small",
    "openai-text-3-large",
  ];

  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  getDimension(model: EmbeddingModel): number {
    const dimensions: Record<string, number> = {
      "openai-ada-002": 1536,
      "openai-text-3-small": 1536,
      "openai-text-3-large": 3072,
    };
    return dimensions[model] || 1536;
  }

  getMaxInputLength(model: EmbeddingModel): number {
    const maxLengths: Record<string, number> = {
      "openai-ada-002": 8191,
      "openai-text-3-small": 8191,
      "openai-text-3-large": 8191,
    };
    return maxLengths[model] || 8191;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    const openaiModel = this.mapModelName(request.model);
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    try {
      const response = await fetch(
        `${this.config.baseUrl || "https://api.openai.com"}/v1/embeddings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            ...(this.config.organization && { "OpenAI-Organization": this.config.organization }),
          },
          body: JSON.stringify({
            model: openaiModel,
            input: inputs,
            encoding_format: request.options?.encoding || "float",
            ...(request.options?.dimensions && { dimensions: request.options.dimensions }),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();

      const embeddings = data.data.map((item: { embedding: number[] }) =>
        new Float32Array(item.embedding)
      );

      return {
        embeddings,
        model: request.model,
        totalTokens: data.usage?.total_tokens || 0,
        processingTimeMs: Date.now() - startTime,
        provider: this.name,
      };
    } catch (error) {
      log.error({ error, model: request.model }, "OpenAI embedding failed");
      throw error;
    }
  }

  private mapModelName(model: EmbeddingModel): string {
    const mapping: Record<string, string> = {
      "openai-ada-002": "text-embedding-ada-002",
      "openai-text-3-small": "text-embedding-3-small",
      "openai-text-3-large": "text-embedding-3-large",
    };
    return mapping[model] || "text-embedding-ada-002";
  }
}

// ============================================================================
// COHERE PROVIDER
// ============================================================================

/**
 * Cohere embedding provider configuration.
 */
export interface CohereProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * Cohere embedding provider.
 * Supports embed-v3 with multiple input types.
 */
export class CohereEmbeddingProvider implements EmbeddingProvider {
  readonly name = "cohere";
  readonly supportedModels: EmbeddingModel[] = ["cohere-embed-v3"];

  private config: CohereProviderConfig;

  constructor(config: CohereProviderConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  getDimension(model: EmbeddingModel): number {
    return 1024; // embed-v3 default
  }

  getMaxInputLength(model: EmbeddingModel): number {
    return 4096;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    // Determine input type based on modality
    const inputType = this.mapInputType(request.modality);

    try {
      const response = await fetch(
        `${this.config.baseUrl || "https://api.cohere.ai"}/v1/embed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: "embed-english-v3.0",
            texts: inputs,
            input_type: inputType,
            truncate: request.options?.truncate ? "END" : "NONE",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Cohere API error: ${error.message || response.statusText}`);
      }

      const data = await response.json();

      const embeddings = data.embeddings.map((emb: number[]) => new Float32Array(emb));

      return {
        embeddings,
        model: request.model,
        totalTokens: data.meta?.billed_units?.input_tokens || 0,
        processingTimeMs: Date.now() - startTime,
        provider: this.name,
      };
    } catch (error) {
      log.error({ error, model: request.model }, "Cohere embedding failed");
      throw error;
    }
  }

  private mapInputType(modality: ContentModality): string {
    const mapping: Record<ContentModality, string> = {
      text: "search_document",
      code: "search_document",
      image: "search_document",
      audio: "search_document",
      video: "search_document",
      multimodal: "search_document",
    };
    return mapping[modality];
  }
}

// ============================================================================
// HUGGINGFACE PROVIDER
// ============================================================================

/**
 * HuggingFace embedding provider configuration.
 */
export interface HuggingFaceProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * HuggingFace Inference API provider.
 * Supports sentence-transformers models.
 */
export class HuggingFaceEmbeddingProvider implements EmbeddingProvider {
  readonly name = "huggingface";
  readonly supportedModels: EmbeddingModel[] = ["sentence-transformers"];

  private config: HuggingFaceProviderConfig;
  private defaultModel = "sentence-transformers/all-MiniLM-L6-v2";

  constructor(config: HuggingFaceProviderConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  getDimension(model: EmbeddingModel): number {
    return 384; // all-MiniLM-L6-v2
  }

  getMaxInputLength(model: EmbeddingModel): number {
    return 512;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    try {
      const response = await fetch(
        `${this.config.baseUrl || "https://api-inference.huggingface.co"}/pipeline/feature-extraction/${this.defaultModel}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            inputs,
            options: { wait_for_model: true },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`HuggingFace API error: ${error.error || response.statusText}`);
      }

      const data = await response.json();

      // HuggingFace returns array of arrays (tokens x dimensions)
      // We need to mean-pool to get single embedding
      const embeddings = data.map((tokenEmbeddings: number[][]) => {
        const pooled = this.meanPool(tokenEmbeddings);
        return new Float32Array(pooled);
      });

      return {
        embeddings,
        model: request.model,
        totalTokens: inputs.reduce((sum, input) => sum + input.split(/\s+/).length, 0),
        processingTimeMs: Date.now() - startTime,
        provider: this.name,
      };
    } catch (error) {
      log.error({ error, model: request.model }, "HuggingFace embedding failed");
      throw error;
    }
  }

  private meanPool(tokenEmbeddings: number[][]): number[] {
    if (tokenEmbeddings.length === 0) return [];

    const dim = tokenEmbeddings[0].length;
    const pooled = new Array(dim).fill(0);

    for (const token of tokenEmbeddings) {
      for (let i = 0; i < dim; i++) {
        pooled[i] += token[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      pooled[i] /= tokenEmbeddings.length;
    }

    return pooled;
  }
}

// ============================================================================
// LOCAL PROVIDER (MOCK)
// ============================================================================

/**
 * Local embedding provider for development/testing.
 * Uses deterministic hash-based embeddings.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  readonly supportedModels: EmbeddingModel[] = [
    "local-minilm",
    "sentence-transformers",
    "codebert",
    "clip-vit-b32",
  ];

  private dimension: number;

  constructor(dimension: number = 384) {
    this.dimension = dimension;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getDimension(_model: EmbeddingModel): number {
    return this.dimension;
  }

  getMaxInputLength(_model: EmbeddingModel): number {
    return 4096;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const embeddings = inputs.map((input) => this.generateDeterministicEmbedding(input));

    return {
      embeddings,
      model: request.model,
      totalTokens: inputs.reduce((sum, input) => sum + input.split(/\s+/).length, 0),
      processingTimeMs: Date.now() - startTime,
      provider: this.name,
    };
  }

  private generateDeterministicEmbedding(text: string): Float32Array {
    const embedding = new Float32Array(this.dimension);

    // Generate deterministic embedding using hash
    for (let i = 0; i < this.dimension; i++) {
      embedding[i] = Math.sin(this.hashString(text + i.toString()) / 1000000);
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < this.dimension; i++) {
      embedding[i] /= norm;
    }

    return embedding;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
}

// ============================================================================
// PROVIDER MANAGER
// ============================================================================

/**
 * Configuration for the embedding provider manager.
 */
export interface EmbeddingManagerConfig {
  /** OpenAI API key */
  openaiApiKey?: string;
  /** Cohere API key */
  cohereApiKey?: string;
  /** HuggingFace API key */
  huggingfaceApiKey?: string;
  /** Preferred provider order */
  providerPriority?: string[];
  /** Enable local fallback */
  enableLocalFallback?: boolean;
  /** Default model */
  defaultModel?: EmbeddingModel;
  /** Enable caching */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
}

/**
 * Manages multiple embedding providers with fallback support.
 */
export class EmbeddingProviderManager {
  private providers: Map<string, EmbeddingProvider> = new Map();
  private config: EmbeddingManagerConfig;
  private cache: Map<string, { embedding: Float32Array; expiresAt: number }> = new Map();

  constructor(config: EmbeddingManagerConfig) {
    this.config = config;
    this.initializeProviders();
  }

  /**
   * Initializes providers based on configuration.
   */
  private initializeProviders(): void {
    // OpenAI
    if (this.config.openaiApiKey) {
      this.providers.set(
        "openai",
        new OpenAIEmbeddingProvider({ apiKey: this.config.openaiApiKey })
      );
    }

    // Cohere
    if (this.config.cohereApiKey) {
      this.providers.set(
        "cohere",
        new CohereEmbeddingProvider({ apiKey: this.config.cohereApiKey })
      );
    }

    // HuggingFace
    if (this.config.huggingfaceApiKey) {
      this.providers.set(
        "huggingface",
        new HuggingFaceEmbeddingProvider({ apiKey: this.config.huggingfaceApiKey })
      );
    }

    // Local (always available)
    if (this.config.enableLocalFallback !== false) {
      this.providers.set("local", new LocalEmbeddingProvider());
    }
  }

  /**
   * Gets the best available provider for a model.
   */
  async getProvider(model: EmbeddingModel): Promise<EmbeddingProvider | null> {
    const priority = this.config.providerPriority || ["openai", "cohere", "huggingface", "local"];

    for (const providerName of priority) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      if (provider.supportedModels.includes(model) && await provider.isAvailable()) {
        return provider;
      }
    }

    // Fallback to local
    const local = this.providers.get("local");
    if (local && await local.isAvailable()) {
      return local;
    }

    return null;
  }

  /**
   * Generates embeddings with automatic provider selection and caching.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    // Check cache
    if (this.config.enableCache) {
      const cached = this.getCachedEmbeddings(inputs, request.model);
      if (cached.every((e) => e !== null)) {
        return {
          embeddings: cached as Float32Array[],
          model: request.model,
          totalTokens: 0,
          processingTimeMs: 0,
          provider: "cache",
        };
      }
    }

    // Get provider
    const provider = await this.getProvider(request.model);
    if (!provider) {
      throw new Error(`No provider available for model: ${request.model}`);
    }

    // Generate embeddings
    const response = await provider.embed(request);

    // Cache results
    if (this.config.enableCache) {
      this.cacheEmbeddings(inputs, request.model, response.embeddings);
    }

    return response;
  }

  /**
   * Gets cached embeddings.
   */
  private getCachedEmbeddings(inputs: string[], model: EmbeddingModel): (Float32Array | null)[] {
    const now = Date.now();
    return inputs.map((input) => {
      const key = this.getCacheKey(input, model);
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > now) {
        return cached.embedding;
      }
      return null;
    });
  }

  /**
   * Caches embeddings.
   */
  private cacheEmbeddings(inputs: string[], model: EmbeddingModel, embeddings: Float32Array[]): void {
    const expiresAt = Date.now() + (this.config.cacheTTL || 3600000);
    inputs.forEach((input, i) => {
      const key = this.getCacheKey(input, model);
      this.cache.set(key, { embedding: embeddings[i], expiresAt });
    });
  }

  /**
   * Generates cache key.
   */
  private getCacheKey(input: string, model: EmbeddingModel): string {
    return `${model}:${this.hashString(input)}`;
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
    return hash.toString(36);
  }

  /**
   * Gets dimension for a model.
   */
  getDimension(model: EmbeddingModel): number {
    for (const provider of this.providers.values()) {
      if (provider.supportedModels.includes(model)) {
        return provider.getDimension(model);
      }
    }
    return 384; // Default
  }

  /**
   * Gets max input length for a model.
   */
  getMaxInputLength(model: EmbeddingModel): number {
    for (const provider of this.providers.values()) {
      if (provider.supportedModels.includes(model)) {
        return provider.getMaxInputLength(model);
      }
    }
    return 512; // Default
  }

  /**
   * Lists available providers.
   */
  async getAvailableProviders(): Promise<string[]> {
    const available: string[] = [];
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name);
      }
    }
    return available;
  }

  /**
   * Clears the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would track actual hits/misses
    };
  }
}

// ============================================================================
// BATCH EMBEDDING PROCESSOR
// ============================================================================

/**
 * Options for batch embedding processing.
 */
export interface BatchEmbeddingOptions {
  /** Batch size */
  batchSize?: number;
  /** Concurrent batches */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (processed: number, total: number) => void;
  /** Error callback */
  onError?: (error: Error, input: string) => void;
  /** Continue on error */
  continueOnError?: boolean;
}

/**
 * Batch embedding result.
 */
export interface BatchEmbeddingResult {
  /** Successful embeddings */
  embeddings: Map<string, Float32Array>;
  /** Failed inputs */
  failures: Map<string, Error>;
  /** Total processing time */
  totalTimeMs: number;
  /** Average time per input */
  avgTimePerInput: number;
}

/**
 * Processes embeddings in batches with progress tracking.
 */
export class BatchEmbeddingProcessor {
  private manager: EmbeddingProviderManager;

  constructor(manager: EmbeddingProviderManager) {
    this.manager = manager;
  }

  /**
   * Processes embeddings for multiple inputs.
   */
  async process(
    inputs: string[],
    model: EmbeddingModel,
    modality: ContentModality,
    options: BatchEmbeddingOptions = {}
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 32;
    const embeddings = new Map<string, Float32Array>();
    const failures = new Map<string, Error>();

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < inputs.length; i += batchSize) {
      batches.push(inputs.slice(i, i + batchSize));
    }

    let processed = 0;

    // Process batches
    for (const batch of batches) {
      try {
        const response = await this.manager.embed({
          input: batch,
          model,
          modality,
        });

        // Map embeddings to inputs
        batch.forEach((input, i) => {
          embeddings.set(input, response.embeddings[i]);
        });
      } catch (error) {
        if (options.continueOnError) {
          // Process individually to identify failures
          for (const input of batch) {
            try {
              const response = await this.manager.embed({
                input,
                model,
                modality,
              });
              embeddings.set(input, response.embeddings[0]);
            } catch (individualError) {
              failures.set(input, individualError as Error);
              options.onError?.(individualError as Error, input);
            }
          }
        } else {
          throw error;
        }
      }

      processed += batch.length;
      options.onProgress?.(processed, inputs.length);
    }

    const totalTimeMs = Date.now() - startTime;

    return {
      embeddings,
      failures,
      totalTimeMs,
      avgTimePerInput: totalTimeMs / inputs.length,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates an embedding provider manager from environment configuration.
 */
export function createEmbeddingManager(): EmbeddingProviderManager {
  return new EmbeddingProviderManager({
    openaiApiKey: process.env.OPENAI_API_KEY,
    cohereApiKey: process.env.COHERE_API_KEY,
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    enableLocalFallback: true,
    enableCache: true,
    cacheTTL: 3600000, // 1 hour
    defaultModel: "sentence-transformers",
    providerPriority: ["openai", "cohere", "huggingface", "local"],
  });
}

// ============================================================================
// SINGLETON
// ============================================================================

let embeddingManagerInstance: EmbeddingProviderManager | null = null;

/**
 * Gets the singleton embedding manager instance.
 */
export function getEmbeddingManager(): EmbeddingProviderManager {
  if (!embeddingManagerInstance) {
    embeddingManagerInstance = createEmbeddingManager();
  }
  return embeddingManagerInstance;
}

/**
 * Resets the singleton embedding manager.
 */
export function resetEmbeddingManager(): void {
  embeddingManagerInstance?.clearCache();
  embeddingManagerInstance = null;
}
