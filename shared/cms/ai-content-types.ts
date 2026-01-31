/**
 * @file ai-content-types.ts
 * @description AI-Enhanced Content Type System - Industry-Leading Capabilities
 * @phase Phase 10 - AI-Native CMS
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This module defines the complete type system for an AI-native CMS inspired by
 * best practices from Sanity.io, Strapi, Contentful, Payload CMS, and Builder.io.
 *
 * Key Features:
 * - AI-Native Content: Every content type has AI enhancement capabilities
 * - Predictive Fields: Fields that auto-populate based on ML predictions
 * - Content Intelligence: Automatic tagging, summarization, translation
 * - Workflow Automation: AI-driven content workflows
 * - Version Intelligence: Smart diff, merge suggestions, conflict resolution
 * - Real-time Collaboration: CRDT-based concurrent editing
 *
 * Architecture Inspiration:
 * - Sanity.io: Real-time collaboration, portable text, GROQ queries
 * - Strapi: Auto-generated APIs, customizable admin
 * - Contentful: Structured content, rich text with embedded entries
 * - Payload CMS: TypeScript-first, access control
 * - Builder.io: Visual editing, AI generation
 */

import { z } from "zod";
import type { FieldType, FieldValue, ContentType, FieldStorage, FieldInstance } from "./types";

// =============================================================================
// AI PROVIDER CONFIGURATION
// =============================================================================

/**
 * Supported AI provider types
 */
export type AIProvider =
  | "openai"           // GPT-4, GPT-4o, GPT-4o-mini
  | "anthropic"        // Claude 3.5 Sonnet, Claude Opus 4.5
  | "google"           // Gemini Pro, Gemini Ultra
  | "cohere"           // Command R+
  | "local"            // Local models (Ollama, llama.cpp)
  | "custom";          // Custom API endpoint

/**
 * AI model configuration
 */
export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  apiEndpoint?: string;
  apiKey?: string;  // Reference to secret, never stored directly
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout?: number;  // milliseconds
  retryConfig?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
}

/**
 * Image generation model configuration
 */
export interface ImageModelConfig {
  provider: "openai" | "stability" | "midjourney" | "replicate" | "local";
  model: string;
  apiEndpoint?: string;
  apiKey?: string;
  defaultSize?: string;
  defaultQuality?: "standard" | "hd";
  defaultStyle?: "natural" | "vivid";
}

/**
 * Embedding model configuration for semantic search
 */
export interface EmbeddingModelConfig {
  provider: AIProvider;
  model: string;
  dimensions: number;
  apiEndpoint?: string;
  batchSize?: number;
}

// =============================================================================
// AI FIELD TYPES
// =============================================================================

/**
 * Extended field types with AI capabilities
 */
export type AIFieldType =
  // Standard field types (inherited)
  | FieldType
  // AI-enhanced text fields
  | "ai_generated_text"     // GPT-powered text generation
  | "ai_summary"            // Auto-summarize long content
  | "ai_translation"        // Multi-language translation
  | "ai_rewrite"            // Tone/style rewriting
  | "ai_expand"             // Expand brief content
  | "ai_compress"           // Compress verbose content
  // AI-enhanced media fields
  | "ai_image_generation"   // DALL-E, Stable Diffusion
  | "ai_image_caption"      // Auto-caption images
  | "ai_image_alt_text"     // Generate accessible alt text
  | "ai_video_transcript"   // Transcribe video content
  | "ai_audio_transcript"   // Transcribe audio content
  // AI classification fields
  | "ai_classification"     // Auto-categorize content
  | "ai_sentiment"          // Sentiment analysis
  | "ai_entity_extraction"  // Extract named entities
  | "ai_keyword_extraction" // Extract keywords/phrases
  | "ai_topic_modeling"     // Topic detection
  // AI embedding fields
  | "ai_embedding"          // Vector embeddings for semantic search
  | "ai_similarity"         // Similar content detection
  // AI quality fields
  | "ai_quality_score"      // Content quality assessment
  | "ai_readability"        // Readability scoring
  | "ai_seo_score"          // SEO optimization score
  | "ai_accessibility"      // Accessibility compliance
  // Predictive fields
  | "predictive_text"       // ML-predicted text values
  | "predictive_taxonomy"   // ML-predicted taxonomy assignments
  | "predictive_date"       // ML-predicted dates
  | "predictive_reference"; // ML-predicted entity references

// =============================================================================
// AI FIELD CONFIGURATION
// =============================================================================

/**
 * Base AI field configuration shared across all AI field types
 */
export interface AIFieldConfigBase {
  /** Whether AI processing is enabled */
  enabled: boolean;
  /** AI model to use */
  model: AIModelConfig;
  /** When to trigger AI processing */
  trigger: AITrigger;
  /** Caching configuration */
  cache?: AICacheConfig;
  /** Fallback behavior when AI fails */
  fallback?: AIFallbackConfig;
  /** Cost/usage limits */
  limits?: AILimitConfig;
  /** Quality thresholds */
  qualityThreshold?: number;
  /** Human review requirements */
  reviewRequired?: boolean;
}

/**
 * When to trigger AI processing
 */
export interface AITrigger {
  /** Trigger on content save */
  onSave?: boolean;
  /** Trigger on content publish */
  onPublish?: boolean;
  /** Trigger on field change */
  onFieldChange?: string[];  // Field names that trigger processing
  /** Trigger on schedule */
  scheduled?: {
    cron: string;
    timezone: string;
  };
  /** Trigger manually only */
  manualOnly?: boolean;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

/**
 * AI result caching configuration
 */
export interface AICacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  invalidateOn?: string[];  // Field names that invalidate cache
  cacheKey?: string;  // Custom cache key template
}

/**
 * Fallback configuration when AI processing fails
 */
export interface AIFallbackConfig {
  /** Use previous value */
  usePrevious?: boolean;
  /** Use default value */
  defaultValue?: unknown;
  /** Skip field */
  skip?: boolean;
  /** Require manual input */
  requireManual?: boolean;
  /** Use alternative model */
  alternativeModel?: AIModelConfig;
}

/**
 * AI usage limits
 */
export interface AILimitConfig {
  /** Maximum API calls per day */
  dailyLimit?: number;
  /** Maximum API calls per hour */
  hourlyLimit?: number;
  /** Maximum cost per month (in cents) */
  monthlyCostLimit?: number;
  /** Maximum tokens per request */
  maxTokensPerRequest?: number;
  /** Rate limiting (requests per minute) */
  rateLimit?: number;
}

// =============================================================================
// AI TEXT GENERATION FIELD
// =============================================================================

/**
 * Configuration for AI text generation field
 */
export interface AIGeneratedTextConfig extends AIFieldConfigBase {
  type: "ai_generated_text";
  /** Prompt template (supports variable interpolation) */
  promptTemplate: string;
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Fields to include as context */
  contextFields?: string[];
  /** Output format */
  outputFormat?: "plain" | "markdown" | "html" | "json";
  /** Maximum output length */
  maxLength?: number;
  /** Minimum output length */
  minLength?: number;
  /** Allowed content types */
  allowedContentTypes?: string[];
  /** Tone/style guidance */
  tone?: "formal" | "casual" | "technical" | "creative" | "persuasive";
  /** Language for output */
  language?: string;
  /** Enable creative variations */
  variations?: {
    enabled: boolean;
    count: number;
  };
}

/**
 * Result of AI text generation
 */
export interface AIGeneratedTextResult {
  /** Generated text */
  text: string;
  /** Model used */
  model: string;
  /** Provider used */
  provider: AIProvider;
  /** Tokens consumed */
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Generation timestamp */
  generatedAt: Date;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Alternative variations if requested */
  variations?: string[];
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Cache hit */
  cached: boolean;
}

// =============================================================================
// AI SUMMARY FIELD
// =============================================================================

/**
 * Configuration for AI summary field
 */
export interface AISummaryConfig extends AIFieldConfigBase {
  type: "ai_summary";
  /** Source field(s) to summarize */
  sourceFields: string[];
  /** Summary style */
  style: "bullet_points" | "paragraph" | "tldr" | "executive" | "abstract";
  /** Target length */
  targetLength?: {
    type: "words" | "sentences" | "characters";
    min?: number;
    max?: number;
  };
  /** Include key points extraction */
  extractKeyPoints?: boolean;
  /** Number of key points */
  keyPointsCount?: number;
  /** Preserve specific terms/names */
  preserveTerms?: string[];
  /** Focus areas for summarization */
  focusAreas?: string[];
}

/**
 * Result of AI summarization
 */
export interface AISummaryResult {
  /** Summary text */
  summary: string;
  /** Key points if extracted */
  keyPoints?: string[];
  /** Source content length */
  sourceLength: number;
  /** Compression ratio */
  compressionRatio: number;
  /** Model metadata */
  metadata: AIGeneratedTextResult;
}

// =============================================================================
// AI TRANSLATION FIELD
// =============================================================================

/**
 * Configuration for AI translation field
 */
export interface AITranslationConfig extends AIFieldConfigBase {
  type: "ai_translation";
  /** Source field to translate */
  sourceField: string;
  /** Source language (auto-detect if not specified) */
  sourceLanguage?: string;
  /** Target languages */
  targetLanguages: string[];
  /** Translation style */
  style?: "formal" | "casual" | "technical" | "literary";
  /** Preserve formatting */
  preserveFormatting?: boolean;
  /** Glossary terms */
  glossary?: Record<string, Record<string, string>>;
  /** Quality tier */
  qualityTier?: "standard" | "professional" | "premium";
  /** Machine translation post-editing level */
  mtpeLevel?: "light" | "full" | "none";
}

/**
 * Result of AI translation
 */
export interface AITranslationResult {
  /** Source language detected/used */
  sourceLanguage: string;
  /** Translations by language code */
  translations: Record<string, {
    text: string;
    confidence: number;
    backTranslation?: string;  // For quality verification
  }>;
  /** Translation quality scores */
  qualityScores: Record<string, number>;
  /** Model metadata */
  metadata: AIGeneratedTextResult;
}

// =============================================================================
// AI IMAGE GENERATION FIELD
// =============================================================================

/**
 * Configuration for AI image generation field
 */
export interface AIImageGenerationConfig extends AIFieldConfigBase {
  type: "ai_image_generation";
  /** Image model configuration */
  imageModel: ImageModelConfig;
  /** Prompt template */
  promptTemplate: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Context fields for prompt generation */
  contextFields?: string[];
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Number of images to generate */
  count?: number;
  /** Style preset */
  style?: "photorealistic" | "illustration" | "3d-render" | "digital-art" | "anime" | "sketch";
  /** Content moderation */
  contentFilter?: {
    enabled: boolean;
    level: "strict" | "moderate" | "permissive";
  };
  /** Auto-generate alt text */
  autoAltText?: boolean;
  /** Storage configuration */
  storage?: {
    format: "png" | "jpg" | "webp";
    quality?: number;
    optimize?: boolean;
  };
}

/**
 * Result of AI image generation
 */
export interface AIImageGenerationResult {
  /** Generated image URLs/paths */
  images: Array<{
    url: string;
    localPath?: string;
    width: number;
    height: number;
    format: string;
    sizeBytes: number;
    altText?: string;
  }>;
  /** Prompt used */
  prompt: string;
  /** Revised prompt (if model modified it) */
  revisedPrompt?: string;
  /** Generation seed for reproducibility */
  seed?: number;
  /** Model metadata */
  metadata: {
    model: string;
    provider: string;
    generatedAt: Date;
    processingTimeMs: number;
    cost?: number;
  };
}

// =============================================================================
// AI CLASSIFICATION FIELD
// =============================================================================

/**
 * Configuration for AI classification field
 */
export interface AIClassificationConfig extends AIFieldConfigBase {
  type: "ai_classification";
  /** Source fields to classify */
  sourceFields: string[];
  /** Classification scheme */
  scheme: ClassificationScheme;
  /** Multi-label classification */
  multiLabel?: boolean;
  /** Maximum labels to assign */
  maxLabels?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Custom classification prompt */
  customPrompt?: string;
  /** Hierarchical classification */
  hierarchical?: boolean;
  /** Integration with RSES taxonomy */
  rsesIntegration?: {
    enabled: boolean;
    vocabularyId: string;
    createNewTerms: boolean;
  };
}

/**
 * Classification scheme definition
 */
export interface ClassificationScheme {
  /** Scheme identifier */
  id: string;
  /** Scheme name */
  name: string;
  /** Classification type */
  type: "predefined" | "learned" | "hybrid";
  /** Predefined categories */
  categories?: CategoryDefinition[];
  /** Learning configuration for adaptive classification */
  learning?: {
    enabled: boolean;
    minSamples: number;
    updateFrequency: "realtime" | "daily" | "weekly";
  };
}

/**
 * Category definition for classification
 */
export interface CategoryDefinition {
  id: string;
  label: string;
  description?: string;
  parentId?: string;
  keywords?: string[];
  examples?: string[];
  weight?: number;
}

/**
 * Result of AI classification
 */
export interface AIClassificationResult {
  /** Assigned classifications */
  classifications: Array<{
    categoryId: string;
    categoryLabel: string;
    confidence: number;
    reasoning?: string;
    parentPath?: string[];
  }>;
  /** Raw model output */
  rawOutput?: string;
  /** Model metadata */
  metadata: AIGeneratedTextResult;
}

// =============================================================================
// AI SENTIMENT ANALYSIS FIELD
// =============================================================================

/**
 * Configuration for AI sentiment field
 */
export interface AISentimentConfig extends AIFieldConfigBase {
  type: "ai_sentiment";
  /** Source field to analyze */
  sourceField: string;
  /** Granularity of analysis */
  granularity: "document" | "paragraph" | "sentence";
  /** Sentiment scale */
  scale: "binary" | "ternary" | "fine-grained" | "numeric";
  /** Detect specific emotions */
  emotions?: boolean;
  /** Detect aspects/topics */
  aspectBased?: boolean;
  /** Aspects to analyze */
  aspects?: string[];
}

/**
 * Result of AI sentiment analysis
 */
export interface AISentimentResult {
  /** Overall sentiment */
  overall: {
    label: "positive" | "negative" | "neutral" | "mixed";
    score: number;  // -1 to 1
    confidence: number;
  };
  /** Emotion detection if enabled */
  emotions?: Record<string, number>;  // joy, sadness, anger, fear, surprise, disgust
  /** Aspect-based sentiment if enabled */
  aspects?: Array<{
    aspect: string;
    sentiment: "positive" | "negative" | "neutral";
    score: number;
    mentions: string[];
  }>;
  /** Sentence-level analysis if granular */
  sentences?: Array<{
    text: string;
    sentiment: "positive" | "negative" | "neutral";
    score: number;
  }>;
  /** Model metadata */
  metadata: AIGeneratedTextResult;
}

// =============================================================================
// AI EMBEDDING FIELD
// =============================================================================

/**
 * Configuration for AI embedding field
 */
export interface AIEmbeddingConfig extends AIFieldConfigBase {
  type: "ai_embedding";
  /** Embedding model configuration */
  embeddingModel: EmbeddingModelConfig;
  /** Source fields to embed */
  sourceFields: string[];
  /** How to combine multiple fields */
  combineStrategy: "concatenate" | "average" | "weighted";
  /** Field weights if using weighted strategy */
  fieldWeights?: Record<string, number>;
  /** Chunk long content */
  chunking?: {
    enabled: boolean;
    chunkSize: number;
    overlap: number;
    strategy: "fixed" | "sentence" | "paragraph";
  };
  /** Vector index configuration */
  indexConfig?: {
    type: "hnsw" | "ivf" | "flat";
    metric: "cosine" | "euclidean" | "dot";
    efConstruction?: number;
    m?: number;
  };
}

/**
 * Result of AI embedding generation
 */
export interface AIEmbeddingResult {
  /** Primary embedding vector */
  vector: number[];
  /** Dimensions */
  dimensions: number;
  /** Chunk embeddings if content was chunked */
  chunks?: Array<{
    text: string;
    vector: number[];
    startOffset: number;
    endOffset: number;
  }>;
  /** Model used */
  model: string;
  /** Generation timestamp */
  generatedAt: Date;
  /** Indexed status */
  indexed: boolean;
}

// =============================================================================
// AI QUALITY SCORE FIELD
// =============================================================================

/**
 * Configuration for AI quality scoring field
 */
export interface AIQualityScoreConfig extends AIFieldConfigBase {
  type: "ai_quality_score";
  /** Source fields to evaluate */
  sourceFields: string[];
  /** Quality dimensions to assess */
  dimensions: QualityDimension[];
  /** Minimum acceptable score */
  minimumScore?: number;
  /** Block publish if below threshold */
  blockPublishBelowThreshold?: boolean;
  /** Custom rubric */
  customRubric?: string;
}

/**
 * Quality dimensions for scoring
 */
export type QualityDimension =
  | "accuracy"
  | "completeness"
  | "clarity"
  | "relevance"
  | "originality"
  | "grammar"
  | "formatting"
  | "engagement"
  | "authority"
  | "timeliness";

/**
 * Result of AI quality scoring
 */
export interface AIQualityScoreResult {
  /** Overall score (0-100) */
  overallScore: number;
  /** Grade (A, B, C, D, F) */
  grade: string;
  /** Dimension scores */
  dimensions: Record<QualityDimension, {
    score: number;
    feedback: string;
    suggestions?: string[];
  }>;
  /** Improvement suggestions */
  suggestions: Array<{
    priority: "high" | "medium" | "low";
    dimension: QualityDimension;
    suggestion: string;
    example?: string;
  }>;
  /** Pass/fail status */
  passed: boolean;
  /** Model metadata */
  metadata: AIGeneratedTextResult;
}

// =============================================================================
// PREDICTIVE FIELD CONFIGURATION
// =============================================================================

/**
 * Configuration for predictive fields
 */
export interface PredictiveFieldConfig extends AIFieldConfigBase {
  type: "predictive_text" | "predictive_taxonomy" | "predictive_date" | "predictive_reference";
  /** Machine learning model for predictions */
  mlModel: {
    type: "collaborative_filtering" | "content_based" | "hybrid" | "neural";
    modelId?: string;
    updateFrequency: "realtime" | "hourly" | "daily";
  };
  /** Training data source */
  trainingSource: {
    type: "user_history" | "content_patterns" | "external";
    minSamples: number;
    timeWindow?: number;  // days
  };
  /** Prediction output configuration */
  output: {
    suggestionsCount: number;
    minConfidence: number;
    showConfidence: boolean;
    allowOverride: boolean;
  };
}

/**
 * Result of predictive field processing
 */
export interface PredictiveFieldResult {
  /** Top predictions */
  predictions: Array<{
    value: unknown;
    confidence: number;
    reason: string;
    basedOn: string[];  // What data led to this prediction
  }>;
  /** User selected value (if different from top prediction) */
  selectedValue?: unknown;
  /** Feedback for model improvement */
  feedback?: {
    accepted: boolean;
    correctedValue?: unknown;
    timestamp: Date;
  };
}

// =============================================================================
// SMART WORKFLOWS
// =============================================================================

/**
 * AI-driven workflow configuration
 */
export interface AIWorkflowConfig {
  /** Workflow identifier */
  id: string;
  /** Workflow name */
  name: string;
  /** Content types this workflow applies to */
  contentTypes: string[];
  /** Workflow stages */
  stages: WorkflowStage[];
  /** AI review configuration */
  aiReview: AIReviewConfig;
  /** Quality gates */
  qualityGates: QualityGate[];
  /** Notifications */
  notifications: WorkflowNotification[];
}

/**
 * Workflow stage definition
 */
export interface WorkflowStage {
  id: string;
  name: string;
  type: "draft" | "review" | "ai_review" | "approval" | "published" | "archived";
  /** AI processing at this stage */
  aiProcessing?: {
    enabled: boolean;
    operations: AIWorkflowOperation[];
  };
  /** Transitions to other stages */
  transitions: StageTransition[];
  /** Required fields at this stage */
  requiredFields?: string[];
  /** Time limit in hours */
  timeLimit?: number;
}

/**
 * AI operations in workflow
 */
export interface AIWorkflowOperation {
  type:
    | "content_review"
    | "plagiarism_check"
    | "fact_check"
    | "seo_optimization"
    | "accessibility_check"
    | "brand_voice_check"
    | "legal_compliance"
    | "sentiment_check";
  config: Record<string, unknown>;
  blocking: boolean;  // If true, blocks progression on failure
  threshold?: number;
}

/**
 * Stage transition definition
 */
export interface StageTransition {
  toStage: string;
  condition?: TransitionCondition;
  autoTransition?: boolean;
  aiGatedTransition?: boolean;
}

/**
 * Transition condition
 */
export interface TransitionCondition {
  type: "all_fields_valid" | "quality_score" | "ai_approval" | "time_based" | "manual";
  threshold?: number;
  requiredApprovers?: number;
}

/**
 * AI review configuration
 */
export interface AIReviewConfig {
  enabled: boolean;
  model: AIModelConfig;
  reviewCriteria: string[];
  feedbackStyle: "summary" | "detailed" | "inline";
  autoApproveThreshold?: number;
  humanReviewRequired: boolean;
}

/**
 * Quality gate definition
 */
export interface QualityGate {
  id: string;
  name: string;
  type: "ai_score" | "plagiarism" | "seo" | "accessibility" | "custom";
  threshold: number;
  action: "block" | "warn" | "notify";
  aiConfig?: AIFieldConfigBase;
}

/**
 * Workflow notification
 */
export interface WorkflowNotification {
  event: "stage_changed" | "ai_review_complete" | "quality_gate_failed" | "deadline_approaching";
  recipients: string[];  // User IDs or roles
  channel: "email" | "slack" | "webhook" | "in_app";
  template?: string;
}

// =============================================================================
// VERSION INTELLIGENCE
// =============================================================================

/**
 * AI-powered version intelligence configuration
 */
export interface VersionIntelligenceConfig {
  /** Enable smart diff */
  smartDiff: {
    enabled: boolean;
    semanticComparison: boolean;
    highlightStyle: "line" | "word" | "character";
    aiSummary: boolean;
  };
  /** Merge suggestions */
  mergeSuggestions: {
    enabled: boolean;
    autoMergeThreshold: number;
    conflictResolutionAI: boolean;
  };
  /** Conflict resolution */
  conflictResolution: {
    strategy: "manual" | "ai_assisted" | "last_write_wins" | "crdt";
    aiConfig?: AIModelConfig;
  };
  /** Version comparison */
  comparison: {
    maxVersionsToCompare: number;
    includeMetadata: boolean;
    generateChangelog: boolean;
  };
}

/**
 * Smart diff result
 */
export interface SmartDiffResult {
  /** Change summary */
  summary: string;
  /** Change type */
  changeType: "major" | "minor" | "patch" | "cosmetic";
  /** Semantic changes */
  semanticChanges: Array<{
    type: "addition" | "deletion" | "modification" | "reorganization";
    description: string;
    affectedFields: string[];
    significance: "high" | "medium" | "low";
  }>;
  /** Field-level diffs */
  fieldDiffs: Record<string, FieldDiff>;
  /** AI-generated changelog entry */
  changelogEntry?: string;
}

/**
 * Field-level diff
 */
export interface FieldDiff {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: "added" | "removed" | "modified" | "unchanged";
  semanticSimilarity?: number;  // 0-1 for modified content
  diffHtml?: string;  // Visual diff representation
}

/**
 * Merge suggestion
 */
export interface MergeSuggestion {
  /** Merge ID */
  id: string;
  /** Source version */
  sourceVersion: number;
  /** Target version */
  targetVersion: number;
  /** Suggested merged value */
  suggestedValue: unknown;
  /** Confidence in suggestion */
  confidence: number;
  /** Reasoning */
  reasoning: string;
  /** Manual intervention needed */
  needsReview: boolean;
  /** Conflict details if any */
  conflicts?: ConflictDetail[];
}

/**
 * Conflict detail
 */
export interface ConflictDetail {
  field: string;
  values: Array<{
    version: number;
    value: unknown;
    author?: string;
    timestamp: Date;
  }>;
  suggestedResolution?: unknown;
  resolutionReasoning?: string;
}

// =============================================================================
// REAL-TIME COLLABORATION (CRDT-BASED)
// =============================================================================

/**
 * Collaboration configuration
 */
export interface CollaborationConfig {
  /** Enable real-time collaboration */
  enabled: boolean;
  /** CRDT implementation */
  crdtType: "yjs" | "automerge" | "diamond-types" | "custom";
  /** Presence awareness */
  presence: {
    enabled: boolean;
    cursorColors: boolean;
    selectionHighlight: boolean;
    userAvatars: boolean;
  };
  /** Commenting */
  commenting: {
    enabled: boolean;
    threadedReplies: boolean;
    aiSuggestions: boolean;
    resolveOnEdit: boolean;
  };
  /** Annotations */
  annotations: {
    enabled: boolean;
    types: ("note" | "suggestion" | "question" | "approval")[];
    aiAnnotations: boolean;
  };
  /** Conflict handling */
  conflictHandling: {
    strategy: "crdt_merge" | "last_write_wins" | "manual";
    showConflictUI: boolean;
  };
}

/**
 * User presence state
 */
export interface UserPresence {
  userId: string;
  userName: string;
  userAvatar?: string;
  cursorPosition?: CursorPosition;
  selection?: SelectionRange;
  focusedField?: string;
  lastActive: Date;
  color: string;
}

/**
 * Cursor position
 */
export interface CursorPosition {
  field: string;
  offset: number;
  line?: number;
  column?: number;
}

/**
 * Selection range
 */
export interface SelectionRange {
  field: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Comment/annotation
 */
export interface ContentAnnotation {
  id: string;
  type: "comment" | "suggestion" | "question" | "approval";
  field: string;
  range?: SelectionRange;
  content: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  replies?: ContentAnnotation[];
  aiGenerated: boolean;
}

// =============================================================================
// LEARNING SYSTEM
// =============================================================================

/**
 * Content learning system configuration
 */
export interface LearningSystemConfig {
  /** Enable learning from user patterns */
  enabled: boolean;
  /** Track editing patterns */
  editingPatterns: {
    enabled: boolean;
    minSamplesForSuggestion: number;
    decayFactor: number;  // How much to discount old patterns
  };
  /** Learn content relationships */
  relationshipLearning: {
    enabled: boolean;
    linkTypes: string[];
    bidirectional: boolean;
  };
  /** Taxonomy prediction */
  taxonomyPrediction: {
    enabled: boolean;
    confidenceThreshold: number;
    autoAssign: boolean;
  };
  /** Privacy settings */
  privacy: {
    anonymizeData: boolean;
    retentionDays: number;
    userOptOut: boolean;
  };
}

/**
 * Learned pattern
 */
export interface LearnedPattern {
  id: string;
  type: "field_value" | "taxonomy" | "reference" | "workflow" | "formatting";
  pattern: {
    context: Record<string, unknown>;
    outcome: unknown;
  };
  frequency: number;
  lastSeen: Date;
  confidence: number;
  userId?: string;  // null for global patterns
}

/**
 * Pattern-based suggestion
 */
export interface PatternSuggestion {
  patternId: string;
  field: string;
  suggestedValue: unknown;
  confidence: number;
  basedOnPatterns: number;
  explanation: string;
}

// =============================================================================
// PORTABLE TEXT (SANITY.IO INSPIRED)
// =============================================================================

/**
 * Portable text block (Sanity.io-inspired rich text)
 */
export interface PortableTextBlock {
  _type: "block" | "image" | "embed" | "table" | "code" | string;
  _key: string;
  children?: PortableTextSpan[];
  style?: "normal" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote";
  listItem?: "bullet" | "number";
  level?: number;
  markDefs?: PortableTextMarkDef[];
  [key: string]: unknown;  // Allow custom properties
}

/**
 * Portable text span
 */
export interface PortableTextSpan {
  _type: "span";
  _key: string;
  text: string;
  marks?: string[];
}

/**
 * Portable text mark definition
 */
export interface PortableTextMarkDef {
  _type: string;
  _key: string;
  [key: string]: unknown;
}

/**
 * AI-enhanced portable text configuration
 */
export interface AIPortableTextConfig {
  /** AI writing assistant */
  writingAssistant: {
    enabled: boolean;
    model: AIModelConfig;
    features: (
      | "autocomplete"
      | "grammar_check"
      | "style_suggestions"
      | "expand"
      | "compress"
      | "rewrite"
      | "translate"
    )[];
  };
  /** Embedded content AI */
  embeddedContent: {
    autoCaption: boolean;
    autoAltText: boolean;
    smartEmbedding: boolean;  // AI suggests where to embed content
  };
  /** Link suggestions */
  linkSuggestions: {
    enabled: boolean;
    internalLinks: boolean;
    externalLinks: boolean;
    citationStyle?: string;
  };
}

// =============================================================================
// CONTENT TYPE WITH AI CAPABILITIES
// =============================================================================

/**
 * AI-enhanced content type (extends base ContentType)
 */
export interface AIContentType extends ContentType {
  /** AI capabilities for this content type */
  aiCapabilities: {
    /** Global AI settings for this content type */
    enabled: boolean;
    /** Default AI model */
    defaultModel: AIModelConfig;
    /** Content generation */
    generation: {
      enabled: boolean;
      templates: AIContentTemplate[];
    };
    /** Quality assurance */
    qa: {
      enabled: boolean;
      dimensions: QualityDimension[];
      minimumScore: number;
    };
    /** SEO optimization */
    seo: {
      enabled: boolean;
      targetKeywords: boolean;
      metaGeneration: boolean;
      readabilityTarget?: number;
    };
    /** Accessibility */
    accessibility: {
      enabled: boolean;
      wcagLevel: "A" | "AA" | "AAA";
      autoRemediation: boolean;
    };
  };
  /** Workflow integration */
  workflow?: AIWorkflowConfig;
  /** Collaboration settings */
  collaboration?: CollaborationConfig;
  /** Version intelligence */
  versionIntelligence?: VersionIntelligenceConfig;
}

/**
 * AI content template for generation
 */
export interface AIContentTemplate {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  fields: Record<string, string>;  // Field name -> prompt for that field
  examples?: Array<Record<string, unknown>>;
}

// =============================================================================
// AI FIELD INSTANCE (EXTENDS BASE FIELD INSTANCE)
// =============================================================================

/**
 * AI-enhanced field instance
 */
export interface AIFieldInstance extends FieldInstance {
  /** AI configuration for this field instance */
  aiConfig?:
    | AIGeneratedTextConfig
    | AISummaryConfig
    | AITranslationConfig
    | AIImageGenerationConfig
    | AIClassificationConfig
    | AISentimentConfig
    | AIEmbeddingConfig
    | AIQualityScoreConfig
    | PredictiveFieldConfig;
}

// =============================================================================
// AI SERVICE INTERFACES
// =============================================================================

/**
 * AI Content Service interface
 */
export interface AIContentService {
  // Text generation
  generateText(config: AIGeneratedTextConfig, context: Record<string, unknown>): Promise<AIGeneratedTextResult>;
  summarize(config: AISummaryConfig, content: string): Promise<AISummaryResult>;
  translate(config: AITranslationConfig, content: string): Promise<AITranslationResult>;

  // Image generation
  generateImage(config: AIImageGenerationConfig, context: Record<string, unknown>): Promise<AIImageGenerationResult>;

  // Classification
  classify(config: AIClassificationConfig, content: string): Promise<AIClassificationResult>;
  analyzeSentiment(config: AISentimentConfig, content: string): Promise<AISentimentResult>;

  // Embeddings
  generateEmbedding(config: AIEmbeddingConfig, content: string): Promise<AIEmbeddingResult>;
  findSimilar(embedding: number[], limit: number): Promise<Array<{ contentId: string; similarity: number }>>;

  // Quality
  scoreQuality(config: AIQualityScoreConfig, content: Record<string, unknown>): Promise<AIQualityScoreResult>;

  // Predictions
  predict(config: PredictiveFieldConfig, context: Record<string, unknown>): Promise<PredictiveFieldResult>;

  // Learning
  recordPattern(pattern: LearnedPattern): Promise<void>;
  getSuggestions(context: Record<string, unknown>): Promise<PatternSuggestion[]>;
}

/**
 * AI Workflow Service interface
 */
export interface AIWorkflowService {
  // Workflow operations
  evaluateQualityGate(gateId: string, contentId: number): Promise<{ passed: boolean; score: number; feedback: string }>;
  performAIReview(contentId: number, config: AIReviewConfig): Promise<{ approved: boolean; feedback: string; suggestions: string[] }>;
  checkPlagiarism(content: string): Promise<{ score: number; matches: Array<{ source: string; similarity: number }> }>;
  optimizeSEO(content: Record<string, unknown>): Promise<{ score: number; suggestions: Array<{ field: string; suggestion: string }> }>;
  checkAccessibility(content: Record<string, unknown>): Promise<{ score: number; violations: Array<{ rule: string; severity: string; fix: string }> }>;
}

/**
 * Version Intelligence Service interface
 */
export interface VersionIntelligenceService {
  // Diff operations
  generateSmartDiff(oldVersion: Record<string, unknown>, newVersion: Record<string, unknown>): Promise<SmartDiffResult>;
  suggestMerge(sourceVersion: number, targetVersion: number, contentId: number): Promise<MergeSuggestion>;
  resolveConflict(conflict: ConflictDetail): Promise<{ resolution: unknown; confidence: number }>;

  // Changelog
  generateChangelog(contentId: number, fromVersion: number, toVersion: number): Promise<string>;
}

/**
 * Collaboration Service interface
 */
export interface CollaborationService {
  // Presence
  updatePresence(contentId: number, presence: UserPresence): Promise<void>;
  getPresence(contentId: number): Promise<UserPresence[]>;

  // Annotations
  addAnnotation(contentId: number, annotation: Omit<ContentAnnotation, "id" | "createdAt" | "updatedAt">): Promise<ContentAnnotation>;
  resolveAnnotation(annotationId: string, userId: string): Promise<void>;
  getAnnotations(contentId: number): Promise<ContentAnnotation[]>;

  // AI suggestions
  generateAISuggestion(contentId: number, field: string, context: string): Promise<string>;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

export const aiModelConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google", "cohere", "local", "custom"]),
  model: z.string().min(1),
  apiEndpoint: z.string().url().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  timeout: z.number().positive().optional(),
  retryConfig: z.object({
    maxRetries: z.number().int().min(0),
    baseDelay: z.number().positive(),
    maxDelay: z.number().positive(),
  }).optional(),
});

export const aiTriggerSchema = z.object({
  onSave: z.boolean().optional(),
  onPublish: z.boolean().optional(),
  onFieldChange: z.array(z.string()).optional(),
  scheduled: z.object({
    cron: z.string(),
    timezone: z.string(),
  }).optional(),
  manualOnly: z.boolean().optional(),
  debounceMs: z.number().positive().optional(),
});

export const aiFieldConfigBaseSchema = z.object({
  enabled: z.boolean(),
  model: aiModelConfigSchema,
  trigger: aiTriggerSchema,
  cache: z.object({
    enabled: z.boolean(),
    ttlSeconds: z.number().positive(),
    invalidateOn: z.array(z.string()).optional(),
    cacheKey: z.string().optional(),
  }).optional(),
  qualityThreshold: z.number().min(0).max(1).optional(),
  reviewRequired: z.boolean().optional(),
});

export const aiContentTypeSchema = z.object({
  aiCapabilities: z.object({
    enabled: z.boolean(),
    defaultModel: aiModelConfigSchema,
    generation: z.object({
      enabled: z.boolean(),
      templates: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        promptTemplate: z.string(),
        fields: z.record(z.string()),
        examples: z.array(z.record(z.unknown())).optional(),
      })),
    }),
    qa: z.object({
      enabled: z.boolean(),
      dimensions: z.array(z.string()),
      minimumScore: z.number().min(0).max(100),
    }),
    seo: z.object({
      enabled: z.boolean(),
      targetKeywords: z.boolean(),
      metaGeneration: z.boolean(),
      readabilityTarget: z.number().optional(),
    }),
    accessibility: z.object({
      enabled: z.boolean(),
      wcagLevel: z.enum(["A", "AA", "AAA"]),
      autoRemediation: z.boolean(),
    }),
  }),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  AIProvider,
  AIFieldType,
  QualityDimension,
};
