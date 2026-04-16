/**
 * @file schema.ts
 * @description Drizzle ORM schema for CMS Content Type System
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Database schema following Drupal 11's entity/field storage architecture.
 * Uses PostgreSQL with JSONB for flexible field storage.
 */

import { pgTable, text, serial, integer, timestamp, jsonb, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "../schema";

// =============================================================================
// CONTENT TYPES TABLE
// =============================================================================

/**
 * Content types - equivalent to Drupal's node_type table.
 * Stores the definition of each content type.
 */
export const contentTypes = pgTable("cms_content_types", {
  id: text("id").primaryKey(),  // Machine name: article, page, project
  label: text("label").notNull(),
  description: text("description").default(""),
  isSystem: boolean("is_system").default(false),
  module: text("module").default("content"),
  defaultDisplayMode: text("default_display_mode").default("full"),
  defaultFormMode: text("default_form_mode").default("default"),
  publishedByDefault: boolean("published_by_default").default(true),
  revisionsEnabled: boolean("revisions_enabled").default(true),
  newRevisionDefault: boolean("new_revision_default").default(true),
  translationsEnabled: boolean("translations_enabled").default(false),
  menuSettings: jsonb("menu_settings").$type<{
    enabled: boolean;
    availableMenus: string[];
    parentItem: string | null;
  }>().default({ enabled: false, availableMenus: [], parentItem: null }),
  previewMode: text("preview_mode").$type<"optional" | "required" | "disabled">().default("optional"),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContentTypeSchema = createInsertSchema(contentTypes).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbContentType = typeof contentTypes.$inferSelect;
export type DbInsertContentType = z.infer<typeof insertContentTypeSchema>;

// =============================================================================
// FIELD STORAGE TABLE
// =============================================================================

/**
 * Field storage - defines how fields are stored at the schema level.
 * Shared across all instances of the field.
 */
export const fieldStorages = pgTable("cms_field_storages", {
  id: text("id").primaryKey(),  // entity_type.field_name
  fieldName: text("field_name").notNull(),
  entityType: text("entity_type").notNull(),
  type: text("type").notNull(),  // FieldType
  cardinality: integer("cardinality").default(1),
  translatable: boolean("translatable").default(false),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  module: text("module").default("field"),
  locked: boolean("locked").default(false),
  customStorage: boolean("custom_storage").default(false),
  indexes: jsonb("indexes").$type<Record<string, string[]>>().default({}),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_field_storage_entity_type").on(table.entityType),
  index("idx_field_storage_field_name").on(table.fieldName),
]);

export const insertFieldStorageSchema = createInsertSchema(fieldStorages).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbFieldStorage = typeof fieldStorages.$inferSelect;
export type DbInsertFieldStorage = z.infer<typeof insertFieldStorageSchema>;

// =============================================================================
// FIELD INSTANCES TABLE
// =============================================================================

/**
 * Field instances - attaches field storage to specific bundles.
 * Contains bundle-specific configuration.
 */
export const fieldInstances = pgTable("cms_field_instances", {
  id: text("id").primaryKey(),  // entity_type.bundle.field_name
  fieldName: text("field_name").notNull(),
  entityType: text("entity_type").notNull(),
  bundle: text("bundle").notNull(),
  label: text("label").notNull(),
  description: text("description").default(""),
  required: boolean("required").default(false),
  defaultValue: jsonb("default_value").$type<Array<Record<string, unknown>>>().default([]),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_field_instance_entity_bundle").on(table.entityType, table.bundle),
  index("idx_field_instance_field_name").on(table.fieldName),
]);

export const insertFieldInstanceSchema = createInsertSchema(fieldInstances).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbFieldInstance = typeof fieldInstances.$inferSelect;
export type DbInsertFieldInstance = z.infer<typeof insertFieldInstanceSchema>;

// =============================================================================
// VIEW DISPLAY TABLE
// =============================================================================

/**
 * View displays - defines how content is displayed in various modes.
 */
export const viewDisplays = pgTable("cms_view_displays", {
  id: text("id").primaryKey(),  // entity_type.bundle.view_mode
  entityType: text("entity_type").notNull(),
  bundle: text("bundle").notNull(),
  mode: text("mode").notNull(),  // full, teaser, search_result
  status: boolean("status").default(true),
  content: jsonb("content").$type<Record<string, {
    type: string;
    weight: number;
    label: "above" | "inline" | "hidden" | "visually_hidden";
    settings: Record<string, unknown>;
    thirdPartySettings: Record<string, Record<string, unknown>>;
    region?: string;
  }>>().default({}),
  hidden: jsonb("hidden").$type<string[]>().default([]),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_view_display_entity_bundle").on(table.entityType, table.bundle),
]);

// `id` is omitted as a required field because the storage layer derives
// it from `${entityType}.${bundle}.${mode}` if not provided. Callers may
// still supply an explicit id to force a specific value.
export const insertViewDisplaySchema = createInsertSchema(viewDisplays).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(),
});

export type DbViewDisplay = typeof viewDisplays.$inferSelect;
export type DbInsertViewDisplay = z.infer<typeof insertViewDisplaySchema>;

// =============================================================================
// FORM DISPLAY TABLE
// =============================================================================

/**
 * Form displays - defines how content is edited in various modes.
 */
export const formDisplays = pgTable("cms_form_displays", {
  id: text("id").primaryKey(),  // entity_type.bundle.form_mode
  entityType: text("entity_type").notNull(),
  bundle: text("bundle").notNull(),
  mode: text("mode").notNull(),  // default, register, compact
  status: boolean("status").default(true),
  content: jsonb("content").$type<Record<string, {
    type: string;
    weight: number;
    settings: Record<string, unknown>;
    thirdPartySettings: Record<string, Record<string, unknown>>;
    region?: string;
  }>>().default({}),
  hidden: jsonb("hidden").$type<string[]>().default([]),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_form_display_entity_bundle").on(table.entityType, table.bundle),
]);

// Same id-optional pattern as insertViewDisplaySchema.
export const insertFormDisplaySchema = createInsertSchema(formDisplays).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(),
});

export type DbFormDisplay = typeof formDisplays.$inferSelect;
export type DbInsertFormDisplay = z.infer<typeof insertFormDisplaySchema>;

// =============================================================================
// TAXONOMY VOCABULARIES TABLE
// =============================================================================

/**
 * Taxonomy vocabularies - RSES-integrated classification system.
 */
export const taxonomyVocabularies = pgTable("cms_taxonomy_vocabularies", {
  id: text("id").primaryKey(),  // Machine name
  label: text("label").notNull(),
  description: text("description").default(""),
  hierarchy: integer("hierarchy").$type<0 | 1 | 2>().default(0),
  weight: integer("weight").default(0),
  module: text("module").default("taxonomy"),
  rsesIntegration: jsonb("rses_integration").$type<{
    enabled: boolean;
    category: string;
    configId: number | null;
    autoCreateTerms: boolean;
    symlinkBasePath: string | null;
  }>().default({ enabled: false, category: "", configId: null, autoCreateTerms: true, symlinkBasePath: null }),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTaxonomyVocabularySchema = createInsertSchema(taxonomyVocabularies).omit({
  createdAt: true,
  updatedAt: true,
});

export type DbTaxonomyVocabulary = typeof taxonomyVocabularies.$inferSelect;
export type DbInsertTaxonomyVocabulary = z.infer<typeof insertTaxonomyVocabularySchema>;

// =============================================================================
// TAXONOMY TERMS TABLE
// =============================================================================

/**
 * Taxonomy terms - individual classification terms.
 */
export const taxonomyTerms = pgTable("cms_taxonomy_terms", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  vocabularyId: text("vocabulary_id").notNull().references(() => taxonomyVocabularies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default(""),
  descriptionFormat: text("description_format").default("plain_text"),
  weight: integer("weight").default(0),
  parentIds: jsonb("parent_ids").$type<number[]>().default([]),
  alias: text("alias"),
  langcode: text("langcode").default("en"),
  status: boolean("status").default(true),
  rsesMetadata: jsonb("rses_metadata").$type<{
    sourceRule?: string;
    matchedPattern?: string;
    symlinks?: string[];
  } | null>().default(null),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
}, (table) => [
  index("idx_taxonomy_term_vocabulary").on(table.vocabularyId),
  index("idx_taxonomy_term_name").on(table.name),
  uniqueIndex("idx_taxonomy_term_vocab_name").on(table.vocabularyId, table.name),
]);

export const insertTaxonomyTermSchema = createInsertSchema(taxonomyTerms).omit({
  id: true,
  uuid: true,
  createdAt: true,
  updatedAt: true,
});

export type DbTaxonomyTerm = typeof taxonomyTerms.$inferSelect;
export type DbInsertTaxonomyTerm = z.infer<typeof insertTaxonomyTermSchema>;

// =============================================================================
// CONTENT (NODE) TABLE
// =============================================================================

/**
 * Content entities (nodes) - the actual content items.
 */
export const contents = pgTable("cms_contents", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  type: text("type").notNull().references(() => contentTypes.id),
  title: text("title").notNull(),
  langcode: text("langcode").default("en"),
  status: boolean("status").default(true),
  alias: text("alias"),
  published: boolean("published").default(true),
  sticky: boolean("sticky").default(false),
  promoted: boolean("promoted").default(false),
  revisionId: integer("revision_id"),
  rsesClassification: jsonb("rses_classification").$type<{
    sets: string[];
    topics: string[];
    types: string[];
    lastClassified: string;  // ISO date string
  } | null>().default(null),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
}, (table) => [
  index("idx_content_type").on(table.type),
  index("idx_content_published").on(table.published),
  index("idx_content_created").on(table.createdAt),
  uniqueIndex("idx_content_alias").on(table.alias),
]);

export const insertContentSchema = createInsertSchema(contents).omit({
  id: true,
  uuid: true,
  createdAt: true,
  updatedAt: true,
  revisionId: true,
});

export type DbContent = typeof contents.$inferSelect;
export type DbInsertContent = z.infer<typeof insertContentSchema>;

// =============================================================================
// CONTENT REVISIONS TABLE
// =============================================================================

/**
 * Content revisions - stores revision history.
 */
export const contentRevisions = pgTable("cms_content_revisions", {
  id: serial("id").primaryKey(),
  contentId: integer("content_id").notNull().references(() => contents.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  title: text("title").notNull(),
  published: boolean("published").default(true),
  logMessage: text("log_message"),
  fieldData: jsonb("field_data").$type<Record<string, Array<Record<string, unknown>>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => [
  index("idx_content_revision_content").on(table.contentId),
  uniqueIndex("idx_content_revision_number").on(table.contentId, table.revisionNumber),
]);

export const insertContentRevisionSchema = createInsertSchema(contentRevisions).omit({
  id: true,
  createdAt: true,
});

export type DbContentRevision = typeof contentRevisions.$inferSelect;
export type DbInsertContentRevision = z.infer<typeof insertContentRevisionSchema>;

// =============================================================================
// FIELD DATA TABLE (EAV-style for flexibility)
// =============================================================================

/**
 * Field data - stores actual field values for content.
 * Uses EAV pattern for flexibility with denormalized JSONB values.
 */
export const fieldData = pgTable("cms_field_data", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),  // "content", "taxonomy_term"
  entityId: integer("entity_id").notNull(),
  revisionId: integer("revision_id"),
  fieldName: text("field_name").notNull(),
  langcode: text("langcode").default("en"),
  delta: integer("delta").default(0),  // For multi-value fields
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_field_data_entity").on(table.entityType, table.entityId),
  index("idx_field_data_field").on(table.fieldName),
  index("idx_field_data_revision").on(table.revisionId),
  uniqueIndex("idx_field_data_unique").on(
    table.entityType,
    table.entityId,
    table.fieldName,
    table.langcode,
    table.delta
  ),
]);

export const insertFieldDataSchema = createInsertSchema(fieldData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DbFieldData = typeof fieldData.$inferSelect;
export type DbInsertFieldData = z.infer<typeof insertFieldDataSchema>;

// =============================================================================
// VIEW MODES TABLE
// =============================================================================

/**
 * View mode definitions
 */
export const viewModes = pgTable("cms_view_modes", {
  id: text("id").primaryKey(),  // entity_type.mode
  entityType: text("entity_type").notNull(),
  label: text("label").notNull(),
  description: text("description").default(""),
  cache: boolean("cache").default(true),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertViewModeSchema = createInsertSchema(viewModes).omit({
  createdAt: true,
});

export type DbViewMode = typeof viewModes.$inferSelect;
export type DbInsertViewMode = z.infer<typeof insertViewModeSchema>;

// =============================================================================
// FORM MODES TABLE
// =============================================================================

/**
 * Form mode definitions
 */
export const formModes = pgTable("cms_form_modes", {
  id: text("id").primaryKey(),  // entity_type.mode
  entityType: text("entity_type").notNull(),
  label: text("label").notNull(),
  description: text("description").default(""),
  thirdPartySettings: jsonb("third_party_settings").$type<Record<string, Record<string, unknown>>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFormModeSchema = createInsertSchema(formModes).omit({
  createdAt: true,
});

export type DbFormMode = typeof formModes.$inferSelect;
export type DbInsertFormMode = z.infer<typeof insertFormModeSchema>;

// =============================================================================
// MIGRATIONS TABLE
// =============================================================================

/**
 * Schema migrations tracking
 */
export const cmsMigrations = pgTable("cms_migrations", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  description: text("description").notNull(),
  module: text("module").notNull(),
  operations: jsonb("operations").$type<unknown[]>().default([]),
  dependencies: jsonb("dependencies").$type<string[]>().default([]),
  executedAt: timestamp("executed_at"),
  status: text("status").$type<"pending" | "running" | "completed" | "failed">().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMigrationSchema = createInsertSchema(cmsMigrations).omit({
  createdAt: true,
  executedAt: true,
});

export type DbMigration = typeof cmsMigrations.$inferSelect;
export type DbInsertMigration = z.infer<typeof insertMigrationSchema>;

// =============================================================================
// ENTITY REFERENCE SELECTIONS TABLE
// =============================================================================

/**
 * Caches for entity reference autocomplete/selection
 */
export const entityReferenceSelections = pgTable("cms_entity_reference_selections", {
  id: serial("id").primaryKey(),
  fieldId: text("field_id").notNull(),  // field instance ID
  targetType: text("target_type").notNull(),
  targetBundle: text("target_bundle"),
  targetId: integer("target_id").notNull(),
  label: text("label").notNull(),
  weight: integer("weight").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_entity_ref_field").on(table.fieldId),
  index("idx_entity_ref_target").on(table.targetType, table.targetId),
]);

export type DbEntityReferenceSelection = typeof entityReferenceSelections.$inferSelect;

// =============================================================================
// FILE MANAGED TABLE
// =============================================================================

/**
 * Managed files for file/image fields
 */
export const filesManaged = pgTable("cms_files_managed", {
  id: serial("id").primaryKey(),
  uuid: text("uuid").notNull().unique(),
  uri: text("uri").notNull(),
  filename: text("filename").notNull(),
  filemime: text("filemime").notNull(),
  filesize: integer("filesize").notNull(),
  status: boolean("status").default(false),  // false = temporary, true = permanent
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
}, (table) => [
  index("idx_file_uri").on(table.uri),
  index("idx_file_status").on(table.status),
]);

export const insertFileManagedSchema = createInsertSchema(filesManaged).omit({
  id: true,
  uuid: true,
  createdAt: true,
  updatedAt: true,
});

export type DbFileManaged = typeof filesManaged.$inferSelect;
export type DbInsertFileManaged = z.infer<typeof insertFileManagedSchema>;

// =============================================================================
// FILE USAGE TABLE
// =============================================================================

/**
 * Tracks which entities use which files
 */
export const fileUsage = pgTable("cms_file_usage", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => filesManaged.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  count: integer("count").default(1),
}, (table) => [
  index("idx_file_usage_file").on(table.fileId),
  index("idx_file_usage_entity").on(table.entityType, table.entityId),
  uniqueIndex("idx_file_usage_unique").on(table.fileId, table.module, table.entityType, table.entityId),
]);

export type DbFileUsage = typeof fileUsage.$inferSelect;
