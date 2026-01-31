/**
 * @file ml-taxonomy-index.ts
 * @description Central export for ML-Enhanced Taxonomy Engine components.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * This module provides a unified interface for the ML-enhanced taxonomy system:
 *
 * 1. MLTaxonomyEngine - Hybrid classification pipeline
 * 2. EmbeddingProviders - Vector embedding generation
 * 3. VectorDatabase - Embedding storage and similarity search
 * 4. NeuralClassifier - Neural network classification
 * 5. AutoTaxonomyLearner - Automatic taxonomy discovery
 * 6. CrossModalClassifier - Multi-modal content classification
 */

// ============================================================================
// ML TAXONOMY ENGINE
// ============================================================================

export {
  // Main engine
  MLTaxonomyEngine,
  getMLTaxonomyEngine,
  initMLTaxonomyEngine,
  shutdownMLTaxonomyEngine,
  createDefaultMLConfig,

  // Types
  type MLTaxonomyEngineConfig,
  type MLTaxonomyEngineEvents,
  type HybridClassificationResult,

  // Embedding types
  type Embedding,
  type EmbeddingModel,
  type EmbeddingConfig,

  // Neural classification types
  type NeuralClassificationResult,
  type CategoryPrediction,
  type AttentionWeights,
  type NeuralClassifierConfig,

  // Ensemble types
  type EnsembleStrategy,
  type EnsembleConfig,
  type ClassifierDisagreement,
  type ClassificationExplanation,
  type SimilarityResult,

  // Auto-taxonomy types
  type TaxonomyCluster,
  type TaxonomyRestructuringSuggestion,
  type TrendingTopic,
  type AutoTaxonomyConfig,

  // Federated learning types
  type UserCorrection,
  type FederatedUpdate,
  type ABTestConfig,
  type ABTestResults,
  type FederatedLearningConfig,

  // Cross-modal types
  type MultiModalContent,
  type CrossModalClassificationResult,
  type ContentModality,

  // Vector database types
  type VectorDatabase,
  type VectorSearchOptions,
  type VectorSearchResult,
  type ClusterCentroid,
} from "./ml-taxonomy-engine";

// ============================================================================
// EMBEDDING PROVIDERS
// ============================================================================

export {
  // Providers
  EmbeddingProviderManager,
  OpenAIEmbeddingProvider,
  CohereEmbeddingProvider,
  HuggingFaceEmbeddingProvider,
  LocalEmbeddingProvider,

  // Factory and singleton
  createEmbeddingManager,
  getEmbeddingManager,
  resetEmbeddingManager,

  // Batch processing
  BatchEmbeddingProcessor,

  // Types
  type EmbeddingProvider,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type EmbeddingManagerConfig,
  type OpenAIProviderConfig,
  type CohereProviderConfig,
  type HuggingFaceProviderConfig,
  type BatchEmbeddingOptions,
  type BatchEmbeddingResult,
} from "./embedding-providers";

// ============================================================================
// VECTOR DATABASE
// ============================================================================

export {
  // Implementations
  InMemoryVectorDatabase,
  PineconeVectorDatabase,
  WeaviateVectorDatabase,

  // Factory functions
  createVectorDatabase,
  createVectorDatabaseFromEnv,
  getVectorDatabase,
  resetVectorDatabase,

  // Types
  type VectorDatabaseConfig,
  type StoredEmbedding,
  type VectorUpsert,
  type VectorFilter,
  type ExtendedSearchOptions,
  type VectorDatabaseStats,
} from "./vector-database";

// ============================================================================
// NEURAL CLASSIFIER
// ============================================================================

export {
  // Classifiers
  ClassifierManager,
  HuggingFaceZeroShotClassifier,
  HuggingFaceTextClassifier,
  OpenAIClassifier,
  LocalMockClassifier,
  CodeClassifier,

  // Factory and singleton
  createClassifierManager,
  getClassifierManager,
  resetClassifierManager,

  // Types
  type NeuralClassifier,
  type ClassificationRequest,
  type HuggingFaceClassifierConfig,
  type OpenAIClassifierConfig,
  type TrainingData,
  type TrainingConfig,
} from "./neural-classifier";

// ============================================================================
// AUTO-TAXONOMY LEARNER
// ============================================================================

export {
  // Main class
  AutoTaxonomyLearner,

  // Factory
  createAutoTaxonomyLearner,

  // Types
  type AutoTaxonomyLearnerEvents,
  type ClusteringOptions,
  type ClusteringResult,
  type TermSimilarityAnalysis,
  type HierarchyOptimizationResult,
  type TimeSeriesPoint,
  type TrendAnalysisResult,
  type LearningFeedback,
} from "./auto-taxonomy-learner";

// ============================================================================
// CROSS-MODAL CLASSIFIER
// ============================================================================

export {
  // Main class
  CrossModalClassifier,
  ModalityDetector,

  // Factory and singleton
  createCrossModalClassifier,
  getCrossModalClassifier,
  resetCrossModalClassifier,

  // Types
  type CrossModalClassifierConfig,
  type ModalityClassifierConfig,
  type FusionConfig,
  type ModalityDetectionResult,
  type ImageAnalysisResult,
  type AudioAnalysisResult,
  type VideoAnalysisResult,
} from "./cross-modal-classifier";

// ============================================================================
// CONVENIENCE FACTORY
// ============================================================================

import { TaxonomyEngine, createTaxonomyEngine } from "./taxonomy-engine";
import { RsesConfig } from "../lib/rses";
import { MLTaxonomyEngine, createDefaultMLConfig, MLTaxonomyEngineConfig } from "./ml-taxonomy-engine";
import { createVectorDatabaseFromEnv, VectorDatabase } from "./vector-database";
import { createAutoTaxonomyLearner, AutoTaxonomyLearner } from "./auto-taxonomy-learner";

/**
 * Complete ML taxonomy system instance.
 */
export interface MLTaxonomySystem {
  /** Base taxonomy engine */
  baseEngine: TaxonomyEngine;
  /** ML-enhanced engine */
  mlEngine: MLTaxonomyEngine;
  /** Vector database */
  vectorDb: VectorDatabase;
  /** Auto-taxonomy learner */
  learner: AutoTaxonomyLearner;
}

/**
 * Creates a complete ML taxonomy system.
 */
export async function createMLTaxonomySystem(
  rsesConfig: RsesConfig,
  options: {
    symlinkBaseDir: string;
    mlConfig?: Partial<MLTaxonomyEngineConfig>;
  }
): Promise<MLTaxonomySystem> {
  // Create base taxonomy engine
  const baseEngine = createTaxonomyEngine(rsesConfig, {
    symlinkBaseDir: options.symlinkBaseDir,
  });
  await baseEngine.initialize();

  // Create vector database
  const vectorDb = await createVectorDatabaseFromEnv();

  // Create ML config
  const defaultConfig = createDefaultMLConfig();
  const mlConfig: MLTaxonomyEngineConfig = {
    ...defaultConfig,
    rsesConfig,
    symlinkBaseDir: options.symlinkBaseDir,
    ...options.mlConfig,
  };

  // Create ML engine
  const mlEngine = new MLTaxonomyEngine(mlConfig, baseEngine);
  await mlEngine.initialize();

  // Create auto-taxonomy learner
  const learner = createAutoTaxonomyLearner(baseEngine, vectorDb);

  return {
    baseEngine,
    mlEngine,
    vectorDb,
    learner,
  };
}

/**
 * Shuts down a complete ML taxonomy system.
 */
export async function shutdownMLTaxonomySystem(system: MLTaxonomySystem): Promise<void> {
  await system.mlEngine.shutdown();
  await system.baseEngine.shutdown();
}
