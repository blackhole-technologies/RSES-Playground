/**
 * @file routes.ts
 * @description API route definitions for CMS Content Type System
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * RESTful API design following Drupal's JSON:API patterns.
 */

import { z } from "zod";
import {
  contentTypeSchema,
  fieldStorageSchema,
  fieldInstanceSchema,
  taxonomyVocabularySchema,
  taxonomyTermSchema,
  contentSchema,
} from "./types";
import {
  insertContentTypeSchema,
  insertFieldStorageSchema,
  insertFieldInstanceSchema,
  insertTaxonomyVocabularySchema,
  insertTaxonomyTermSchema,
  insertContentSchema,
  insertViewDisplaySchema,
  insertFormDisplaySchema,
} from "./schema";

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
    errors: z.array(z.object({
      path: z.string(),
      message: z.string(),
    })).optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  conflict: z.object({
    message: z.string(),
    existing: z.unknown().optional(),
  }),
};

const paginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasMore: z.boolean(),
    }),
  });

// =============================================================================
// CONTENT TYPE API
// =============================================================================

export const contentTypeApi = {
  /**
   * List all content types
   */
  list: {
    method: "GET" as const,
    path: "/api/cms/content-types",
    query: z.object({
      includeSystem: z.coerce.boolean().default(false),
    }).optional(),
    responses: {
      200: z.object({
        data: z.array(z.custom<z.infer<typeof insertContentTypeSchema>>()),
        total: z.number(),
      }),
    },
  },

  /**
   * Get a single content type
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/content-types/:id",
    responses: {
      200: z.custom<z.infer<typeof insertContentTypeSchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Create a new content type
   */
  create: {
    method: "POST" as const,
    path: "/api/cms/content-types",
    input: insertContentTypeSchema,
    responses: {
      201: z.custom<z.infer<typeof insertContentTypeSchema>>(),
      400: errorSchemas.validation,
      409: errorSchemas.conflict,
    },
  },

  /**
   * Update a content type
   */
  update: {
    method: "PUT" as const,
    path: "/api/cms/content-types/:id",
    input: insertContentTypeSchema.partial().omit({ id: true }),
    responses: {
      200: z.custom<z.infer<typeof insertContentTypeSchema>>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Delete a content type
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/cms/content-types/:id",
    responses: {
      204: z.void(),
      400: z.object({ message: z.string(), reason: z.string() }), // Cannot delete system type or has content
      404: errorSchemas.notFound,
    },
  },

  /**
   * Get fields for a content type
   */
  getFields: {
    method: "GET" as const,
    path: "/api/cms/content-types/:id/fields",
    responses: {
      200: z.object({
        instances: z.array(z.custom<z.infer<typeof insertFieldInstanceSchema>>()),
        storages: z.array(z.custom<z.infer<typeof insertFieldStorageSchema>>()),
      }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Get display configuration for a content type
   */
  getDisplays: {
    method: "GET" as const,
    path: "/api/cms/content-types/:id/displays",
    responses: {
      200: z.object({
        viewDisplays: z.array(z.custom<z.infer<typeof insertViewDisplaySchema>>()),
        formDisplays: z.array(z.custom<z.infer<typeof insertFormDisplaySchema>>()),
      }),
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// FIELD STORAGE API
// =============================================================================

export const fieldStorageApi = {
  /**
   * List all field storages
   */
  list: {
    method: "GET" as const,
    path: "/api/cms/field-storages",
    query: z.object({
      entityType: z.string().optional(),
      type: z.string().optional(), // Field type filter
    }).optional(),
    responses: {
      200: z.object({
        data: z.array(z.custom<z.infer<typeof insertFieldStorageSchema>>()),
        total: z.number(),
      }),
    },
  },

  /**
   * Get a single field storage
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/field-storages/:id",
    responses: {
      200: z.custom<z.infer<typeof insertFieldStorageSchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Create a new field storage
   */
  create: {
    method: "POST" as const,
    path: "/api/cms/field-storages",
    input: insertFieldStorageSchema,
    responses: {
      201: z.custom<z.infer<typeof insertFieldStorageSchema>>(),
      400: errorSchemas.validation,
      409: errorSchemas.conflict,
    },
  },

  /**
   * Update a field storage
   */
  update: {
    method: "PUT" as const,
    path: "/api/cms/field-storages/:id",
    input: insertFieldStorageSchema.partial().omit({ id: true, fieldName: true, entityType: true, type: true }),
    responses: {
      200: z.custom<z.infer<typeof insertFieldStorageSchema>>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Delete a field storage (only if no instances exist)
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/cms/field-storages/:id",
    responses: {
      204: z.void(),
      400: z.object({ message: z.string(), instances: z.array(z.string()) }),
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// FIELD INSTANCE API
// =============================================================================

export const fieldInstanceApi = {
  /**
   * List field instances
   */
  list: {
    method: "GET" as const,
    path: "/api/cms/field-instances",
    query: z.object({
      entityType: z.string().optional(),
      bundle: z.string().optional(),
    }).optional(),
    responses: {
      200: z.object({
        data: z.array(z.custom<z.infer<typeof insertFieldInstanceSchema>>()),
        total: z.number(),
      }),
    },
  },

  /**
   * Get a single field instance
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/field-instances/:id",
    responses: {
      200: z.custom<z.infer<typeof insertFieldInstanceSchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Create a field instance (attach field to bundle)
   */
  create: {
    method: "POST" as const,
    path: "/api/cms/field-instances",
    input: insertFieldInstanceSchema,
    responses: {
      201: z.custom<z.infer<typeof insertFieldInstanceSchema>>(),
      400: errorSchemas.validation,
      404: z.object({ message: z.string() }), // Storage not found
      409: errorSchemas.conflict,
    },
  },

  /**
   * Update a field instance
   */
  update: {
    method: "PUT" as const,
    path: "/api/cms/field-instances/:id",
    input: insertFieldInstanceSchema.partial().omit({ id: true, fieldName: true, entityType: true, bundle: true }),
    responses: {
      200: z.custom<z.infer<typeof insertFieldInstanceSchema>>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Delete a field instance
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/cms/field-instances/:id",
    query: z.object({
      deleteData: z.coerce.boolean().default(false), // Also delete field data
    }).optional(),
    responses: {
      204: z.void(),
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// VIEW DISPLAY API
// =============================================================================

export const viewDisplayApi = {
  /**
   * Get view display for entity/bundle/mode
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/view-displays/:entityType/:bundle/:mode",
    responses: {
      200: z.custom<z.infer<typeof insertViewDisplaySchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Save view display configuration
   */
  save: {
    method: "PUT" as const,
    path: "/api/cms/view-displays/:entityType/:bundle/:mode",
    input: insertViewDisplaySchema.omit({ id: true, entityType: true, bundle: true, mode: true }),
    responses: {
      200: z.custom<z.infer<typeof insertViewDisplaySchema>>(),
      400: errorSchemas.validation,
    },
  },

  /**
   * Reset view display to defaults
   */
  reset: {
    method: "DELETE" as const,
    path: "/api/cms/view-displays/:entityType/:bundle/:mode",
    responses: {
      204: z.void(),
    },
  },
};

// =============================================================================
// FORM DISPLAY API
// =============================================================================

export const formDisplayApi = {
  /**
   * Get form display for entity/bundle/mode
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/form-displays/:entityType/:bundle/:mode",
    responses: {
      200: z.custom<z.infer<typeof insertFormDisplaySchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Save form display configuration
   */
  save: {
    method: "PUT" as const,
    path: "/api/cms/form-displays/:entityType/:bundle/:mode",
    input: insertFormDisplaySchema.omit({ id: true, entityType: true, bundle: true, mode: true }),
    responses: {
      200: z.custom<z.infer<typeof insertFormDisplaySchema>>(),
      400: errorSchemas.validation,
    },
  },

  /**
   * Reset form display to defaults
   */
  reset: {
    method: "DELETE" as const,
    path: "/api/cms/form-displays/:entityType/:bundle/:mode",
    responses: {
      204: z.void(),
    },
  },
};

// =============================================================================
// TAXONOMY VOCABULARY API
// =============================================================================

export const taxonomyVocabularyApi = {
  /**
   * List all vocabularies
   */
  list: {
    method: "GET" as const,
    path: "/api/cms/vocabularies",
    query: z.object({
      rsesEnabled: z.coerce.boolean().optional(),
    }).optional(),
    responses: {
      200: z.object({
        data: z.array(z.custom<z.infer<typeof insertTaxonomyVocabularySchema>>()),
        total: z.number(),
      }),
    },
  },

  /**
   * Get a single vocabulary
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/vocabularies/:id",
    responses: {
      200: z.custom<z.infer<typeof insertTaxonomyVocabularySchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Create a new vocabulary
   */
  create: {
    method: "POST" as const,
    path: "/api/cms/vocabularies",
    input: insertTaxonomyVocabularySchema,
    responses: {
      201: z.custom<z.infer<typeof insertTaxonomyVocabularySchema>>(),
      400: errorSchemas.validation,
      409: errorSchemas.conflict,
    },
  },

  /**
   * Update a vocabulary
   */
  update: {
    method: "PUT" as const,
    path: "/api/cms/vocabularies/:id",
    input: insertTaxonomyVocabularySchema.partial().omit({ id: true }),
    responses: {
      200: z.custom<z.infer<typeof insertTaxonomyVocabularySchema>>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Delete a vocabulary
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/cms/vocabularies/:id",
    query: z.object({
      deleteTerms: z.coerce.boolean().default(true),
    }).optional(),
    responses: {
      204: z.void(),
      400: z.object({ message: z.string() }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Get vocabulary tree with terms
   */
  getTree: {
    method: "GET" as const,
    path: "/api/cms/vocabularies/:id/tree",
    query: z.object({
      maxDepth: z.coerce.number().min(1).max(10).default(5),
    }).optional(),
    responses: {
      200: z.object({
        vocabulary: z.custom<z.infer<typeof insertTaxonomyVocabularySchema>>(),
        terms: z.array(z.unknown()), // TaxonomyTermWithChildren recursive type
        termCount: z.number(),
      }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Sync vocabulary with RSES classification
   */
  syncRses: {
    method: "POST" as const,
    path: "/api/cms/vocabularies/:id/sync-rses",
    input: z.object({
      configId: z.number().optional(), // Override vocabulary's default config
      dryRun: z.boolean().default(false),
    }).optional(),
    responses: {
      200: z.object({
        vocabulary: z.string(),
        termsCreated: z.number(),
        termsUpdated: z.number(),
        termsDeleted: z.number(),
        symlinksProcessed: z.number(),
        errors: z.array(z.object({ path: z.string(), error: z.string() })),
        dryRun: z.boolean(),
      }),
      400: z.object({ message: z.string() }), // RSES not enabled
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// TAXONOMY TERM API
// =============================================================================

export const taxonomyTermApi = {
  /**
   * List terms in a vocabulary
   */
  list: {
    method: "GET" as const,
    path: "/api/cms/vocabularies/:vocabularyId/terms",
    query: paginationQuerySchema.extend({
      parent: z.coerce.number().optional(), // Filter by parent term
      name: z.string().optional(), // Search by name
    }).optional(),
    responses: {
      200: paginatedResponseSchema(z.custom<z.infer<typeof insertTaxonomyTermSchema>>()),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Get a single term
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/terms/:id",
    responses: {
      200: z.custom<z.infer<typeof insertTaxonomyTermSchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Create a new term
   */
  create: {
    method: "POST" as const,
    path: "/api/cms/vocabularies/:vocabularyId/terms",
    input: insertTaxonomyTermSchema.omit({ vocabularyId: true }),
    responses: {
      201: z.custom<z.infer<typeof insertTaxonomyTermSchema>>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound, // Vocabulary not found
      409: errorSchemas.conflict, // Term with same name exists
    },
  },

  /**
   * Update a term
   */
  update: {
    method: "PUT" as const,
    path: "/api/cms/terms/:id",
    input: insertTaxonomyTermSchema.partial().omit({ vocabularyId: true }),
    responses: {
      200: z.custom<z.infer<typeof insertTaxonomyTermSchema>>(),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Delete a term
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/cms/terms/:id",
    query: z.object({
      deleteChildren: z.coerce.boolean().default(false),
    }).optional(),
    responses: {
      204: z.void(),
      400: z.object({ message: z.string(), childCount: z.number() }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Reorder terms
   */
  reorder: {
    method: "POST" as const,
    path: "/api/cms/vocabularies/:vocabularyId/terms/reorder",
    input: z.object({
      order: z.array(z.object({
        id: z.number(),
        weight: z.number(),
        parentIds: z.array(z.number()).optional(),
      })),
    }),
    responses: {
      200: z.object({ updated: z.number() }),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Merge terms
   */
  merge: {
    method: "POST" as const,
    path: "/api/cms/terms/:id/merge",
    input: z.object({
      sourceTermIds: z.array(z.number()).min(1),
      updateReferences: z.boolean().default(true),
    }),
    responses: {
      200: z.object({
        merged: z.number(),
        referencesUpdated: z.number(),
      }),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// CONTENT API
// =============================================================================

export const contentApi = {
  /**
   * List content
   */
  list: {
    method: "GET" as const,
    path: "/api/cms/content",
    query: paginationQuerySchema.extend({
      type: z.string().optional(), // Content type filter
      published: z.coerce.boolean().optional(),
      promoted: z.coerce.boolean().optional(),
      sticky: z.coerce.boolean().optional(),
      search: z.string().optional(), // Title search
      sort: z.enum(["created", "updated", "title"]).default("created"),
      order: z.enum(["asc", "desc"]).default("desc"),
    }).optional(),
    responses: {
      200: paginatedResponseSchema(z.custom<z.infer<typeof insertContentSchema>>()),
    },
  },

  /**
   * Get a single content item
   */
  get: {
    method: "GET" as const,
    path: "/api/cms/content/:id",
    query: z.object({
      revision: z.coerce.number().optional(), // Get specific revision
      includeFields: z.coerce.boolean().default(true),
    }).optional(),
    responses: {
      200: z.object({
        content: z.custom<z.infer<typeof insertContentSchema>>(),
        fields: z.record(z.array(z.unknown())).optional(),
        type: z.custom<z.infer<typeof insertContentTypeSchema>>(),
      }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Create content
   */
  create: {
    method: "POST" as const,
    path: "/api/cms/content",
    input: z.object({
      content: insertContentSchema,
      fields: z.record(z.array(z.unknown())).optional(),
    }),
    responses: {
      201: z.object({
        content: z.custom<z.infer<typeof insertContentSchema>>(),
        fields: z.record(z.array(z.unknown())),
      }),
      400: errorSchemas.validation,
      404: z.object({ message: z.string() }), // Content type not found
    },
  },

  /**
   * Update content
   */
  update: {
    method: "PUT" as const,
    path: "/api/cms/content/:id",
    input: z.object({
      content: insertContentSchema.partial().omit({ type: true }),
      fields: z.record(z.array(z.unknown())).optional(),
      newRevision: z.boolean().default(false),
      revisionLogMessage: z.string().optional(),
    }),
    responses: {
      200: z.object({
        content: z.custom<z.infer<typeof insertContentSchema>>(),
        fields: z.record(z.array(z.unknown())),
        revision: z.number().optional(),
      }),
      400: errorSchemas.validation,
      404: errorSchemas.notFound,
    },
  },

  /**
   * Delete content
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/cms/content/:id",
    responses: {
      204: z.void(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Get content revisions
   */
  getRevisions: {
    method: "GET" as const,
    path: "/api/cms/content/:id/revisions",
    query: paginationQuerySchema.optional(),
    responses: {
      200: paginatedResponseSchema(z.object({
        id: z.number(),
        revisionNumber: z.number(),
        title: z.string(),
        published: z.boolean(),
        logMessage: z.string().nullable(),
        createdAt: z.string(),
        createdBy: z.number().nullable(),
      })),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Restore a revision
   */
  restoreRevision: {
    method: "POST" as const,
    path: "/api/cms/content/:id/revisions/:revisionNumber/restore",
    responses: {
      200: z.object({
        content: z.custom<z.infer<typeof insertContentSchema>>(),
        newRevision: z.number(),
      }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Publish/unpublish content
   */
  setPublished: {
    method: "PATCH" as const,
    path: "/api/cms/content/:id/publish",
    input: z.object({
      published: z.boolean(),
    }),
    responses: {
      200: z.custom<z.infer<typeof insertContentSchema>>(),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Classify content with RSES
   */
  classify: {
    method: "POST" as const,
    path: "/api/cms/content/:id/classify",
    input: z.object({
      configId: z.number().optional(),
      updateTaxonomy: z.boolean().default(true),
      createSymlinks: z.boolean().default(false),
    }).optional(),
    responses: {
      200: z.object({
        sets: z.array(z.string()),
        topics: z.array(z.string()),
        types: z.array(z.string()),
        termsCreated: z.number(),
        symlinksCreated: z.number(),
      }),
      400: z.object({ message: z.string() }),
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// BULK OPERATIONS API
// =============================================================================

export const bulkApi = {
  /**
   * Bulk update content
   */
  updateContent: {
    method: "POST" as const,
    path: "/api/cms/content/bulk-update",
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
      updates: z.object({
        published: z.boolean().optional(),
        sticky: z.boolean().optional(),
        promoted: z.boolean().optional(),
      }),
    }),
    responses: {
      200: z.object({ updated: z.number() }),
      400: errorSchemas.validation,
    },
  },

  /**
   * Bulk delete content
   */
  deleteContent: {
    method: "POST" as const,
    path: "/api/cms/content/bulk-delete",
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
    }),
    responses: {
      200: z.object({ deleted: z.number() }),
      400: errorSchemas.validation,
    },
  },

  /**
   * Bulk classify content with RSES
   */
  classifyContent: {
    method: "POST" as const,
    path: "/api/cms/content/bulk-classify",
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
      configId: z.number().optional(),
      updateTaxonomy: z.boolean().default(true),
    }),
    responses: {
      200: z.object({
        processed: z.number(),
        termsCreated: z.number(),
        errors: z.array(z.object({ id: z.number(), error: z.string() })),
      }),
      400: errorSchemas.validation,
    },
  },
};

// =============================================================================
// WIDGET/FORMATTER REGISTRY API
// =============================================================================

export const registryApi = {
  /**
   * List available field widgets
   */
  listWidgets: {
    method: "GET" as const,
    path: "/api/cms/registry/widgets",
    query: z.object({
      fieldType: z.string().optional(),
    }).optional(),
    responses: {
      200: z.object({
        widgets: z.array(z.object({
          id: z.string(),
          label: z.string(),
          fieldTypes: z.array(z.string()),
          settings: z.record(z.unknown()),
        })),
      }),
    },
  },

  /**
   * List available field formatters
   */
  listFormatters: {
    method: "GET" as const,
    path: "/api/cms/registry/formatters",
    query: z.object({
      fieldType: z.string().optional(),
    }).optional(),
    responses: {
      200: z.object({
        formatters: z.array(z.object({
          id: z.string(),
          label: z.string(),
          fieldTypes: z.array(z.string()),
          settings: z.record(z.unknown()),
        })),
      }),
    },
  },

  /**
   * List available field types
   */
  listFieldTypes: {
    method: "GET" as const,
    path: "/api/cms/registry/field-types",
    responses: {
      200: z.object({
        fieldTypes: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string(),
          category: z.string(),
          defaultWidget: z.string(),
          defaultFormatter: z.string(),
          storageSettings: z.record(z.unknown()),
          instanceSettings: z.record(z.unknown()),
        })),
      }),
    },
  },
};

// =============================================================================
// SCHEMA/MIGRATION API
// =============================================================================

export const schemaApi = {
  /**
   * Export content type schema (for migrations)
   */
  exportType: {
    method: "GET" as const,
    path: "/api/cms/schema/export/:contentType",
    responses: {
      200: z.object({
        contentType: z.custom<z.infer<typeof insertContentTypeSchema>>(),
        fieldStorages: z.array(z.custom<z.infer<typeof insertFieldStorageSchema>>()),
        fieldInstances: z.array(z.custom<z.infer<typeof insertFieldInstanceSchema>>()),
        viewDisplays: z.array(z.custom<z.infer<typeof insertViewDisplaySchema>>()),
        formDisplays: z.array(z.custom<z.infer<typeof insertFormDisplaySchema>>()),
      }),
      404: errorSchemas.notFound,
    },
  },

  /**
   * Import content type schema
   */
  importType: {
    method: "POST" as const,
    path: "/api/cms/schema/import",
    input: z.object({
      contentType: insertContentTypeSchema,
      fieldStorages: z.array(insertFieldStorageSchema).optional(),
      fieldInstances: z.array(insertFieldInstanceSchema).optional(),
      viewDisplays: z.array(insertViewDisplaySchema).optional(),
      formDisplays: z.array(insertFormDisplaySchema).optional(),
      overwrite: z.boolean().default(false),
    }),
    responses: {
      200: z.object({
        imported: z.object({
          contentType: z.boolean(),
          fieldStorages: z.number(),
          fieldInstances: z.number(),
          viewDisplays: z.number(),
          formDisplays: z.number(),
        }),
        errors: z.array(z.object({ type: z.string(), id: z.string(), error: z.string() })),
      }),
      400: errorSchemas.validation,
      409: errorSchemas.conflict,
    },
  },

  /**
   * List pending migrations
   */
  listMigrations: {
    method: "GET" as const,
    path: "/api/cms/schema/migrations",
    query: z.object({
      status: z.enum(["pending", "completed", "failed"]).optional(),
    }).optional(),
    responses: {
      200: z.object({
        migrations: z.array(z.object({
          id: z.string(),
          version: z.number(),
          description: z.string(),
          status: z.string(),
          executedAt: z.string().nullable(),
        })),
      }),
    },
  },

  /**
   * Run a migration
   */
  runMigration: {
    method: "POST" as const,
    path: "/api/cms/schema/migrations/:id/run",
    responses: {
      200: z.object({
        success: z.boolean(),
        duration: z.number(),
        error: z.string().optional(),
      }),
      404: errorSchemas.notFound,
    },
  },
};

// =============================================================================
// AGGREGATE EXPORTS
// =============================================================================

export const cmsApi = {
  contentTypes: contentTypeApi,
  fieldStorages: fieldStorageApi,
  fieldInstances: fieldInstanceApi,
  viewDisplays: viewDisplayApi,
  formDisplays: formDisplayApi,
  vocabularies: taxonomyVocabularyApi,
  terms: taxonomyTermApi,
  content: contentApi,
  bulk: bulkApi,
  registry: registryApi,
  schema: schemaApi,
};

/**
 * Helper to build API URLs
 */
export function buildCmsUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
