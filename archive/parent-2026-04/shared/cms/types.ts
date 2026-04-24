/**
 * @file types.ts
 * @description Drupal 11-style Content Type System - Core TypeScript Interfaces
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * This file defines the complete type system for a Drupal 11-inspired CMS.
 * Key concepts:
 * - ContentType: Similar to Drupal's node types
 * - Field: Reusable field definitions with storage and instance layers
 * - Bundle: Variations of entity types (like node bundles)
 * - DisplayMode: View modes for rendering content
 * - FormMode: Form configurations for editing
 * - TaxonomyVocabulary: RSES-integrated classification system
 */

import { z } from "zod";

// =============================================================================
// BASE ENTITY TYPES
// =============================================================================

/**
 * Base entity interface - all entities share these properties.
 * Mirrors Drupal's ContentEntityBase.
 */
export interface BaseEntity {
  id: number;
  uuid: string;
  langcode: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
  updatedBy: number | null;
}

/**
 * Entity type definition - describes an entity type (node, taxonomy_term, etc.)
 */
export interface EntityType {
  id: string;
  label: string;
  plural: string;
  description: string;
  baseTable: string;
  dataTable?: string;
  revisionTable?: string;
  revisionDataTable?: string;
  hasRevisions: boolean;
  hasTranslations: boolean;
  hasBundles: boolean;
  bundleEntityType?: string;
  bundleLabel?: string;
  adminPermission: string;
  handlers: {
    storage: string;
    form: Record<string, string>;
    viewBuilder: string;
    listBuilder: string;
    access: string;
  };
}

// =============================================================================
// CONTENT TYPE (NODE TYPE) DEFINITIONS
// =============================================================================

/**
 * Content type definition - equivalent to Drupal's node type.
 * Defines the structure and behavior of a content type.
 */
export interface ContentType {
  /** Machine name (e.g., "article", "page", "project") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description of what this content type is for */
  description: string;
  /** Whether this is a system content type (cannot be deleted) */
  isSystem: boolean;
  /** Module that defines this content type */
  module: string;
  /** Default display mode for viewing */
  defaultDisplayMode: string;
  /** Default form mode for editing */
  defaultFormMode: string;
  /** Whether content of this type is published by default */
  publishedByDefault: boolean;
  /** Whether this content type supports revisions */
  revisionsEnabled: boolean;
  /** Whether to create new revision by default */
  newRevisionDefault: boolean;
  /** Whether this content type supports translations */
  translationsEnabled: boolean;
  /** Menu settings */
  menuSettings: {
    enabled: boolean;
    availableMenus: string[];
    parentItem: string | null;
  };
  /** Preview mode: "optional", "required", "disabled" */
  previewMode: "optional" | "required" | "disabled";
  /** Third-party settings (for extending) */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Zod schema for ContentType validation
 */
export const contentTypeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, "ID must be lowercase letters, numbers, and underscores"),
  label: z.string().min(1).max(255),
  description: z.string().max(1024).default(""),
  isSystem: z.boolean().default(false),
  module: z.string().default("content"),
  defaultDisplayMode: z.string().default("full"),
  defaultFormMode: z.string().default("default"),
  publishedByDefault: z.boolean().default(true),
  revisionsEnabled: z.boolean().default(true),
  newRevisionDefault: z.boolean().default(true),
  translationsEnabled: z.boolean().default(false),
  menuSettings: z.object({
    enabled: z.boolean().default(false),
    availableMenus: z.array(z.string()).default([]),
    parentItem: z.string().nullable().default(null),
  }).default({}),
  previewMode: z.enum(["optional", "required", "disabled"]).default("optional"),
  thirdPartySettings: z.record(z.record(z.unknown())).default({}),
});

export type InsertContentType = z.infer<typeof contentTypeSchema>;

// =============================================================================
// FIELD SYSTEM
// =============================================================================

/**
 * Field types supported by the system.
 * Each type has its own storage, widget, and formatter implementations.
 */
export type FieldType =
  // Text fields
  | "string"           // Short text (255 chars)
  | "string_long"      // Long text (no limit)
  | "text"             // Text with format/filter
  | "text_long"        // Long text with format
  | "text_with_summary" // Text with summary (for body fields)
  // Numeric fields
  | "integer"
  | "decimal"
  | "float"
  // Boolean
  | "boolean"
  // Date/time
  | "datetime"
  | "daterange"
  | "timestamp"
  // Lists
  | "list_string"
  | "list_integer"
  | "list_float"
  // References
  | "entity_reference"  // Reference to any entity
  | "entity_reference_revisions" // Reference with revision tracking
  | "taxonomy_term_reference" // Specifically for taxonomy terms
  | "file"
  | "image"
  // Special
  | "link"
  | "email"
  | "telephone"
  | "uri"
  | "uuid"
  | "password"
  | "computed"  // Computed/virtual field
  // RSES-specific
  | "rses_classification" // RSES classification result
  | "rses_symlink"        // RSES symlink reference
  ;

/**
 * Field storage definition - defines how a field is stored.
 * This is the schema-level definition, shared across all instances.
 */
export interface FieldStorage {
  /** Unique ID: entity_type.field_name */
  id: string;
  /** Field name (machine name) */
  fieldName: string;
  /** Entity type this field can attach to */
  entityType: string;
  /** Field type */
  type: FieldType;
  /** Cardinality: 1 for single, -1 for unlimited, n for specific limit */
  cardinality: number;
  /** Whether this field is translatable */
  translatable: boolean;
  /** Type-specific settings */
  settings: FieldStorageSettings;
  /** Module that provides this field storage */
  module: string;
  /** Whether this is locked (cannot be deleted) */
  locked: boolean;
  /** Custom storage (not in default field table) */
  customStorage: boolean;
  /** Storage indexes for performance */
  indexes: Record<string, string[]>;
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Field storage settings by type
 */
export interface FieldStorageSettings {
  // Text fields
  maxLength?: number;
  isAscii?: boolean;
  caseSensitive?: boolean;

  // Numeric fields
  precision?: number;
  scale?: number;
  unsigned?: boolean;

  // List fields
  allowedValues?: Array<{ value: string | number; label: string }>;
  allowedValuesFunction?: string;

  // Reference fields
  targetType?: string;  // Entity type to reference

  // File/Image fields
  uriScheme?: string;
  targetBundle?: string[];

  // RSES fields
  rsesConfigId?: number;
}

/**
 * Zod schema for FieldStorage
 */
export const fieldStorageSchema = z.object({
  id: z.string(),
  fieldName: z.string().regex(/^field_[a-z][a-z0-9_]*$/, "Field name must start with 'field_' followed by lowercase letters, numbers, and underscores"),
  entityType: z.string(),
  type: z.string() as z.ZodType<FieldType>,
  cardinality: z.number().int().min(-1).default(1),
  translatable: z.boolean().default(false),
  settings: z.record(z.unknown()).default({}),
  module: z.string().default("field"),
  locked: z.boolean().default(false),
  customStorage: z.boolean().default(false),
  indexes: z.record(z.array(z.string())).default({}),
  thirdPartySettings: z.record(z.record(z.unknown())).default({}),
});

export type InsertFieldStorage = z.infer<typeof fieldStorageSchema>;

/**
 * Field instance - attaches a field storage to a specific bundle.
 * Contains instance-specific configuration.
 */
export interface FieldInstance {
  /** Unique ID: entity_type.bundle.field_name */
  id: string;
  /** Field name */
  fieldName: string;
  /** Entity type */
  entityType: string;
  /** Bundle (content type) this instance belongs to */
  bundle: string;
  /** Human-readable label */
  label: string;
  /** Description/help text */
  description: string;
  /** Whether this field is required */
  required: boolean;
  /** Default value */
  defaultValue: FieldValue[];
  /** Instance-specific settings */
  settings: FieldInstanceSettings;
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Field instance settings
 */
export interface FieldInstanceSettings {
  // Reference fields
  handlerSettings?: {
    targetBundles?: Record<string, string>;
    sort?: { field: string; direction: "ASC" | "DESC" };
    autoCreateBundle?: string;
  };

  // Text fields
  textProcessing?: boolean;
  displaySummary?: boolean;

  // File fields
  fileDirectory?: string;
  fileExtensions?: string;
  maxFilesize?: string;

  // Image fields
  altFieldRequired?: boolean;
  titleFieldRequired?: boolean;
  minResolution?: string;
  maxResolution?: string;
  defaultImage?: { uuid: string; alt: string; title: string };

  // RSES fields
  rsesCategories?: ("topic" | "type" | "set")[];
  rsesAutoClassify?: boolean;
}

/**
 * Zod schema for FieldInstance
 */
export const fieldInstanceSchema = z.object({
  id: z.string(),
  fieldName: z.string(),
  entityType: z.string(),
  bundle: z.string(),
  label: z.string().min(1).max(255),
  description: z.string().max(1024).default(""),
  required: z.boolean().default(false),
  defaultValue: z.array(z.record(z.unknown())).default([]),
  settings: z.record(z.unknown()).default({}),
  thirdPartySettings: z.record(z.record(z.unknown())).default({}),
});

export type InsertFieldInstance = z.infer<typeof fieldInstanceSchema>;

/**
 * Field value - the actual value stored for a field
 */
export interface FieldValue {
  value?: string | number | boolean | null;
  format?: string;  // Text format
  summary?: string; // For text_with_summary
  targetId?: number; // For references
  targetType?: string;
  targetUuid?: string;
  targetRevisionId?: number;
  uri?: string;
  title?: string;
  alt?: string;
  width?: number;
  height?: number;
  langcode?: string;
  delta?: number;  // Position in multi-value fields
  [key: string]: unknown;  // Allow custom properties
}

// =============================================================================
// DISPLAY MODES
// =============================================================================

/**
 * View display mode - defines how content is displayed.
 */
export interface ViewDisplay {
  /** ID: entity_type.bundle.view_mode */
  id: string;
  entityType: string;
  bundle: string;
  mode: string;  // "full", "teaser", "search_result", etc.
  /** Whether this display is enabled */
  status: boolean;
  /** Field display settings */
  content: Record<string, FieldDisplay>;
  /** Hidden fields */
  hidden: string[];
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Field display configuration within a view display
 */
export interface FieldDisplay {
  /** Formatter type */
  type: string;
  /** Weight for ordering */
  weight: number;
  /** Display label: "above", "inline", "hidden", "visually_hidden" */
  label: "above" | "inline" | "hidden" | "visually_hidden";
  /** Formatter settings */
  settings: Record<string, unknown>;
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  /** Region (for layout builder) */
  region?: string;
}

/**
 * Form display mode - defines how content is edited.
 */
export interface FormDisplay {
  /** ID: entity_type.bundle.form_mode */
  id: string;
  entityType: string;
  bundle: string;
  mode: string;  // "default", "register", "compact", etc.
  /** Whether this form display is enabled */
  status: boolean;
  /** Field form configurations */
  content: Record<string, FieldWidget>;
  /** Hidden fields */
  hidden: string[];
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Field widget configuration within a form display
 */
export interface FieldWidget {
  /** Widget type */
  type: string;
  /** Weight for ordering */
  weight: number;
  /** Widget settings */
  settings: Record<string, unknown>;
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  /** Region (for form groups) */
  region?: string;
}

// =============================================================================
// VIEW/FORM MODE DEFINITIONS
// =============================================================================

/**
 * View mode definition
 */
export interface ViewMode {
  id: string;  // "node.full", "node.teaser"
  entityType: string;
  label: string;
  description: string;
  /** Whether content of this mode is cached */
  cache: boolean;
  thirdPartySettings: Record<string, Record<string, unknown>>;
}

/**
 * Form mode definition
 */
export interface FormMode {
  id: string;  // "node.default", "user.register"
  entityType: string;
  label: string;
  description: string;
  thirdPartySettings: Record<string, Record<string, unknown>>;
}

// =============================================================================
// TAXONOMY SYSTEM (RSES INTEGRATED)
// =============================================================================

/**
 * Taxonomy vocabulary - RSES-integrated classification system.
 * In RSES, vocabularies are defined through symlink categories.
 */
export interface TaxonomyVocabulary {
  /** Machine name (e.g., "topics", "types", "tags") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Description */
  description: string;
  /** Hierarchy type: 0=disabled, 1=single, 2=multiple */
  hierarchy: 0 | 1 | 2;
  /** Weight for sorting */
  weight: number;
  /** Module that defines this vocabulary */
  module: string;
  /** RSES integration settings */
  rsesIntegration: {
    /** Whether this vocabulary is managed by RSES */
    enabled: boolean;
    /** RSES category type: "topic", "type", or custom */
    category: string;
    /** Config ID to use for classification */
    configId: number | null;
    /** Whether to auto-create terms from RSES results */
    autoCreateTerms: boolean;
    /** Symlink base path for this vocabulary */
    symlinkBasePath: string | null;
  };
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Zod schema for TaxonomyVocabulary
 */
export const taxonomyVocabularySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(255),
  description: z.string().max(1024).default(""),
  hierarchy: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  weight: z.number().int().default(0),
  module: z.string().default("taxonomy"),
  rsesIntegration: z.object({
    enabled: z.boolean().default(false),
    category: z.string().default(""),
    configId: z.number().nullable().default(null),
    autoCreateTerms: z.boolean().default(true),
    symlinkBasePath: z.string().nullable().default(null),
  }).default({}),
  thirdPartySettings: z.record(z.record(z.unknown())).default({}),
});

export type InsertTaxonomyVocabulary = z.infer<typeof taxonomyVocabularySchema>;

/**
 * Taxonomy term - individual classification term
 */
export interface TaxonomyTerm extends BaseEntity {
  /** Term name */
  name: string;
  /** Vocabulary this term belongs to */
  vocabularyId: string;
  /** Description */
  description: string;
  /** Text format for description */
  descriptionFormat: string;
  /** Weight for sorting */
  weight: number;
  /** Parent term IDs (for hierarchy) */
  parentIds: number[];
  /** URL alias */
  alias: string | null;
  /** RSES-derived metadata */
  rsesMetadata: {
    /** Source RSES rule that created this term */
    sourceRule?: string;
    /** Matched pattern */
    matchedPattern?: string;
    /** Related symlinks */
    symlinks?: string[];
  } | null;
}

/**
 * Zod schema for TaxonomyTerm
 */
export const taxonomyTermSchema = z.object({
  name: z.string().min(1).max(255),
  vocabularyId: z.string(),
  description: z.string().default(""),
  descriptionFormat: z.string().default("plain_text"),
  weight: z.number().int().default(0),
  parentIds: z.array(z.number()).default([]),
  alias: z.string().nullable().default(null),
  rsesMetadata: z.object({
    sourceRule: z.string().optional(),
    matchedPattern: z.string().optional(),
    symlinks: z.array(z.string()).optional(),
  }).nullable().default(null),
});

export type InsertTaxonomyTerm = z.infer<typeof taxonomyTermSchema>;

// =============================================================================
// CONTENT (NODE) ENTITY
// =============================================================================

/**
 * Content entity (node) - the actual content item
 */
export interface Content extends BaseEntity {
  /** Content type (bundle) */
  type: string;
  /** Title */
  title: string;
  /** URL alias */
  alias: string | null;
  /** Published status */
  published: boolean;
  /** Sticky at top of lists */
  sticky: boolean;
  /** Promoted to front page */
  promoted: boolean;
  /** Revision ID (if revisions enabled) */
  revisionId: number | null;
  /** Revision log message */
  revisionLogMessage: string | null;
  /** Field values (stored separately) */
  fieldValues?: Record<string, FieldValue[]>;
  /** RSES classification (cached) */
  rsesClassification?: {
    sets: string[];
    topics: string[];
    types: string[];
    lastClassified: Date;
  };
}

/**
 * Zod schema for Content
 */
export const contentSchema = z.object({
  type: z.string(),
  title: z.string().min(1).max(255),
  langcode: z.string().default("en"),
  status: z.boolean().default(true),
  alias: z.string().nullable().default(null),
  published: z.boolean().default(true),
  sticky: z.boolean().default(false),
  promoted: z.boolean().default(false),
  revisionLogMessage: z.string().nullable().default(null),
});

export type InsertContent = z.infer<typeof contentSchema>;

// =============================================================================
// WIDGET AND FORMATTER TYPES
// =============================================================================

/**
 * Widget definition - how a field is edited
 */
export interface WidgetDefinition {
  id: string;
  label: string;
  fieldTypes: FieldType[];
  settings: Record<string, WidgetSettingDefinition>;
  class: string;  // Implementation class/function name
}

/**
 * Widget setting definition
 */
export interface WidgetSettingDefinition {
  type: "string" | "number" | "boolean" | "select";
  label: string;
  default: unknown;
  options?: Record<string, string>;
}

/**
 * Formatter definition - how a field is displayed
 */
export interface FormatterDefinition {
  id: string;
  label: string;
  fieldTypes: FieldType[];
  settings: Record<string, FormatterSettingDefinition>;
  class: string;
}

/**
 * Formatter setting definition
 */
export interface FormatterSettingDefinition {
  type: "string" | "number" | "boolean" | "select";
  label: string;
  default: unknown;
  options?: Record<string, string>;
}

// =============================================================================
// BUNDLE SYSTEM
// =============================================================================

/**
 * Bundle definition - variations of an entity type
 */
export interface Bundle {
  /** Bundle ID (machine name) */
  id: string;
  /** Entity type this bundle belongs to */
  entityType: string;
  /** Human-readable label */
  label: string;
  /** Description */
  description: string;
  /** Module that provides this bundle */
  module: string;
  /** Whether this is translatable */
  translatable: boolean;
  /** Third-party settings */
  thirdPartySettings: Record<string, Record<string, unknown>>;
}

// =============================================================================
// ENTITY REFERENCE SELECTION HANDLERS
// =============================================================================

/**
 * Selection handler - controls which entities can be referenced
 */
export interface SelectionHandler {
  id: string;
  label: string;
  targetType: string;
  configuration: {
    targetBundles?: string[];
    sort?: { field: string; direction: "ASC" | "DESC" };
    filter?: Record<string, unknown>;
    autoCreate?: {
      bundle: string;
      uid: number;
    };
  };
}

// =============================================================================
// MIGRATIONS
// =============================================================================

/**
 * Schema migration definition
 */
export interface Migration {
  id: string;
  version: number;
  description: string;
  module: string;
  operations: MigrationOperation[];
  dependencies: string[];
  executedAt: Date | null;
  status: "pending" | "running" | "completed" | "failed";
  errorMessage: string | null;
}

/**
 * Migration operation types
 */
export type MigrationOperation =
  | { type: "createTable"; table: string; columns: Record<string, ColumnDefinition> }
  | { type: "dropTable"; table: string }
  | { type: "addColumn"; table: string; column: string; definition: ColumnDefinition }
  | { type: "dropColumn"; table: string; column: string }
  | { type: "addIndex"; table: string; name: string; columns: string[] }
  | { type: "dropIndex"; table: string; name: string }
  | { type: "addForeignKey"; table: string; column: string; references: { table: string; column: string } }
  | { type: "sql"; query: string }
  ;

/**
 * Column definition for migrations
 */
export interface ColumnDefinition {
  type: "text" | "integer" | "boolean" | "timestamp" | "jsonb" | "serial";
  nullable?: boolean;
  default?: unknown;
  primaryKey?: boolean;
  unique?: boolean;
  references?: { table: string; column: string };
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Content type list response
 */
export interface ContentTypeListResponse {
  data: ContentType[];
  total: number;
}

/**
 * Field list response
 */
export interface FieldListResponse {
  storages: FieldStorage[];
  instances: FieldInstance[];
}

/**
 * Content list response with pagination
 */
export interface ContentListResponse {
  data: Content[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Taxonomy tree response
 */
export interface TaxonomyTreeResponse {
  vocabulary: TaxonomyVocabulary;
  terms: TaxonomyTermWithChildren[];
}

export interface TaxonomyTermWithChildren extends TaxonomyTerm {
  children: TaxonomyTermWithChildren[];
  depth: number;
}

/**
 * RSES sync result
 */
export interface RsesSyncResult {
  vocabulary: string;
  termsCreated: number;
  termsUpdated: number;
  termsDeleted: number;
  symlinksProcessed: number;
  errors: Array<{ path: string; error: string }>;
}
