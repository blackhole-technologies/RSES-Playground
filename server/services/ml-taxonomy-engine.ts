/**
 * @file ml-taxonomy-engine.ts
 * @description ML-Enhanced Taxonomy Engine with neural classification, embeddings,
 *              auto-learning, and cross-modal classification.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Architecture Overview:
 * =====================
 *
 * 1. Hybrid Classification Pipeline
 *    - Rule-based (RSES) for deterministic classification
 *    - Neural network for probabilistic classification
 *    - Embedding similarity for semantic matching
 *    - Ensemble voting for final decision
 *
 * 2. Embedding System
 *    - Content vectorization for similarity search
 *    - Cluster detection for taxonomy discovery
 *    - Anomaly detection for unusual content
 *
 * 3. Auto-Taxonomy Learning
 *    - Discovers new categories from content clusters
 *    - Suggests taxonomy restructuring
 *    - Merges similar terms
 *    - Detects trending topics
 *
 * 4. Federated Learning
 *    - Learn from user corrections privately
 *    - A/B test classification models
 *    - Continuous model improvement
 *
 * 5. Cross-Modal Classification
 *    - Text (BERT/RoBERTa)
 *    - Code (CodeBERT)
 *    - Images (CLIP)
 *    - Multi-modal fusion
 */

import { EventEmitter } from "events";
import {
  TaxonomyEngine,
  ContentItem,
  ClassificationResult,
  Term,
  TermAssignment,
  ClassificationOptions,
  ClassificationConflict,
} from "./taxonomy-engine";
import { RsesConfig, TestMatchResponse } from "../lib/rses";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("ml-taxonomy-engine");

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

/**
 * Represents a vector embedding of content.
 */
export interface Embedding {
  /** Content identifier */
  contentId: string;
  /** Vector representation */
  vector: Float32Array;
  /** Model used to generate embedding */
  model: EmbeddingModel;
  /** Modality of the content */
  modality: ContentModality;
  /** Timestamp of generation */
  generatedAt: Date;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Supported embedding models.
 */
export type EmbeddingModel =
  | "openai-ada-002"
  | "openai-text-3-small"
  | "openai-text-3-large"
  | "sentence-transformers"
  | "cohere-embed-v3"
  | "clip-vit-b32"
  | "codebert"
  | "local-minilm";

/**
 * Content modalities for cross-modal classification.
 */
export type ContentModality =
  | "text"
  | "code"
  | "image"
  | "audio"
  | "video"
  | "multimodal";

/**
 * Configuration for embedding generation.
 */
export interface EmbeddingConfig {
  /** Primary model for text embeddings */
  textModel: EmbeddingModel;
  /** Model for code embeddings */
  codeModel: EmbeddingModel;
  /** Model for image embeddings */
  imageModel: EmbeddingModel;
  /** Embedding dimension */
  dimension: number;
  /** Batch size for embedding generation */
  batchSize: number;
  /** Enable local caching */
  enableCache: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL: number;
  /** Normalize embeddings */
  normalize: boolean;
}

// ============================================================================
// NEURAL CLASSIFIER TYPES
// ============================================================================

/**
 * Neural classification result.
 */
export interface NeuralClassificationResult {
  /** Predicted categories with probabilities */
  predictions: CategoryPrediction[];
  /** Raw model output logits */
  logits?: number[];
  /** Attention weights (if available) */
  attention?: AttentionWeights;
  /** Model confidence */
  confidence: number;
  /** Inference time in milliseconds */
  inferenceTimeMs: number;
}

/**
 * Category prediction with probability.
 */
export interface CategoryPrediction {
  /** Category ID */
  categoryId: string;
  /** Category name */
  categoryName: string;
  /** Prediction probability (0-1) */
  probability: number;
  /** Whether this exceeds the threshold */
  selected: boolean;
  /** Explanation for the prediction */
  explanation?: string;
}

/**
 * Attention weights for explainability.
 */
export interface AttentionWeights {
  /** Token-level attention */
  tokens: Array<{ token: string; weight: number }>;
  /** Layer-wise attention */
  layers?: number[][];
}

/**
 * Neural classifier configuration.
 */
export interface NeuralClassifierConfig {
  /** Model identifier */
  modelId: string;
  /** Model type */
  modelType: "bert" | "roberta" | "distilbert" | "custom";
  /** Classification threshold */
  threshold: number;
  /** Enable multi-label classification */
  multiLabel: boolean;
  /** Max sequence length */
  maxLength: number;
  /** Use GPU acceleration */
  useGPU: boolean;
  /** Temperature for softmax */
  temperature: number;
}

// ============================================================================
// ENSEMBLE STRATEGY TYPES
// ============================================================================

/**
 * Strategies for combining classifier outputs.
 */
export type EnsembleStrategy =
  | "weighted_average"      // Weighted average of probabilities
  | "voting"                // Majority voting
  | "stacking"              // Meta-learner on classifier outputs
  | "rule_priority"         // Rules override ML when confident
  | "ml_priority"           // ML overrides rules when confident
  | "cascade"               // Sequential with early exit
  | "dynamic";              // Learn optimal strategy

/**
 * Ensemble configuration.
 */
export interface EnsembleConfig {
  /** Strategy to use */
  strategy: EnsembleStrategy;
  /** Weights for each classifier (for weighted_average) */
  weights: {
    rules: number;
    neural: number;
    embedding: number;
  };
  /** Confidence threshold for rule_priority/ml_priority */
  confidenceThreshold: number;
  /** Enable disagreement detection */
  detectDisagreements: boolean;
  /** Minimum classifiers that must agree */
  minAgreement: number;
}

// ============================================================================
// HYBRID CLASSIFICATION PIPELINE
// ============================================================================

/**
 * Complete classification pipeline result.
 */
export interface HybridClassificationResult extends ClassificationResult {
  /** Rule-based classification output */
  rulesBased: {
    result: TestMatchResponse;
    confidence: number;
  };
  /** Neural classification output */
  neural: NeuralClassificationResult | null;
  /** Embedding-based similarity results */
  embeddingSimilarity: SimilarityResult[];
  /** Ensemble decision metadata */
  ensemble: {
    strategy: EnsembleStrategy;
    classifierAgreement: number;
    disagreements: ClassifierDisagreement[];
    finalConfidence: number;
  };
  /** Explainability data */
  explanation: ClassificationExplanation;
}

/**
 * Similarity search result.
 */
export interface SimilarityResult {
  /** Similar content ID */
  contentId: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Categories of similar content */
  categories: string[];
  /** Embedding model used */
  model: EmbeddingModel;
}

/**
 * Classifier disagreement record.
 */
export interface ClassifierDisagreement {
  /** Category in question */
  category: string;
  /** Classifier predictions */
  predictions: {
    rules: { predicted: boolean; confidence: number };
    neural: { predicted: boolean; confidence: number };
    embedding: { predicted: boolean; confidence: number };
  };
  /** Resolution method */
  resolution: "rules_override" | "neural_override" | "voting" | "manual";
}

/**
 * Explanation for classification decision.
 */
export interface ClassificationExplanation {
  /** Top contributing features */
  topFeatures: Array<{ feature: string; importance: number; direction: "positive" | "negative" }>;
  /** Similar training examples */
  similarExamples: Array<{ contentId: string; similarity: number; category: string }>;
  /** Rule matches */
  ruleMatches: Array<{ rule: string; matched: boolean; confidence: number }>;
  /** Attention visualization data */
  attention?: AttentionWeights;
  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// AUTO-TAXONOMY LEARNING
// ============================================================================

/**
 * Discovered taxonomy cluster.
 */
export interface TaxonomyCluster {
  /** Cluster ID */
  id: string;
  /** Cluster centroid embedding */
  centroid: Float32Array;
  /** Member content IDs */
  members: string[];
  /** Suggested category name */
  suggestedName: string;
  /** Confidence in the cluster */
  confidence: number;
  /** Keywords extracted from cluster */
  keywords: string[];
  /** Parent category suggestion */
  suggestedParent?: string;
  /** Discovered timestamp */
  discoveredAt: Date;
}

/**
 * Taxonomy restructuring suggestion.
 */
export interface TaxonomyRestructuringSuggestion {
  /** Suggestion type */
  type: "merge" | "split" | "move" | "create" | "delete" | "rename";
  /** Source category/categories */
  source: string[];
  /** Target category (for merge, move) */
  target?: string;
  /** Suggested new name (for rename, create) */
  suggestedName?: string;
  /** Confidence in the suggestion */
  confidence: number;
  /** Rationale */
  rationale: string;
  /** Affected content count */
  affectedContentCount: number;
  /** Impact score (0-1) */
  impactScore: number;
  /** Whether this is reversible */
  reversible: boolean;
}

/**
 * Trending topic detection result.
 */
export interface TrendingTopic {
  /** Topic name */
  name: string;
  /** Current velocity (growth rate) */
  velocity: number;
  /** Volume in recent period */
  volume: number;
  /** First seen timestamp */
  firstSeen: Date;
  /** Peak timestamp */
  peakTime?: Date;
  /** Related existing categories */
  relatedCategories: string[];
  /** Predicted trajectory */
  trajectory: "rising" | "stable" | "declining";
  /** Should create new category? */
  suggestNewCategory: boolean;
}

/**
 * Auto-taxonomy configuration.
 */
export interface AutoTaxonomyConfig {
  /** Enable automatic discovery */
  enableAutoDiscovery: boolean;
  /** Minimum cluster size */
  minClusterSize: number;
  /** Clustering algorithm */
  clusteringAlgorithm: "kmeans" | "dbscan" | "hdbscan" | "agglomerative";
  /** Similarity threshold for clustering */
  similarityThreshold: number;
  /** Enable term merging suggestions */
  enableMergeSuggestions: boolean;
  /** Merge similarity threshold */
  mergeSimilarityThreshold: number;
  /** Enable trend detection */
  enableTrendDetection: boolean;
  /** Trend detection window (days) */
  trendWindowDays: number;
  /** Require human approval for changes */
  requireApproval: boolean;
}

// ============================================================================
// FEDERATED LEARNING
// ============================================================================

/**
 * User correction for federated learning.
 */
export interface UserCorrection {
  /** Correction ID */
  id: string;
  /** Content ID */
  contentId: string;
  /** Original classification */
  original: string[];
  /** Corrected classification */
  corrected: string[];
  /** User ID (anonymized) */
  userId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Context (why correction was made) */
  context?: string;
}

/**
 * Federated learning update package.
 */
export interface FederatedUpdate {
  /** Update ID */
  id: string;
  /** Model gradients (encrypted/differential) */
  gradients: Float32Array;
  /** Number of samples used */
  sampleCount: number;
  /** Privacy budget spent (differential privacy) */
  privacyBudget: number;
  /** Timestamp */
  timestamp: Date;
  /** Client ID (anonymous) */
  clientId: string;
}

/**
 * A/B test configuration.
 */
export interface ABTestConfig {
  /** Test ID */
  id: string;
  /** Test name */
  name: string;
  /** Control model */
  controlModel: string;
  /** Treatment model */
  treatmentModel: string;
  /** Traffic split (0-1 for treatment) */
  treatmentSplit: number;
  /** Primary metric */
  primaryMetric: "accuracy" | "f1" | "user_corrections" | "engagement";
  /** Start time */
  startTime: Date;
  /** End time (null = ongoing) */
  endTime: Date | null;
  /** Minimum samples for significance */
  minSamples: number;
}

/**
 * A/B test results.
 */
export interface ABTestResults {
  /** Test ID */
  testId: string;
  /** Control metrics */
  control: {
    samples: number;
    metricValue: number;
    confidenceInterval: [number, number];
  };
  /** Treatment metrics */
  treatment: {
    samples: number;
    metricValue: number;
    confidenceInterval: [number, number];
  };
  /** Relative lift */
  lift: number;
  /** Statistical significance (p-value) */
  pValue: number;
  /** Whether to declare winner */
  significant: boolean;
  /** Recommended action */
  recommendation: "continue" | "stop_treatment" | "deploy_treatment";
}

/**
 * Federated learning configuration.
 */
export interface FederatedLearningConfig {
  /** Enable federated learning */
  enabled: boolean;
  /** Minimum corrections before learning */
  minCorrectionsForUpdate: number;
  /** Differential privacy epsilon */
  privacyEpsilon: number;
  /** Enable secure aggregation */
  secureAggregation: boolean;
  /** Local epochs before sync */
  localEpochs: number;
  /** Learning rate */
  learningRate: number;
  /** Enable A/B testing */
  enableABTesting: boolean;
}

// ============================================================================
// CROSS-MODAL CLASSIFICATION
// ============================================================================

/**
 * Multi-modal content for classification.
 */
export interface MultiModalContent extends ContentItem {
  /** Text content */
  text?: string;
  /** Code content */
  code?: {
    language: string;
    source: string;
  };
  /** Image content */
  image?: {
    path: string;
    mimeType: string;
    dimensions?: { width: number; height: number };
  };
  /** Audio content */
  audio?: {
    path: string;
    mimeType: string;
    duration?: number;
  };
  /** Video content */
  video?: {
    path: string;
    mimeType: string;
    duration?: number;
  };
  /** Primary modality */
  primaryModality: ContentModality;
}

/**
 * Cross-modal classification result.
 */
export interface CrossModalClassificationResult {
  /** Individual modality results */
  modalities: {
    text?: NeuralClassificationResult;
    code?: NeuralClassificationResult;
    image?: NeuralClassificationResult;
    audio?: NeuralClassificationResult;
    video?: NeuralClassificationResult;
  };
  /** Fused result */
  fused: {
    predictions: CategoryPrediction[];
    confidence: number;
    fusionMethod: "late" | "early" | "attention";
  };
  /** Cross-modal consistency score */
  consistency: number;
}

// ============================================================================
// VECTOR DATABASE INTERFACE
// ============================================================================

/**
 * Vector database abstraction for embedding storage.
 */
export interface VectorDatabase {
  /** Insert embedding */
  insert(embedding: Embedding): Promise<void>;
  /** Batch insert */
  batchInsert(embeddings: Embedding[]): Promise<void>;
  /** Search by similarity */
  search(query: Float32Array, options: VectorSearchOptions): Promise<VectorSearchResult[]>;
  /** Get embedding by content ID */
  get(contentId: string): Promise<Embedding | null>;
  /** Delete embedding */
  delete(contentId: string): Promise<void>;
  /** Update embedding */
  update(embedding: Embedding): Promise<void>;
  /** Get cluster centroids */
  getClusters(k: number): Promise<ClusterCentroid[]>;
  /** Get nearest neighbors */
  nearestNeighbors(contentId: string, k: number): Promise<VectorSearchResult[]>;
}

/**
 * Vector search options.
 */
export interface VectorSearchOptions {
  /** Number of results */
  topK: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Filter by metadata */
  filter?: Record<string, unknown>;
  /** Include embeddings in results */
  includeEmbeddings?: boolean;
}

/**
 * Vector search result.
 */
export interface VectorSearchResult {
  /** Content ID */
  contentId: string;
  /** Similarity score */
  similarity: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Embedding (if requested) */
  embedding?: Float32Array;
}

/**
 * Cluster centroid.
 */
export interface ClusterCentroid {
  /** Cluster ID */
  clusterId: number;
  /** Centroid vector */
  centroid: Float32Array;
  /** Member count */
  memberCount: number;
  /** Representative content IDs */
  representatives: string[];
}

// ============================================================================
// ML TAXONOMY ENGINE
// ============================================================================

/**
 * Configuration for the ML-enhanced taxonomy engine.
 */
export interface MLTaxonomyEngineConfig {
  /** Base taxonomy engine config */
  rsesConfig: RsesConfig;
  /** Embedding configuration */
  embedding: EmbeddingConfig;
  /** Neural classifier configuration */
  neural: NeuralClassifierConfig;
  /** Ensemble configuration */
  ensemble: EnsembleConfig;
  /** Auto-taxonomy configuration */
  autoTaxonomy: AutoTaxonomyConfig;
  /** Federated learning configuration */
  federatedLearning: FederatedLearningConfig;
  /** Enable cross-modal classification */
  enableCrossModal: boolean;
  /** Symlink base directory */
  symlinkBaseDir: string;
}

/**
 * Events emitted by the ML taxonomy engine.
 */
export interface MLTaxonomyEngineEvents {
  /** Classification completed with ML */
  "ml:classified": (result: HybridClassificationResult) => void;
  /** New cluster discovered */
  "taxonomy:cluster_discovered": (cluster: TaxonomyCluster) => void;
  /** Restructuring suggested */
  "taxonomy:restructuring_suggested": (suggestion: TaxonomyRestructuringSuggestion) => void;
  /** Trending topic detected */
  "taxonomy:trending_detected": (trend: TrendingTopic) => void;
  /** User correction received */
  "learning:correction_received": (correction: UserCorrection) => void;
  /** Model updated via federated learning */
  "learning:model_updated": (update: FederatedUpdate) => void;
  /** A/B test result available */
  "learning:ab_test_result": (result: ABTestResults) => void;
  /** Anomaly detected */
  "anomaly:detected": (contentId: string, score: number) => void;
  /** Error occurred */
  "error": (error: Error, context?: string) => void;
}

/**
 * ML-Enhanced Taxonomy Engine.
 * Extends the base TaxonomyEngine with machine learning capabilities.
 */
export class MLTaxonomyEngine extends EventEmitter {
  private config: MLTaxonomyEngineConfig;
  private baseEngine: TaxonomyEngine;
  private vectorDb: VectorDatabase | null = null;
  private initialized: boolean = false;

  // Caches
  private embeddingCache: Map<string, Embedding> = new Map();
  private classificationCache: Map<string, HybridClassificationResult> = new Map();

  // Learning state
  private corrections: UserCorrection[] = [];
  private abTests: Map<string, ABTestConfig> = new Map();

  // Auto-taxonomy state
  private discoveredClusters: TaxonomyCluster[] = [];
  private pendingSuggestions: TaxonomyRestructuringSuggestion[] = [];

  constructor(config: MLTaxonomyEngineConfig, baseEngine: TaxonomyEngine) {
    super();
    this.config = config;
    this.baseEngine = baseEngine;
  }

  /**
   * Initializes the ML taxonomy engine.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn("ML engine already initialized");
      return;
    }

    log.info("Initializing ML taxonomy engine");

    // Initialize vector database (placeholder - would connect to Pinecone/Weaviate)
    this.vectorDb = this.createInMemoryVectorDb();

    // Set up base engine event forwarding
    this.setupBaseEngineEvents();

    this.initialized = true;
    log.info("ML taxonomy engine initialized");
  }

  /**
   * Creates an in-memory vector database for development.
   * Production would use Pinecone, Weaviate, or similar.
   */
  private createInMemoryVectorDb(): VectorDatabase {
    const embeddings = new Map<string, Embedding>();

    return {
      async insert(embedding: Embedding): Promise<void> {
        embeddings.set(embedding.contentId, embedding);
      },

      async batchInsert(batch: Embedding[]): Promise<void> {
        for (const e of batch) {
          embeddings.set(e.contentId, e);
        }
      },

      async search(query: Float32Array, options: VectorSearchOptions): Promise<VectorSearchResult[]> {
        const results: VectorSearchResult[] = [];

        for (const [contentId, embedding] of embeddings) {
          const similarity = cosineSimilarity(query, embedding.vector);
          if (!options.minSimilarity || similarity >= options.minSimilarity) {
            results.push({
              contentId,
              similarity,
              metadata: embedding.metadata,
              embedding: options.includeEmbeddings ? embedding.vector : undefined,
            });
          }
        }

        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, options.topK);
      },

      async get(contentId: string): Promise<Embedding | null> {
        return embeddings.get(contentId) || null;
      },

      async delete(contentId: string): Promise<void> {
        embeddings.delete(contentId);
      },

      async update(embedding: Embedding): Promise<void> {
        embeddings.set(embedding.contentId, embedding);
      },

      async getClusters(k: number): Promise<ClusterCentroid[]> {
        // Simple k-means clustering placeholder
        // Production would use proper clustering algorithms
        return [];
      },

      async nearestNeighbors(contentId: string, k: number): Promise<VectorSearchResult[]> {
        const embedding = embeddings.get(contentId);
        if (!embedding) return [];
        return this.search(embedding.vector, { topK: k + 1 }).then(
          (results) => results.filter((r) => r.contentId !== contentId)
        );
      },
    };
  }

  /**
   * Sets up event forwarding from base engine.
   */
  private setupBaseEngineEvents(): void {
    this.baseEngine.on("content:classified", (result: ClassificationResult) => {
      // Enhance with ML if available
      // This is handled in the classify method
    });

    this.baseEngine.on("error", (error: Error, context?: string) => {
      this.emit("error", error, context);
    });
  }

  /**
   * Classifies content using the hybrid pipeline.
   */
  async classify(
    content: ContentItem | MultiModalContent,
    options: ClassificationOptions & { skipML?: boolean } = {}
  ): Promise<HybridClassificationResult> {
    const startTime = Date.now();

    // 1. Get rule-based classification
    const rulesResult = await this.baseEngine.classify(content, options);

    // If ML is skipped, return base result
    if (options.skipML) {
      return this.createHybridResult(rulesResult, null, [], {
        strategy: this.config.ensemble.strategy,
        classifierAgreement: 1,
        disagreements: [],
        finalConfidence: 1,
      });
    }

    // 2. Generate embedding if not cached
    const embedding = await this.getOrGenerateEmbedding(content);

    // 3. Get neural classification (placeholder - would call actual model)
    const neuralResult = await this.runNeuralClassification(content);

    // 4. Get embedding similarity results
    const similarityResults = await this.findSimilarContent(embedding, 10);

    // 5. Run ensemble
    const ensembleResult = this.runEnsemble(rulesResult, neuralResult, similarityResults);

    // 6. Generate explanation
    const explanation = this.generateExplanation(rulesResult, neuralResult, similarityResults);

    // 7. Check for anomalies
    await this.detectAnomalies(content, embedding, rulesResult);

    // 8. Update auto-taxonomy if enabled
    if (this.config.autoTaxonomy.enableAutoDiscovery) {
      await this.updateAutoTaxonomy(content, embedding, ensembleResult);
    }

    const result = this.createHybridResult(rulesResult, neuralResult, similarityResults, {
      strategy: this.config.ensemble.strategy,
      classifierAgreement: ensembleResult.agreement,
      disagreements: ensembleResult.disagreements,
      finalConfidence: ensembleResult.confidence,
    });

    result.explanation = explanation;

    // Cache result
    this.classificationCache.set(content.id, result);

    this.emit("ml:classified", result);

    log.debug({ contentId: content.id, duration: Date.now() - startTime }, "ML classification completed");

    return result;
  }

  /**
   * Gets or generates embedding for content.
   */
  private async getOrGenerateEmbedding(content: ContentItem | MultiModalContent): Promise<Embedding> {
    // Check cache
    const cached = this.embeddingCache.get(content.id);
    if (cached) return cached;

    // Check vector db
    if (this.vectorDb) {
      const stored = await this.vectorDb.get(content.id);
      if (stored) {
        this.embeddingCache.set(content.id, stored);
        return stored;
      }
    }

    // Generate new embedding
    const embedding = await this.generateEmbedding(content);

    // Store
    if (this.vectorDb) {
      await this.vectorDb.insert(embedding);
    }
    this.embeddingCache.set(content.id, embedding);

    return embedding;
  }

  /**
   * Generates embedding for content.
   * Placeholder - would call actual embedding API.
   */
  private async generateEmbedding(content: ContentItem | MultiModalContent): Promise<Embedding> {
    // Determine modality
    const modality = this.detectModality(content);

    // Generate embedding based on modality
    // This is a placeholder - production would call OpenAI/Cohere/local model
    const dimension = this.config.embedding.dimension;
    const vector = new Float32Array(dimension);

    // Simple hash-based embedding for development
    const text = content.name + (content.attributes ? JSON.stringify(content.attributes) : "");
    for (let i = 0; i < dimension; i++) {
      vector[i] = Math.sin(this.hashCode(text + i) / 1000000);
    }

    // Normalize
    if (this.config.embedding.normalize) {
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      for (let i = 0; i < dimension; i++) {
        vector[i] /= norm;
      }
    }

    return {
      contentId: content.id,
      vector,
      model: this.config.embedding.textModel,
      modality,
      generatedAt: new Date(),
      metadata: {
        contentName: content.name,
        attributes: content.attributes,
      },
    };
  }

  /**
   * Detects content modality.
   */
  private detectModality(content: ContentItem | MultiModalContent): ContentModality {
    if ("primaryModality" in content) {
      return content.primaryModality;
    }

    // Detect from attributes or name
    const path = content.path || content.name;
    const ext = path.split(".").pop()?.toLowerCase();

    if (ext) {
      if (["ts", "js", "py", "java", "go", "rs", "cpp", "c", "rb"].includes(ext)) {
        return "code";
      }
      if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) {
        return "image";
      }
      if (["mp3", "wav", "ogg", "flac"].includes(ext)) {
        return "audio";
      }
      if (["mp4", "webm", "avi", "mov"].includes(ext)) {
        return "video";
      }
    }

    return "text";
  }

  /**
   * Simple hash function for development embedding.
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Runs neural classification.
   * Placeholder - would call actual model inference.
   */
  private async runNeuralClassification(content: ContentItem | MultiModalContent): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    // Placeholder implementation
    // Production would call HuggingFace Transformers, OpenAI, or local model
    const predictions: CategoryPrediction[] = [];

    // Simulate predictions based on content name patterns
    const nameLower = content.name.toLowerCase();

    // Add predictions based on simple heuristics (placeholder for real model)
    if (nameLower.includes("ai") || nameLower.includes("ml") || nameLower.includes("machine")) {
      predictions.push({
        categoryId: "ai",
        categoryName: "Artificial Intelligence",
        probability: 0.85 + Math.random() * 0.1,
        selected: true,
        explanation: "Content name contains AI/ML keywords",
      });
    }

    if (nameLower.includes("web") || nameLower.includes("react") || nameLower.includes("vue")) {
      predictions.push({
        categoryId: "web",
        categoryName: "Web Development",
        probability: 0.8 + Math.random() * 0.15,
        selected: true,
        explanation: "Content name contains web framework keywords",
      });
    }

    // Add a default prediction if nothing matched
    if (predictions.length === 0) {
      predictions.push({
        categoryId: "general",
        categoryName: "General",
        probability: 0.5,
        selected: false,
        explanation: "No strong category signals detected",
      });
    }

    // Sort by probability
    predictions.sort((a, b) => b.probability - a.probability);

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Finds similar content using embeddings.
   */
  private async findSimilarContent(embedding: Embedding, k: number): Promise<SimilarityResult[]> {
    if (!this.vectorDb) return [];

    const results = await this.vectorDb.search(embedding.vector, {
      topK: k,
      minSimilarity: 0.5,
    });

    // Enrich with category information
    return results.map((r) => ({
      contentId: r.contentId,
      similarity: r.similarity,
      categories: [], // Would look up actual categories
      model: this.config.embedding.textModel,
    }));
  }

  /**
   * Runs ensemble combination of classifiers.
   */
  private runEnsemble(
    rulesResult: ClassificationResult,
    neuralResult: NeuralClassificationResult | null,
    similarityResults: SimilarityResult[]
  ): {
    categories: string[];
    confidence: number;
    agreement: number;
    disagreements: ClassifierDisagreement[];
  } {
    const { strategy, weights, confidenceThreshold } = this.config.ensemble;
    const disagreements: ClassifierDisagreement[] = [];

    // Collect all categories from all sources
    const allCategories = new Set<string>();

    // From rules
    for (const assignment of rulesResult.termAssignments) {
      allCategories.add(assignment.termValue);
    }

    // From neural
    if (neuralResult) {
      for (const pred of neuralResult.predictions) {
        if (pred.selected) {
          allCategories.add(pred.categoryId);
        }
      }
    }

    // Calculate final categories based on strategy
    const finalCategories: string[] = [];
    let totalConfidence = 0;
    let agreementCount = 0;

    for (const category of allCategories) {
      const rulesHas = rulesResult.termAssignments.some((a) => a.termValue === category);
      const rulesConf = rulesHas ? 1 : 0;

      const neuralPred = neuralResult?.predictions.find((p) => p.categoryId === category);
      const neuralConf = neuralPred?.probability || 0;

      // Calculate embedding confidence based on similarity results
      // (simplified - would be more sophisticated in production)
      const embeddingConf = similarityResults.length > 0 ? 0.5 : 0;

      // Apply strategy
      let include = false;
      let confidence = 0;

      switch (strategy) {
        case "weighted_average":
          confidence =
            rulesConf * weights.rules +
            neuralConf * weights.neural +
            embeddingConf * weights.embedding;
          include = confidence >= confidenceThreshold;
          break;

        case "voting":
          const votes = [rulesConf > 0.5, neuralConf > 0.5, embeddingConf > 0.5].filter(Boolean).length;
          include = votes >= this.config.ensemble.minAgreement;
          confidence = votes / 3;
          break;

        case "rule_priority":
          if (rulesConf >= confidenceThreshold) {
            include = true;
            confidence = rulesConf;
          } else {
            confidence = neuralConf;
            include = neuralConf >= confidenceThreshold;
          }
          break;

        case "ml_priority":
          if (neuralConf >= confidenceThreshold) {
            include = true;
            confidence = neuralConf;
          } else {
            confidence = rulesConf;
            include = rulesConf >= confidenceThreshold;
          }
          break;

        case "cascade":
          // Rules first, then neural if uncertain
          if (rulesConf > 0) {
            include = true;
            confidence = rulesConf;
          } else if (neuralConf >= confidenceThreshold) {
            include = true;
            confidence = neuralConf;
          }
          break;

        default:
          // Default to weighted average
          confidence = (rulesConf + neuralConf + embeddingConf) / 3;
          include = confidence >= confidenceThreshold;
      }

      if (include) {
        finalCategories.push(category);
        totalConfidence += confidence;
        agreementCount++;
      }

      // Check for disagreements
      if (this.config.ensemble.detectDisagreements) {
        const rulesPos = rulesConf > 0.5;
        const neuralPos = neuralConf > 0.5;
        const embeddingPos = embeddingConf > 0.5;

        if (rulesPos !== neuralPos || rulesPos !== embeddingPos) {
          disagreements.push({
            category,
            predictions: {
              rules: { predicted: rulesPos, confidence: rulesConf },
              neural: { predicted: neuralPos, confidence: neuralConf },
              embedding: { predicted: embeddingPos, confidence: embeddingConf },
            },
            resolution: include
              ? rulesPos
                ? "rules_override"
                : "neural_override"
              : "voting",
          });
        }
      }
    }

    return {
      categories: finalCategories,
      confidence: agreementCount > 0 ? totalConfidence / agreementCount : 0,
      agreement: allCategories.size > 0 ? 1 - disagreements.length / allCategories.size : 1,
      disagreements,
    };
  }

  /**
   * Generates explanation for classification.
   */
  private generateExplanation(
    rulesResult: ClassificationResult,
    neuralResult: NeuralClassificationResult | null,
    similarityResults: SimilarityResult[]
  ): ClassificationExplanation {
    const topFeatures: ClassificationExplanation["topFeatures"] = [];

    // Add rule-based features
    for (const assignment of rulesResult.termAssignments) {
      if (assignment.matchedRule) {
        topFeatures.push({
          feature: `Rule: ${assignment.matchedRule.condition}`,
          importance: assignment.confidence,
          direction: "positive",
        });
      }
    }

    // Add neural features
    if (neuralResult) {
      for (const pred of neuralResult.predictions.slice(0, 3)) {
        topFeatures.push({
          feature: `Neural: ${pred.categoryName}`,
          importance: pred.probability,
          direction: pred.selected ? "positive" : "negative",
        });
      }
    }

    // Generate summary
    const categories = rulesResult.termAssignments.map((a) => a.termValue);
    const summary =
      categories.length > 0
        ? `Content classified into ${categories.join(", ")} based on ${rulesResult.termAssignments.length} rule matches` +
          (neuralResult ? ` and neural network predictions (confidence: ${(neuralResult.confidence * 100).toFixed(1)}%)` : "")
        : "Content did not match any classification rules or neural predictions.";

    return {
      topFeatures,
      similarExamples: similarityResults.slice(0, 5).map((s) => ({
        contentId: s.contentId,
        similarity: s.similarity,
        category: s.categories[0] || "unknown",
      })),
      ruleMatches: rulesResult.termAssignments.map((a) => ({
        rule: a.matchedRule?.condition || "unknown",
        matched: true,
        confidence: a.confidence,
      })),
      attention: neuralResult?.attention,
      summary,
    };
  }

  /**
   * Detects anomalies in content classification.
   */
  private async detectAnomalies(
    content: ContentItem,
    embedding: Embedding,
    rulesResult: ClassificationResult
  ): Promise<void> {
    if (!this.vectorDb) return;

    // Find nearest neighbors
    const neighbors = await this.vectorDb.nearestNeighbors(content.id, 10);

    if (neighbors.length === 0) return;

    // Calculate average similarity to neighbors
    const avgSimilarity = neighbors.reduce((sum, n) => sum + n.similarity, 0) / neighbors.length;

    // If content is very dissimilar to all neighbors, it might be anomalous
    if (avgSimilarity < 0.3) {
      const anomalyScore = 1 - avgSimilarity;
      log.info({ contentId: content.id, anomalyScore }, "Anomaly detected");
      this.emit("anomaly:detected", content.id, anomalyScore);
    }
  }

  /**
   * Updates auto-taxonomy learning.
   */
  private async updateAutoTaxonomy(
    content: ContentItem,
    embedding: Embedding,
    ensembleResult: { categories: string[]; confidence: number }
  ): Promise<void> {
    // Skip if content was confidently classified
    if (ensembleResult.confidence > 0.8) return;

    // Add to clustering pool for later analysis
    // In production, this would trigger periodic clustering jobs
  }

  /**
   * Creates a hybrid classification result.
   */
  private createHybridResult(
    rulesResult: ClassificationResult,
    neuralResult: NeuralClassificationResult | null,
    similarityResults: SimilarityResult[],
    ensembleMetadata: HybridClassificationResult["ensemble"]
  ): HybridClassificationResult {
    return {
      ...rulesResult,
      rulesBased: {
        result: rulesResult.rawResult,
        confidence: rulesResult.termAssignments.length > 0 ? 1 : 0,
      },
      neural: neuralResult,
      embeddingSimilarity: similarityResults,
      ensemble: ensembleMetadata,
      explanation: {
        topFeatures: [],
        similarExamples: [],
        ruleMatches: [],
        summary: "",
      },
    };
  }

  // ============================================================================
  // AUTO-TAXONOMY METHODS
  // ============================================================================

  /**
   * Discovers new taxonomy clusters.
   */
  async discoverClusters(): Promise<TaxonomyCluster[]> {
    if (!this.vectorDb) return [];

    const k = 10; // Number of clusters to discover
    const centroids = await this.vectorDb.getClusters(k);

    const clusters: TaxonomyCluster[] = [];

    for (const centroid of centroids) {
      // Find representative content for this cluster
      const members = await this.vectorDb.search(centroid.centroid, {
        topK: centroid.memberCount,
        minSimilarity: this.config.autoTaxonomy.similarityThreshold,
      });

      if (members.length < this.config.autoTaxonomy.minClusterSize) continue;

      // Extract keywords from cluster members (placeholder)
      const keywords = this.extractKeywords(members.map((m) => m.contentId));

      const cluster: TaxonomyCluster = {
        id: `cluster-${centroid.clusterId}`,
        centroid: centroid.centroid,
        members: members.map((m) => m.contentId),
        suggestedName: keywords[0] || `Cluster ${centroid.clusterId}`,
        confidence: members.reduce((sum, m) => sum + m.similarity, 0) / members.length,
        keywords,
        discoveredAt: new Date(),
      };

      clusters.push(cluster);
      this.discoveredClusters.push(cluster);
      this.emit("taxonomy:cluster_discovered", cluster);
    }

    return clusters;
  }

  /**
   * Extracts keywords from content IDs.
   * Placeholder - would use TF-IDF, RAKE, or similar.
   */
  private extractKeywords(contentIds: string[]): string[] {
    // Simple extraction based on content names
    const words: Map<string, number> = new Map();

    for (const id of contentIds) {
      const name = id.split("/").pop() || id;
      const parts = name.split(/[-_.\s]+/).filter((p) => p.length > 2);

      for (const part of parts) {
        words.set(part.toLowerCase(), (words.get(part.toLowerCase()) || 0) + 1);
      }
    }

    // Sort by frequency
    const sorted = [...words.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 5).map(([word]) => word);
  }

  /**
   * Suggests taxonomy restructuring.
   */
  async suggestRestructuring(): Promise<TaxonomyRestructuringSuggestion[]> {
    const suggestions: TaxonomyRestructuringSuggestion[] = [];

    // Check for similar terms that should be merged
    if (this.config.autoTaxonomy.enableMergeSuggestions) {
      const merges = await this.findMergeCandidates();
      suggestions.push(...merges);
    }

    // Check for clusters that should become new categories
    for (const cluster of this.discoveredClusters) {
      if (cluster.confidence > 0.7 && cluster.members.length >= this.config.autoTaxonomy.minClusterSize) {
        suggestions.push({
          type: "create",
          source: cluster.members,
          suggestedName: cluster.suggestedName,
          confidence: cluster.confidence,
          rationale: `Discovered coherent cluster of ${cluster.members.length} items with keywords: ${cluster.keywords.join(", ")}`,
          affectedContentCount: cluster.members.length,
          impactScore: cluster.members.length / 100,
          reversible: true,
        });
      }
    }

    for (const suggestion of suggestions) {
      this.pendingSuggestions.push(suggestion);
      this.emit("taxonomy:restructuring_suggested", suggestion);
    }

    return suggestions;
  }

  /**
   * Finds terms that could be merged.
   */
  private async findMergeCandidates(): Promise<TaxonomyRestructuringSuggestion[]> {
    const suggestions: TaxonomyRestructuringSuggestion[] = [];
    const vocabularies = this.baseEngine.getVocabularies();

    for (const [vocabId, vocab] of vocabularies) {
      const terms = await this.baseEngine.getTerms(vocabId);

      // Compare each pair of terms
      for (let i = 0; i < terms.length; i++) {
        for (let j = i + 1; j < terms.length; j++) {
          const term1 = terms[i];
          const term2 = terms[j];

          // Simple similarity check (would use embeddings in production)
          const similarity = this.termSimilarity(term1.value, term2.value);

          if (similarity >= this.config.autoTaxonomy.mergeSimilarityThreshold) {
            suggestions.push({
              type: "merge",
              source: [term1.value, term2.value],
              target: term1.contentCount > term2.contentCount ? term1.value : term2.value,
              confidence: similarity,
              rationale: `Terms "${term1.value}" and "${term2.value}" have ${(similarity * 100).toFixed(0)}% similarity`,
              affectedContentCount: term1.contentCount + term2.contentCount,
              impactScore: Math.min(term1.contentCount, term2.contentCount) / 100,
              reversible: true,
            });
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Calculates similarity between terms.
   */
  private termSimilarity(term1: string, term2: string): number {
    // Levenshtein-based similarity
    const maxLen = Math.max(term1.length, term2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(term1.toLowerCase(), term2.toLowerCase());
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance calculation.
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Detects trending topics.
   */
  async detectTrends(): Promise<TrendingTopic[]> {
    // Placeholder - would analyze time-series of classifications
    const trends: TrendingTopic[] = [];

    // In production, this would:
    // 1. Track classification counts over time
    // 2. Calculate velocity (growth rate)
    // 3. Identify emerging patterns
    // 4. Predict trajectory

    return trends;
  }

  // ============================================================================
  // FEDERATED LEARNING METHODS
  // ============================================================================

  /**
   * Records a user correction for learning.
   */
  async recordCorrection(correction: Omit<UserCorrection, "id" | "timestamp">): Promise<UserCorrection> {
    const fullCorrection: UserCorrection = {
      ...correction,
      id: `correction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    this.corrections.push(fullCorrection);
    this.emit("learning:correction_received", fullCorrection);

    // Check if we should trigger a learning update
    if (this.corrections.length >= this.config.federatedLearning.minCorrectionsForUpdate) {
      await this.triggerFederatedUpdate();
    }

    return fullCorrection;
  }

  /**
   * Triggers a federated learning update.
   */
  private async triggerFederatedUpdate(): Promise<FederatedUpdate | null> {
    if (!this.config.federatedLearning.enabled) return null;

    // Calculate gradient update from corrections (placeholder)
    // In production, this would:
    // 1. Train local model on corrections
    // 2. Apply differential privacy
    // 3. Encrypt gradients if secure aggregation enabled
    // 4. Send to aggregation server

    const gradients = new Float32Array(this.config.embedding.dimension);
    // Placeholder gradient calculation

    const update: FederatedUpdate = {
      id: `update-${Date.now()}`,
      gradients,
      sampleCount: this.corrections.length,
      privacyBudget: this.config.federatedLearning.privacyEpsilon,
      timestamp: new Date(),
      clientId: "local", // Would be anonymized client ID
    };

    // Clear processed corrections
    this.corrections = [];

    this.emit("learning:model_updated", update);

    return update;
  }

  /**
   * Creates an A/B test.
   */
  createABTest(config: Omit<ABTestConfig, "id">): ABTestConfig {
    const test: ABTestConfig = {
      ...config,
      id: `test-${Date.now()}`,
    };

    this.abTests.set(test.id, test);
    return test;
  }

  /**
   * Gets A/B test results.
   */
  getABTestResults(testId: string): ABTestResults | null {
    const test = this.abTests.get(testId);
    if (!test) return null;

    // Placeholder - would aggregate actual metrics
    const results: ABTestResults = {
      testId,
      control: {
        samples: 100,
        metricValue: 0.85,
        confidenceInterval: [0.80, 0.90],
      },
      treatment: {
        samples: 100,
        metricValue: 0.88,
        confidenceInterval: [0.83, 0.93],
      },
      lift: 0.035,
      pValue: 0.15,
      significant: false,
      recommendation: "continue",
    };

    return results;
  }

  // ============================================================================
  // CROSS-MODAL CLASSIFICATION
  // ============================================================================

  /**
   * Classifies multi-modal content.
   */
  async classifyMultiModal(content: MultiModalContent): Promise<CrossModalClassificationResult> {
    const modalities: CrossModalClassificationResult["modalities"] = {};

    // Classify each modality
    if (content.text) {
      modalities.text = await this.runNeuralClassification({
        ...content,
        name: content.text,
      } as ContentItem);
    }

    if (content.code) {
      modalities.code = await this.runCodeClassification(content.code);
    }

    if (content.image) {
      modalities.image = await this.runImageClassification(content.image);
    }

    // Fuse results
    const fused = this.fuseModalityResults(modalities);

    // Calculate cross-modal consistency
    const consistency = this.calculateModalityConsistency(modalities);

    return {
      modalities,
      fused,
      consistency,
    };
  }

  /**
   * Runs code-specific classification.
   * Would use CodeBERT or similar model.
   */
  private async runCodeClassification(code: { language: string; source: string }): Promise<NeuralClassificationResult> {
    // Placeholder - would call CodeBERT
    const predictions: CategoryPrediction[] = [];

    // Simple language-based heuristics
    const langCategories: Record<string, string[]> = {
      typescript: ["web", "frontend", "nodejs"],
      python: ["ml", "data-science", "backend"],
      rust: ["systems", "performance"],
      go: ["backend", "devops"],
    };

    const categories = langCategories[code.language.toLowerCase()] || [];
    for (const cat of categories) {
      predictions.push({
        categoryId: cat,
        categoryName: cat,
        probability: 0.6 + Math.random() * 0.3,
        selected: true,
        explanation: `Language ${code.language} typically used for ${cat}`,
      });
    }

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: 10,
    };
  }

  /**
   * Runs image classification.
   * Would use CLIP or similar model.
   */
  private async runImageClassification(image: { path: string; mimeType: string }): Promise<NeuralClassificationResult> {
    // Placeholder - would call CLIP
    return {
      predictions: [
        {
          categoryId: "image",
          categoryName: "Image",
          probability: 0.9,
          selected: true,
          explanation: "Image content detected",
        },
      ],
      confidence: 0.9,
      inferenceTimeMs: 50,
    };
  }

  /**
   * Fuses results from multiple modalities.
   */
  private fuseModalityResults(
    modalities: CrossModalClassificationResult["modalities"]
  ): CrossModalClassificationResult["fused"] {
    const allPredictions: Map<string, { sum: number; count: number }> = new Map();

    // Aggregate predictions across modalities
    for (const [_modality, result] of Object.entries(modalities)) {
      if (!result) continue;

      for (const pred of result.predictions) {
        const existing = allPredictions.get(pred.categoryId) || { sum: 0, count: 0 };
        existing.sum += pred.probability;
        existing.count++;
        allPredictions.set(pred.categoryId, existing);
      }
    }

    // Calculate fused predictions
    const predictions: CategoryPrediction[] = [];
    for (const [categoryId, data] of allPredictions) {
      const avgProb = data.sum / data.count;
      predictions.push({
        categoryId,
        categoryName: categoryId,
        probability: avgProb,
        selected: avgProb > 0.5,
        explanation: `Fused from ${data.count} modalities`,
      });
    }

    predictions.sort((a, b) => b.probability - a.probability);

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      fusionMethod: "late",
    };
  }

  /**
   * Calculates consistency across modalities.
   */
  private calculateModalityConsistency(modalities: CrossModalClassificationResult["modalities"]): number {
    const results = Object.values(modalities).filter((r) => r !== undefined);
    if (results.length < 2) return 1;

    // Compare top predictions across modalities
    const topCategories = results.map((r) => r!.predictions[0]?.categoryId).filter((c) => c !== undefined);

    if (topCategories.length === 0) return 1;

    // Calculate agreement
    const uniqueCategories = new Set(topCategories);
    return 1 - (uniqueCategories.size - 1) / topCategories.length;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Gets the base taxonomy engine.
   */
  getBaseEngine(): TaxonomyEngine {
    return this.baseEngine;
  }

  /**
   * Gets discovered clusters.
   */
  getDiscoveredClusters(): TaxonomyCluster[] {
    return [...this.discoveredClusters];
  }

  /**
   * Gets pending restructuring suggestions.
   */
  getPendingSuggestions(): TaxonomyRestructuringSuggestion[] {
    return [...this.pendingSuggestions];
  }

  /**
   * Approves a restructuring suggestion.
   */
  async approveSuggestion(suggestionIndex: number): Promise<void> {
    const suggestion = this.pendingSuggestions[suggestionIndex];
    if (!suggestion) return;

    // Apply the suggestion (placeholder - would actually modify taxonomy)
    log.info({ suggestion }, "Applying taxonomy restructuring");

    this.pendingSuggestions.splice(suggestionIndex, 1);
  }

  /**
   * Rejects a restructuring suggestion.
   */
  rejectSuggestion(suggestionIndex: number): void {
    this.pendingSuggestions.splice(suggestionIndex, 1);
  }

  /**
   * Gets configuration.
   */
  getConfig(): MLTaxonomyEngineConfig {
    return this.config;
  }

  /**
   * Checks if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shuts down the engine.
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
    this.embeddingCache.clear();
    this.classificationCache.clear();
    this.corrections = [];
    this.discoveredClusters = [];
    this.pendingSuggestions = [];
    log.info("ML taxonomy engine shut down");
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates default ML taxonomy engine configuration.
 */
export function createDefaultMLConfig(): Omit<MLTaxonomyEngineConfig, "rsesConfig" | "symlinkBaseDir"> {
  return {
    embedding: {
      textModel: "sentence-transformers",
      codeModel: "codebert",
      imageModel: "clip-vit-b32",
      dimension: 384,
      batchSize: 32,
      enableCache: true,
      cacheTTL: 3600000, // 1 hour
      normalize: true,
    },
    neural: {
      modelId: "distilbert-base-uncased",
      modelType: "distilbert",
      threshold: 0.5,
      multiLabel: true,
      maxLength: 512,
      useGPU: false,
      temperature: 1.0,
    },
    ensemble: {
      strategy: "weighted_average",
      weights: {
        rules: 0.4,
        neural: 0.4,
        embedding: 0.2,
      },
      confidenceThreshold: 0.5,
      detectDisagreements: true,
      minAgreement: 2,
    },
    autoTaxonomy: {
      enableAutoDiscovery: true,
      minClusterSize: 5,
      clusteringAlgorithm: "hdbscan",
      similarityThreshold: 0.7,
      enableMergeSuggestions: true,
      mergeSimilarityThreshold: 0.85,
      enableTrendDetection: true,
      trendWindowDays: 30,
      requireApproval: true,
    },
    federatedLearning: {
      enabled: true,
      minCorrectionsForUpdate: 10,
      privacyEpsilon: 0.1,
      secureAggregation: false,
      localEpochs: 1,
      learningRate: 0.001,
      enableABTesting: true,
    },
    enableCrossModal: true,
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let mlEngineInstance: MLTaxonomyEngine | null = null;

/**
 * Gets the singleton ML engine instance.
 */
export function getMLTaxonomyEngine(): MLTaxonomyEngine | null {
  return mlEngineInstance;
}

/**
 * Initializes the singleton ML engine.
 */
export async function initMLTaxonomyEngine(
  baseEngine: TaxonomyEngine,
  config: MLTaxonomyEngineConfig
): Promise<MLTaxonomyEngine> {
  if (mlEngineInstance) {
    await mlEngineInstance.shutdown();
  }

  mlEngineInstance = new MLTaxonomyEngine(config, baseEngine);
  await mlEngineInstance.initialize();
  return mlEngineInstance;
}

/**
 * Shuts down the singleton ML engine.
 */
export async function shutdownMLTaxonomyEngine(): Promise<void> {
  if (mlEngineInstance) {
    await mlEngineInstance.shutdown();
    mlEngineInstance = null;
  }
}
