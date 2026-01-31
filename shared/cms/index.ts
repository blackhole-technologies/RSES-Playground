/**
 * @file index.ts
 * @description CMS Content Type System - Public API exports
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 */

// Core types
export * from "./types";

// Database schema
export * from "./schema";

// API routes
export * from "./routes";

// AI content types
export * from "./ai-content-types";

// Media module types (plug-and-play architecture)
export * from "./media-module-types";

// Re-export commonly used types with shorter names
export type {
  ContentType,
  FieldType,
  FieldStorage,
  FieldInstance,
  FieldValue,
  ViewDisplay,
  FormDisplay,
  FieldDisplay,
  FieldWidget,
  TaxonomyVocabulary,
  TaxonomyTerm,
  Content,
  WidgetDefinition,
  FormatterDefinition,
  Migration,
} from "./types";

// Re-export media types for convenience
export type {
  MediaModule,
  MediaPipeline,
  MediaProcessor,
  StorageAdapter,
  MediaCapability,
  ModuleTier,
  StorageProvider,
  PipelineStage,
  MediaMetadata,
  MediaService,
} from "./media-module-types";
