/**
 * @file ai-schema.ts
 * @description Drizzle ORM schema for AI-Enhanced CMS Content System
 * @phase Phase 10 - AI-Native CMS
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Database schema for storing AI processing results, embeddings,
 * learning patterns, collaboration state, and workflow data.
 */

import { pgTable, text, serial, integer, timestamp, jsonb, boolean, real, index, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "../schema";
import { contents, contentTypes } from "./schema";
import type {
  AIProvider,
  AIGeneratedTextResult,
  AISummaryResult,
  AITranslationResult,
  AIImageGenerationResult,
  AIClassificationResult,
  AISentimentResult,
  AIEmbeddingResult,
  AIQualityScoreResult,
  PredictiveFieldResult,
  LearnedPattern,
  SmartDiffResult,
  MergeSuggestion,
  UserPresence,
  ContentAnnotation,
  WorkflowStage,
  QualityDimension,
} from "./ai-content-types";

// =============================================================================
// AI PROCESSING RESULTS
// =============================================================================

/**
 * Stores AI processing results for content fields.
 * Allows caching and auditing of AI operations.
 */
export const aiProcessingResults = pgTable("cms_ai_processing_results", {
  id: serial("id").primaryKey(),
  /** Content this result belongs to */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }),
  /** Field that was processed */
  fieldName: text("field_name").notNull(),
  /** Type of AI processing */
  processingType: text("processing_type").$type<
    | "generation"
    | "summary"
    | "translation"
    | "image_generation"
    | "classification"
    | "sentiment"
    | "embedding"
    | "quality_score"
    | "prediction"
  >().notNull(),
  /** AI provider used */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Model used */
  model: text("model").notNull(),
  /** Input context/prompt */
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  /** Processing result */
  result: jsonb("result").$type<
    | AIGeneratedTextResult
    | AISummaryResult
    | AITranslationResult
    | AIImageGenerationResult
    | AIClassificationResult
    | AISentimentResult
    | AIEmbeddingResult
    | AIQualityScoreResult
    | PredictiveFieldResult
  >().notNull(),
  /** Tokens used (for text models) */
  tokensUsed: jsonb("tokens_used").$type<{
    prompt?: number;
    completion?: number;
    total?: number;
  }>(),
  /** Processing cost in cents */
  costCents: integer("cost_cents"),
  /** Processing time in milliseconds */
  processingTimeMs: integer("processing_time_ms").notNull(),
  /** Cache key for deduplication */
  cacheKey: text("cache_key"),
  /** Cache expiration */
  cacheExpiresAt: timestamp("cache_expires_at"),
  /** Whether result was from cache */
  fromCache: boolean("from_cache").default(false),
  /** Error message if processing failed */
  error: text("error"),
  /** Status */
  status: text("status").$type<"pending" | "processing" | "completed" | "failed">().default("pending"),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Completed timestamp */
  completedAt: timestamp("completed_at"),
  /** User who triggered processing */
  triggeredBy: integer("triggered_by").references(() => users.id),
}, (table) => [
  index("idx_ai_results_content").on(table.contentId),
  index("idx_ai_results_type").on(table.processingType),
  index("idx_ai_results_cache").on(table.cacheKey),
  index("idx_ai_results_status").on(table.status),
]);

export const insertAiProcessingResultSchema = createInsertSchema(aiProcessingResults).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type DbAiProcessingResult = typeof aiProcessingResults.$inferSelect;
export type DbInsertAiProcessingResult = z.infer<typeof insertAiProcessingResultSchema>;

// =============================================================================
// CONTENT EMBEDDINGS
// =============================================================================

/**
 * Stores vector embeddings for semantic search.
 * Uses pgvector extension for efficient similarity search.
 */
export const contentEmbeddings = pgTable("cms_content_embeddings", {
  id: serial("id").primaryKey(),
  /** Content this embedding belongs to */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Field that was embedded */
  fieldName: text("field_name").notNull(),
  /** Chunk index (for long content split into chunks) */
  chunkIndex: integer("chunk_index").default(0),
  /** Chunk text */
  chunkText: text("chunk_text"),
  /** Start offset in original text */
  startOffset: integer("start_offset"),
  /** End offset in original text */
  endOffset: integer("end_offset"),
  /** Embedding vector (1536 dimensions for OpenAI, configurable) */
  embedding: jsonb("embedding").$type<number[]>().notNull(),
  /** Embedding dimensions */
  dimensions: integer("dimensions").notNull(),
  /** Model used to generate embedding */
  model: text("model").notNull(),
  /** Provider */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Indexed in vector store */
  indexed: boolean("indexed").default(false),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_embeddings_content").on(table.contentId),
  index("idx_embeddings_field").on(table.fieldName),
  uniqueIndex("idx_embeddings_unique").on(table.contentId, table.fieldName, table.chunkIndex),
]);

export const insertContentEmbeddingSchema = createInsertSchema(contentEmbeddings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DbContentEmbedding = typeof contentEmbeddings.$inferSelect;
export type DbInsertContentEmbedding = z.infer<typeof insertContentEmbeddingSchema>;

// =============================================================================
// AI QUALITY SCORES
// =============================================================================

/**
 * Stores quality assessment scores for content.
 */
export const aiQualityScores = pgTable("cms_ai_quality_scores", {
  id: serial("id").primaryKey(),
  /** Content being scored */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Revision ID (for versioned scoring) */
  revisionId: integer("revision_id"),
  /** Overall score (0-100) */
  overallScore: real("overall_score").notNull(),
  /** Letter grade */
  grade: text("grade").$type<"A" | "B" | "C" | "D" | "F">().notNull(),
  /** Individual dimension scores */
  dimensionScores: jsonb("dimension_scores").$type<Record<QualityDimension, {
    score: number;
    feedback: string;
    suggestions?: string[];
  }>>().notNull(),
  /** Improvement suggestions */
  suggestions: jsonb("suggestions").$type<Array<{
    priority: "high" | "medium" | "low";
    dimension: QualityDimension;
    suggestion: string;
    example?: string;
  }>>().default([]),
  /** Pass/fail status */
  passed: boolean("passed").notNull(),
  /** Model used */
  model: text("model").notNull(),
  /** Provider */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** User who triggered scoring */
  scoredBy: integer("scored_by").references(() => users.id),
}, (table) => [
  index("idx_quality_content").on(table.contentId),
  index("idx_quality_score").on(table.overallScore),
  index("idx_quality_passed").on(table.passed),
]);

export const insertAiQualityScoreSchema = createInsertSchema(aiQualityScores).omit({
  id: true,
  createdAt: true,
});

export type DbAiQualityScore = typeof aiQualityScores.$inferSelect;
export type DbInsertAiQualityScore = z.infer<typeof insertAiQualityScoreSchema>;

// =============================================================================
// LEARNED PATTERNS
// =============================================================================

/**
 * Stores learned patterns from user behavior for predictions.
 */
export const learnedPatterns = pgTable("cms_learned_patterns", {
  id: serial("id").primaryKey(),
  /** Pattern type */
  type: text("type").$type<"field_value" | "taxonomy" | "reference" | "workflow" | "formatting">().notNull(),
  /** Content type this pattern applies to */
  contentType: text("content_type").references(() => contentTypes.id),
  /** Field name this pattern relates to */
  fieldName: text("field_name"),
  /** Pattern context (what triggers this pattern) */
  patternContext: jsonb("pattern_context").$type<Record<string, unknown>>().notNull(),
  /** Pattern outcome (what value to suggest) */
  patternOutcome: jsonb("pattern_outcome").$type<unknown>().notNull(),
  /** How many times this pattern has been observed */
  frequency: integer("frequency").default(1).notNull(),
  /** Confidence score (0-1) */
  confidence: real("confidence").default(0.5).notNull(),
  /** User ID if user-specific pattern */
  userId: integer("user_id").references(() => users.id),
  /** Global pattern (applies to all users) */
  isGlobal: boolean("is_global").default(false),
  /** First observed */
  firstSeen: timestamp("first_seen").defaultNow(),
  /** Last observed */
  lastSeen: timestamp("last_seen").defaultNow(),
  /** Active (can be disabled) */
  active: boolean("active").default(true),
}, (table) => [
  index("idx_patterns_type").on(table.type),
  index("idx_patterns_content_type").on(table.contentType),
  index("idx_patterns_field").on(table.fieldName),
  index("idx_patterns_user").on(table.userId),
  index("idx_patterns_confidence").on(table.confidence),
]);

export const insertLearnedPatternSchema = createInsertSchema(learnedPatterns).omit({
  id: true,
  firstSeen: true,
  lastSeen: true,
});

export type DbLearnedPattern = typeof learnedPatterns.$inferSelect;
export type DbInsertLearnedPattern = z.infer<typeof insertLearnedPatternSchema>;

// =============================================================================
// AI TRANSLATIONS
// =============================================================================

/**
 * Stores AI-generated translations for content fields.
 */
export const aiTranslations = pgTable("cms_ai_translations", {
  id: serial("id").primaryKey(),
  /** Content this translation belongs to */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Field that was translated */
  fieldName: text("field_name").notNull(),
  /** Source language */
  sourceLanguage: text("source_language").notNull(),
  /** Target language */
  targetLanguage: text("target_language").notNull(),
  /** Original text */
  sourceText: text("source_text").notNull(),
  /** Translated text */
  translatedText: text("translated_text").notNull(),
  /** Translation confidence (0-1) */
  confidence: real("confidence").notNull(),
  /** Back-translation for quality verification */
  backTranslation: text("back_translation"),
  /** Quality score (0-1) */
  qualityScore: real("quality_score"),
  /** Model used */
  model: text("model").notNull(),
  /** Provider */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Human reviewed */
  humanReviewed: boolean("human_reviewed").default(false),
  /** Reviewed by user */
  reviewedBy: integer("reviewed_by").references(() => users.id),
  /** Review timestamp */
  reviewedAt: timestamp("reviewed_at"),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_translations_content").on(table.contentId),
  index("idx_translations_lang").on(table.sourceLanguage, table.targetLanguage),
  uniqueIndex("idx_translations_unique").on(table.contentId, table.fieldName, table.targetLanguage),
]);

export const insertAiTranslationSchema = createInsertSchema(aiTranslations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
});

export type DbAiTranslation = typeof aiTranslations.$inferSelect;
export type DbInsertAiTranslation = z.infer<typeof insertAiTranslationSchema>;

// =============================================================================
// AI CLASSIFICATIONS
// =============================================================================

/**
 * Stores AI-generated classifications for content.
 */
export const aiClassifications = pgTable("cms_ai_classifications", {
  id: serial("id").primaryKey(),
  /** Content being classified */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Classification scheme ID */
  schemeId: text("scheme_id").notNull(),
  /** Assigned categories */
  categories: jsonb("categories").$type<Array<{
    categoryId: string;
    categoryLabel: string;
    confidence: number;
    reasoning?: string;
    parentPath?: string[];
  }>>().notNull(),
  /** Model used */
  model: text("model").notNull(),
  /** Provider */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Human verified */
  humanVerified: boolean("human_verified").default(false),
  /** Verified by user */
  verifiedBy: integer("verified_by").references(() => users.id),
  /** Verification timestamp */
  verifiedAt: timestamp("verified_at"),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_classifications_content").on(table.contentId),
  index("idx_classifications_scheme").on(table.schemeId),
]);

export const insertAiClassificationSchema = createInsertSchema(aiClassifications).omit({
  id: true,
  createdAt: true,
  verifiedAt: true,
});

export type DbAiClassification = typeof aiClassifications.$inferSelect;
export type DbInsertAiClassification = z.infer<typeof insertAiClassificationSchema>;

// =============================================================================
// WORKFLOW STATE
// =============================================================================

/**
 * Stores AI workflow state for content.
 */
export const workflowState = pgTable("cms_workflow_state", {
  id: serial("id").primaryKey(),
  /** Content in workflow */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull().unique(),
  /** Workflow ID */
  workflowId: text("workflow_id").notNull(),
  /** Current stage */
  currentStage: text("current_stage").notNull(),
  /** Stage history */
  stageHistory: jsonb("stage_history").$type<Array<{
    stage: string;
    enteredAt: string;
    exitedAt?: string;
    exitReason?: string;
    duration?: number;
  }>>().default([]),
  /** Quality gate results */
  qualityGateResults: jsonb("quality_gate_results").$type<Record<string, {
    passed: boolean;
    score: number;
    feedback: string;
    checkedAt: string;
  }>>().default({}),
  /** AI review results */
  aiReviewResult: jsonb("ai_review_result").$type<{
    approved: boolean;
    feedback: string;
    suggestions: string[];
    reviewedAt: string;
  }>(),
  /** Assigned reviewers */
  assignedReviewers: jsonb("assigned_reviewers").$type<number[]>().default([]),
  /** Deadline */
  deadline: timestamp("deadline"),
  /** Priority */
  priority: text("priority").$type<"low" | "normal" | "high" | "urgent">().default("normal"),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_workflow_workflow").on(table.workflowId),
  index("idx_workflow_stage").on(table.currentStage),
  index("idx_workflow_deadline").on(table.deadline),
]);

export const insertWorkflowStateSchema = createInsertSchema(workflowState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DbWorkflowState = typeof workflowState.$inferSelect;
export type DbInsertWorkflowState = z.infer<typeof insertWorkflowStateSchema>;

// =============================================================================
// VERSION DIFFS
// =============================================================================

/**
 * Stores smart diff results between content versions.
 */
export const versionDiffs = pgTable("cms_version_diffs", {
  id: serial("id").primaryKey(),
  /** Content being compared */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Old version number */
  oldVersion: integer("old_version").notNull(),
  /** New version number */
  newVersion: integer("new_version").notNull(),
  /** Smart diff result */
  diffResult: jsonb("diff_result").$type<SmartDiffResult>().notNull(),
  /** Generated changelog entry */
  changelogEntry: text("changelog_entry"),
  /** Model used */
  model: text("model"),
  /** Provider */
  provider: text("provider").$type<AIProvider>(),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_diffs_content").on(table.contentId),
  uniqueIndex("idx_diffs_versions").on(table.contentId, table.oldVersion, table.newVersion),
]);

export const insertVersionDiffSchema = createInsertSchema(versionDiffs).omit({
  id: true,
  createdAt: true,
});

export type DbVersionDiff = typeof versionDiffs.$inferSelect;
export type DbInsertVersionDiff = z.infer<typeof insertVersionDiffSchema>;

// =============================================================================
// MERGE SUGGESTIONS
// =============================================================================

/**
 * Stores merge suggestions for version conflicts.
 */
export const mergeSuggestions = pgTable("cms_merge_suggestions", {
  id: serial("id").primaryKey(),
  /** Content with conflict */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Source version */
  sourceVersion: integer("source_version").notNull(),
  /** Target version */
  targetVersion: integer("target_version").notNull(),
  /** Field with conflict */
  fieldName: text("field_name").notNull(),
  /** Conflict values */
  conflictValues: jsonb("conflict_values").$type<Array<{
    version: number;
    value: unknown;
    author?: string;
    timestamp: string;
  }>>().notNull(),
  /** Suggested resolution */
  suggestedValue: jsonb("suggested_value"),
  /** Confidence (0-1) */
  confidence: real("confidence"),
  /** Reasoning */
  reasoning: text("reasoning"),
  /** Resolution status */
  status: text("status").$type<"pending" | "accepted" | "rejected" | "manual">().default("pending"),
  /** Resolved by user */
  resolvedBy: integer("resolved_by").references(() => users.id),
  /** Final resolved value */
  resolvedValue: jsonb("resolved_value"),
  /** Model used */
  model: text("model"),
  /** Provider */
  provider: text("provider").$type<AIProvider>(),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Resolved timestamp */
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("idx_merges_content").on(table.contentId),
  index("idx_merges_status").on(table.status),
]);

export const insertMergeSuggestionSchema = createInsertSchema(mergeSuggestions).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export type DbMergeSuggestion = typeof mergeSuggestions.$inferSelect;
export type DbInsertMergeSuggestion = z.infer<typeof insertMergeSuggestionSchema>;

// =============================================================================
// USER PRESENCE (COLLABORATION)
// =============================================================================

/**
 * Stores real-time user presence for collaborative editing.
 */
export const userPresence = pgTable("cms_user_presence", {
  id: serial("id").primaryKey(),
  /** Content being edited */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** User */
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  /** User display name */
  userName: text("user_name").notNull(),
  /** User avatar URL */
  userAvatar: text("user_avatar"),
  /** Cursor position */
  cursorPosition: jsonb("cursor_position").$type<{
    field: string;
    offset: number;
    line?: number;
    column?: number;
  }>(),
  /** Selection range */
  selection: jsonb("selection").$type<{
    field: string;
    startOffset: number;
    endOffset: number;
  }>(),
  /** Currently focused field */
  focusedField: text("focused_field"),
  /** Assigned color */
  color: text("color").notNull(),
  /** Last activity */
  lastActive: timestamp("last_active").defaultNow(),
  /** Session start */
  sessionStart: timestamp("session_start").defaultNow(),
}, (table) => [
  index("idx_presence_content").on(table.contentId),
  uniqueIndex("idx_presence_user_content").on(table.contentId, table.userId),
]);

export const insertUserPresenceSchema = createInsertSchema(userPresence).omit({
  id: true,
  lastActive: true,
  sessionStart: true,
});

export type DbUserPresence = typeof userPresence.$inferSelect;
export type DbInsertUserPresence = z.infer<typeof insertUserPresenceSchema>;

// =============================================================================
// CONTENT ANNOTATIONS (COMMENTS/SUGGESTIONS)
// =============================================================================

/**
 * Stores comments and annotations on content.
 */
export const contentAnnotations = pgTable("cms_content_annotations", {
  id: serial("id").primaryKey(),
  /** Content being annotated */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }).notNull(),
  /** Annotation type */
  type: text("type").$type<"comment" | "suggestion" | "question" | "approval">().notNull(),
  /** Field being annotated */
  fieldName: text("field_name").notNull(),
  /** Selection range (if specific text selected) */
  selectionRange: jsonb("selection_range").$type<{
    startOffset: number;
    endOffset: number;
  }>(),
  /** Annotation content */
  content: text("content").notNull(),
  /** Author */
  authorId: integer("author_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  /** Parent annotation (for replies) */
  parentId: integer("parent_id").references((): any => contentAnnotations.id, { onDelete: "cascade" }),
  /** Resolved status */
  resolved: boolean("resolved").default(false),
  /** Resolved by user */
  resolvedBy: integer("resolved_by").references(() => users.id),
  /** Resolved timestamp */
  resolvedAt: timestamp("resolved_at"),
  /** AI generated */
  aiGenerated: boolean("ai_generated").default(false),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_annotations_content").on(table.contentId),
  index("idx_annotations_field").on(table.fieldName),
  index("idx_annotations_author").on(table.authorId),
  index("idx_annotations_parent").on(table.parentId),
  index("idx_annotations_resolved").on(table.resolved),
]);

export const insertContentAnnotationSchema = createInsertSchema(contentAnnotations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});

export type DbContentAnnotation = typeof contentAnnotations.$inferSelect;
export type DbInsertContentAnnotation = z.infer<typeof insertContentAnnotationSchema>;

// =============================================================================
// AI GENERATED IMAGES
// =============================================================================

/**
 * Stores AI-generated images.
 */
export const aiGeneratedImages = pgTable("cms_ai_generated_images", {
  id: serial("id").primaryKey(),
  /** Content this image belongs to */
  contentId: integer("content_id").references(() => contents.id, { onDelete: "cascade" }),
  /** Field this image is for */
  fieldName: text("field_name"),
  /** Original prompt */
  prompt: text("prompt").notNull(),
  /** Revised prompt (if model modified) */
  revisedPrompt: text("revised_prompt"),
  /** Negative prompt */
  negativePrompt: text("negative_prompt"),
  /** Image URL */
  imageUrl: text("image_url").notNull(),
  /** Local storage path */
  localPath: text("local_path"),
  /** Image dimensions */
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /** File format */
  format: text("format").$type<"png" | "jpg" | "webp">().notNull(),
  /** File size in bytes */
  sizeBytes: integer("size_bytes").notNull(),
  /** Generated alt text */
  altText: text("alt_text"),
  /** Generation seed */
  seed: text("seed"),
  /** Style used */
  style: text("style"),
  /** Model used */
  model: text("model").notNull(),
  /** Provider */
  provider: text("provider").$type<"openai" | "stability" | "midjourney" | "replicate" | "local">().notNull(),
  /** Generation cost in cents */
  costCents: integer("cost_cents"),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Generated by user */
  generatedBy: integer("generated_by").references(() => users.id),
}, (table) => [
  index("idx_ai_images_content").on(table.contentId),
  index("idx_ai_images_field").on(table.fieldName),
]);

export const insertAiGeneratedImageSchema = createInsertSchema(aiGeneratedImages).omit({
  id: true,
  createdAt: true,
});

export type DbAiGeneratedImage = typeof aiGeneratedImages.$inferSelect;
export type DbInsertAiGeneratedImage = z.infer<typeof insertAiGeneratedImageSchema>;

// =============================================================================
// AI USAGE TRACKING
// =============================================================================

/**
 * Tracks AI API usage for cost management and limits.
 */
export const aiUsageTracking = pgTable("cms_ai_usage_tracking", {
  id: serial("id").primaryKey(),
  /** User who made the request */
  userId: integer("user_id").references(() => users.id),
  /** AI provider */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Model used */
  model: text("model").notNull(),
  /** Operation type */
  operationType: text("operation_type").notNull(),
  /** Tokens used (input) */
  inputTokens: integer("input_tokens"),
  /** Tokens used (output) */
  outputTokens: integer("output_tokens"),
  /** Total tokens */
  totalTokens: integer("total_tokens"),
  /** Cost in cents */
  costCents: integer("cost_cents").notNull(),
  /** Request timestamp */
  timestamp: timestamp("timestamp").defaultNow(),
  /** Date partition (for aggregation) */
  datePartition: text("date_partition").notNull(),  // YYYY-MM-DD
  /** Hour partition */
  hourPartition: integer("hour_partition").notNull(),  // 0-23
}, (table) => [
  index("idx_usage_user").on(table.userId),
  index("idx_usage_provider").on(table.provider),
  index("idx_usage_date").on(table.datePartition),
  index("idx_usage_hour").on(table.datePartition, table.hourPartition),
]);

export const insertAiUsageTrackingSchema = createInsertSchema(aiUsageTracking).omit({
  id: true,
  timestamp: true,
});

export type DbAiUsageTracking = typeof aiUsageTracking.$inferSelect;
export type DbInsertAiUsageTracking = z.infer<typeof insertAiUsageTrackingSchema>;

// =============================================================================
// AI MODEL CONFIGURATIONS
// =============================================================================

/**
 * Stores AI model configurations.
 */
export const aiModelConfigs = pgTable("cms_ai_model_configs", {
  id: serial("id").primaryKey(),
  /** Configuration name */
  name: text("name").notNull().unique(),
  /** Description */
  description: text("description"),
  /** Provider */
  provider: text("provider").$type<AIProvider>().notNull(),
  /** Model identifier */
  model: text("model").notNull(),
  /** API endpoint (for custom/local) */
  apiEndpoint: text("api_endpoint"),
  /** API key reference (secret name, not actual key) */
  apiKeyRef: text("api_key_ref"),
  /** Default max tokens */
  maxTokens: integer("max_tokens"),
  /** Default temperature */
  temperature: real("temperature"),
  /** Default top_p */
  topP: real("top_p"),
  /** Timeout in milliseconds */
  timeout: integer("timeout"),
  /** Retry configuration */
  retryConfig: jsonb("retry_config").$type<{
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  }>(),
  /** Rate limits */
  rateLimits: jsonb("rate_limits").$type<{
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  }>(),
  /** Active status */
  active: boolean("active").default(true),
  /** Default for content types */
  defaultFor: jsonb("default_for").$type<string[]>().default([]),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_model_configs_provider").on(table.provider),
  index("idx_model_configs_active").on(table.active),
]);

export const insertAiModelConfigSchema = createInsertSchema(aiModelConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DbAiModelConfig = typeof aiModelConfigs.$inferSelect;
export type DbInsertAiModelConfig = z.infer<typeof insertAiModelConfigSchema>;

// =============================================================================
// CLASSIFICATION SCHEMES
// =============================================================================

/**
 * Stores classification scheme definitions.
 */
export const classificationSchemes = pgTable("cms_classification_schemes", {
  id: text("id").primaryKey(),
  /** Scheme name */
  name: text("name").notNull(),
  /** Description */
  description: text("description"),
  /** Scheme type */
  type: text("type").$type<"predefined" | "learned" | "hybrid">().notNull(),
  /** Categories (for predefined/hybrid) */
  categories: jsonb("categories").$type<Array<{
    id: string;
    label: string;
    description?: string;
    parentId?: string;
    keywords?: string[];
    examples?: string[];
    weight?: number;
  }>>().default([]),
  /** Learning configuration */
  learningConfig: jsonb("learning_config").$type<{
    enabled: boolean;
    minSamples: number;
    updateFrequency: "realtime" | "daily" | "weekly";
  }>(),
  /** Content types this scheme applies to */
  contentTypes: jsonb("content_types").$type<string[]>().default([]),
  /** RSES integration */
  rsesIntegration: jsonb("rses_integration").$type<{
    enabled: boolean;
    vocabularyId: string;
    createNewTerms: boolean;
  }>(),
  /** Active status */
  active: boolean("active").default(true),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClassificationSchemeSchema = createInsertSchema(classificationSchemes).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbClassificationScheme = typeof classificationSchemes.$inferSelect;
export type DbInsertClassificationScheme = z.infer<typeof insertClassificationSchemeSchema>;

// =============================================================================
// WORKFLOW DEFINITIONS
// =============================================================================

/**
 * Stores AI workflow definitions.
 */
export const workflowDefinitions = pgTable("cms_workflow_definitions", {
  id: text("id").primaryKey(),
  /** Workflow name */
  name: text("name").notNull(),
  /** Description */
  description: text("description"),
  /** Content types this workflow applies to */
  contentTypes: jsonb("content_types").$type<string[]>().notNull(),
  /** Workflow stages */
  stages: jsonb("stages").$type<WorkflowStage[]>().notNull(),
  /** AI review configuration */
  aiReviewConfig: jsonb("ai_review_config").$type<{
    enabled: boolean;
    model: {
      provider: AIProvider;
      model: string;
    };
    reviewCriteria: string[];
    feedbackStyle: "summary" | "detailed" | "inline";
    autoApproveThreshold?: number;
    humanReviewRequired: boolean;
  }>(),
  /** Quality gates */
  qualityGates: jsonb("quality_gates").$type<Array<{
    id: string;
    name: string;
    type: "ai_score" | "plagiarism" | "seo" | "accessibility" | "custom";
    threshold: number;
    action: "block" | "warn" | "notify";
  }>>().default([]),
  /** Default workflow for content types */
  isDefault: boolean("is_default").default(false),
  /** Active status */
  active: boolean("active").default(true),
  /** Created timestamp */
  createdAt: timestamp("created_at").defaultNow(),
  /** Updated timestamp */
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkflowDefinitionSchema = createInsertSchema(workflowDefinitions).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbWorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type DbInsertWorkflowDefinition = z.infer<typeof insertWorkflowDefinitionSchema>;
