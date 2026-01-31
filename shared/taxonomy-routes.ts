/**
 * @file taxonomy-routes.ts
 * @description API route definitions for the RSES Taxonomy/Vocabulary system.
 *
 * @phase CMS Transformation - Auto-Link Integration
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 */

import { z } from "zod";

// ============================================================================
// SHARED SCHEMAS
// ============================================================================

/**
 * Base error schemas.
 */
export const taxonomyErrorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  conflict: z.object({
    message: z.string(),
    conflictingItems: z.array(z.string()).optional(),
  }),
};

/**
 * Term schema for API responses.
 */
export const termSchema = z.object({
  id: z.string(),
  value: z.string(),
  label: z.string(),
  vocabularyId: z.string(),
  parentId: z.string().nullable(),
  childIds: z.array(z.string()),
  contentCount: z.number(),
  weight: z.number(),
  symlinkPath: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastClassifiedAt: z.string().datetime().nullable(),
  metadata: z.record(z.unknown()),
});

export type TermDTO = z.infer<typeof termSchema>;

/**
 * Vocabulary schema for API responses.
 */
export const vocabularySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sourceCategory: z.enum(["topic", "type", "filetype", "custom"]),
  hierarchy: z.object({
    enabled: z.boolean(),
    delimiter: z.string(),
    maxDepth: z.number(),
    roots: z.array(z.string()),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  configVersion: z.number().nullable(),
});

export type VocabularyDTO = z.infer<typeof vocabularySchema>;

/**
 * Content reference schema.
 */
export const contentReferenceSchema = z.object({
  contentId: z.string(),
  name: z.string(),
  classifiedAt: z.string().datetime(),
  confidence: z.number(),
  attributes: z.record(z.string()),
  hasSymlink: z.boolean(),
  symlinkPath: z.string().nullable(),
});

export type ContentReferenceDTO = z.infer<typeof contentReferenceSchema>;

/**
 * Classification result schema.
 */
export const classificationResultSchema = z.object({
  contentId: z.string(),
  timestamp: z.string().datetime(),
  configVersion: z.number().nullable(),
  sets: z.array(z.string()),
  termAssignments: z.array(z.object({
    vocabularyId: z.string(),
    termId: z.string(),
    termValue: z.string(),
    confidence: z.number(),
    matchType: z.enum(["pattern", "attribute", "compound", "override", "default"]),
  })),
  conflicts: z.array(z.object({
    type: z.enum(["multiple_matches", "hierarchy_ambiguity", "priority_tie"]),
    vocabularyId: z.string(),
    conflictingTerms: z.array(z.string()),
    resolution: z.enum(["first_match", "all_matches", "highest_priority", "most_specific", "manual"]),
    resolvedTerms: z.array(z.string()),
  })),
  needsReview: z.boolean(),
});

export type ClassificationResultDTO = z.infer<typeof classificationResultSchema>;

/**
 * Batch classification result schema.
 */
export const batchClassificationResultSchema = z.object({
  totalProcessed: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  reviewCount: z.number(),
  duration: z.number(),
  newTermsCreated: z.number(),
  errors: z.array(z.object({
    contentId: z.string(),
    error: z.string(),
  })),
});

export type BatchClassificationResultDTO = z.infer<typeof batchClassificationResultSchema>;

/**
 * Re-classification plan schema.
 */
export const reclassificationPlanSchema = z.object({
  id: z.string(),
  affectedContentCount: z.number(),
  affectedVocabularies: z.array(z.string()),
  estimatedDuration: z.number(),
  mode: z.enum(["incremental", "full"]),
  changes: z.object({
    addedRules: z.number(),
    removedRules: z.number(),
    modifiedRules: z.number(),
    setChanges: z.object({
      added: z.number(),
      removed: z.number(),
      modified: z.number(),
    }),
  }),
});

export type ReclassificationPlanDTO = z.infer<typeof reclassificationPlanSchema>;

// ============================================================================
// VOCABULARY API
// ============================================================================

export const vocabularyApi = {
  /**
   * List all vocabularies.
   */
  list: {
    method: "GET" as const,
    path: "/api/taxonomy/vocabularies",
    responses: {
      200: z.array(vocabularySchema.extend({
        termCount: z.number(),
        contentCount: z.number(),
      })),
    },
  },

  /**
   * Get a vocabulary by ID.
   */
  get: {
    method: "GET" as const,
    path: "/api/taxonomy/vocabularies/:id",
    responses: {
      200: vocabularySchema,
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Create a custom vocabulary.
   */
  create: {
    method: "POST" as const,
    path: "/api/taxonomy/vocabularies",
    input: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      hierarchy: z.object({
        enabled: z.boolean().default(false),
        delimiter: z.string().max(5).default("/"),
        maxDepth: z.number().min(1).max(10).default(5),
      }).optional(),
    }),
    responses: {
      201: vocabularySchema,
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Update a vocabulary.
   */
  update: {
    method: "PATCH" as const,
    path: "/api/taxonomy/vocabularies/:id",
    input: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).nullable().optional(),
      hierarchy: z.object({
        enabled: z.boolean().optional(),
        delimiter: z.string().max(5).optional(),
        maxDepth: z.number().min(1).max(10).optional(),
      }).optional(),
    }),
    responses: {
      200: vocabularySchema,
      404: taxonomyErrorSchemas.notFound,
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Delete a vocabulary.
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/taxonomy/vocabularies/:id",
    responses: {
      204: z.void(),
      404: taxonomyErrorSchemas.notFound,
      409: taxonomyErrorSchemas.conflict, // If vocabulary has content
    },
  },

  /**
   * Sync vocabularies from current RSES config.
   */
  sync: {
    method: "POST" as const,
    path: "/api/taxonomy/vocabularies/sync",
    responses: {
      200: z.object({
        vocabulariesCreated: z.number(),
        vocabulariesUpdated: z.number(),
        termsCreated: z.number(),
        termsUpdated: z.number(),
        termsRemoved: z.number(),
      }),
    },
  },
};

// ============================================================================
// TERM API
// ============================================================================

export const termApi = {
  /**
   * List terms in a vocabulary.
   */
  list: {
    method: "GET" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms",
    query: z.object({
      parentId: z.string().optional(),
      includeChildren: z.coerce.boolean().default(false),
      sortBy: z.enum(["value", "label", "contentCount", "createdAt"]).default("value"),
      sortOrder: z.enum(["asc", "desc"]).default("asc"),
      limit: z.coerce.number().min(1).max(1000).default(100),
      offset: z.coerce.number().min(0).default(0),
    }).optional(),
    responses: {
      200: z.object({
        terms: z.array(termSchema),
        total: z.number(),
      }),
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Get term tree for a vocabulary (hierarchical).
   */
  tree: {
    method: "GET" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/tree",
    responses: {
      200: z.lazy((): z.ZodType => z.array(z.object({
        term: termSchema,
        children: z.array(z.lazy(() => z.object({
          term: termSchema,
          children: z.array(z.any()),
        }))),
      }))),
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Get a specific term.
   */
  get: {
    method: "GET" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId",
    responses: {
      200: termSchema.extend({
        contentRefs: z.array(contentReferenceSchema),
      }),
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Create a term manually.
   */
  create: {
    method: "POST" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms",
    input: z.object({
      value: z.string().min(1).max(200),
      label: z.string().min(1).max(200).optional(),
      parentId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
    responses: {
      201: termSchema,
      400: taxonomyErrorSchemas.validation,
      404: taxonomyErrorSchemas.notFound,
      409: taxonomyErrorSchemas.conflict, // If term value already exists
    },
  },

  /**
   * Update a term.
   */
  update: {
    method: "PATCH" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId",
    input: z.object({
      label: z.string().min(1).max(200).optional(),
      metadata: z.record(z.unknown()).optional(),
    }),
    responses: {
      200: termSchema,
      404: taxonomyErrorSchemas.notFound,
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Delete a term.
   */
  delete: {
    method: "DELETE" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId",
    query: z.object({
      deleteChildren: z.coerce.boolean().default(false),
      reassignTo: z.string().optional(), // Move content to another term
    }).optional(),
    responses: {
      204: z.void(),
      404: taxonomyErrorSchemas.notFound,
      409: taxonomyErrorSchemas.conflict, // If term has content and no reassignment specified
    },
  },

  /**
   * Move a term in the hierarchy.
   */
  move: {
    method: "POST" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId/move",
    input: z.object({
      newParentId: z.string().nullable(),
    }),
    responses: {
      200: termSchema,
      404: taxonomyErrorSchemas.notFound,
      400: taxonomyErrorSchemas.validation, // If would create cycle
    },
  },

  /**
   * Merge two terms.
   */
  merge: {
    method: "POST" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId/merge",
    input: z.object({
      targetTermId: z.string(),
      deleteSource: z.boolean().default(true),
    }),
    responses: {
      200: termSchema,
      404: taxonomyErrorSchemas.notFound,
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Search terms across vocabularies.
   */
  search: {
    method: "GET" as const,
    path: "/api/taxonomy/terms/search",
    query: z.object({
      q: z.string().min(1),
      vocabularyIds: z.string().optional(), // Comma-separated
      matchType: z.enum(["exact", "prefix", "contains"]).default("contains"),
      limit: z.coerce.number().min(1).max(100).default(20),
    }),
    responses: {
      200: z.array(termSchema.extend({
        vocabularyName: z.string(),
      })),
    },
  },
};

// ============================================================================
// CLASSIFICATION API
// ============================================================================

export const classificationApi = {
  /**
   * Classify a single content item.
   */
  classify: {
    method: "POST" as const,
    path: "/api/taxonomy/classify",
    input: z.object({
      contentPath: z.string().min(1),
      contentName: z.string().min(1).optional(),
      attributes: z.record(z.string()).optional(),
      options: z.object({
        force: z.boolean().default(false),
        vocabularies: z.array(z.string()).optional(),
        dryRun: z.boolean().default(false),
        createSymlinks: z.boolean().default(true),
      }).optional(),
    }),
    responses: {
      200: classificationResultSchema.extend({
        symlinksCreated: z.array(z.object({
          path: z.string(),
          target: z.string(),
          category: z.string(),
        })),
      }),
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Get classification for content.
   */
  get: {
    method: "GET" as const,
    path: "/api/taxonomy/classifications/:contentId",
    responses: {
      200: classificationResultSchema,
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Batch classify content.
   */
  batch: {
    method: "POST" as const,
    path: "/api/taxonomy/classify/batch",
    input: z.object({
      contents: z.array(z.object({
        path: z.string().min(1),
        name: z.string().optional(),
        attributes: z.record(z.string()).optional(),
      })).min(1).max(1000),
      options: z.object({
        force: z.boolean().default(false),
        vocabularies: z.array(z.string()).optional(),
        dryRun: z.boolean().default(false),
        createSymlinks: z.boolean().default(true),
      }).optional(),
    }),
    responses: {
      200: batchClassificationResultSchema.extend({
        results: z.array(classificationResultSchema),
      }),
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Scan directory and classify.
   */
  scan: {
    method: "POST" as const,
    path: "/api/taxonomy/classify/scan",
    input: z.object({
      rootPath: z.string().min(1),
      maxDepth: z.number().min(1).max(10).default(3),
      options: z.object({
        force: z.boolean().default(false),
        dryRun: z.boolean().default(false),
        createSymlinks: z.boolean().default(true),
      }).optional(),
    }),
    responses: {
      200: batchClassificationResultSchema.extend({
        directoriesScanned: z.number(),
      }),
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Create re-classification plan.
   */
  planReclassification: {
    method: "POST" as const,
    path: "/api/taxonomy/reclassify/plan",
    input: z.object({
      newConfigContent: z.string().min(1),
    }),
    responses: {
      200: reclassificationPlanSchema,
      400: taxonomyErrorSchemas.validation,
    },
  },

  /**
   * Execute re-classification plan.
   */
  executeReclassification: {
    method: "POST" as const,
    path: "/api/taxonomy/reclassify/:planId/execute",
    responses: {
      200: batchClassificationResultSchema,
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Remove classification from content.
   */
  unclassify: {
    method: "DELETE" as const,
    path: "/api/taxonomy/classifications/:contentId",
    query: z.object({
      vocabularyId: z.string().optional(),
      removeSymlinks: z.coerce.boolean().default(true),
    }).optional(),
    responses: {
      204: z.void(),
      404: taxonomyErrorSchemas.notFound,
    },
  },
};

// ============================================================================
// CONTENT API (Content-to-Term relationships)
// ============================================================================

export const contentApi = {
  /**
   * Get terms for content.
   */
  getTerms: {
    method: "GET" as const,
    path: "/api/taxonomy/content/:contentId/terms",
    responses: {
      200: z.array(z.object({
        vocabularyId: z.string(),
        vocabularyName: z.string(),
        term: termSchema,
      })),
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Add content to term manually.
   */
  addToTerm: {
    method: "POST" as const,
    path: "/api/taxonomy/content/:contentId/terms",
    input: z.object({
      vocabularyId: z.string(),
      termId: z.string(),
      createSymlink: z.boolean().default(true),
    }),
    responses: {
      200: z.object({
        success: z.boolean(),
        symlinkCreated: z.boolean(),
        symlinkPath: z.string().nullable(),
      }),
      404: taxonomyErrorSchemas.notFound,
      409: taxonomyErrorSchemas.conflict, // If already assigned
    },
  },

  /**
   * Remove content from term.
   */
  removeFromTerm: {
    method: "DELETE" as const,
    path: "/api/taxonomy/content/:contentId/terms/:termId",
    query: z.object({
      removeSymlink: z.coerce.boolean().default(true),
    }).optional(),
    responses: {
      204: z.void(),
      404: taxonomyErrorSchemas.notFound,
    },
  },

  /**
   * Get content by term.
   */
  getByTerm: {
    method: "GET" as const,
    path: "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId/content",
    query: z.object({
      limit: z.coerce.number().min(1).max(1000).default(100),
      offset: z.coerce.number().min(0).default(0),
      sortBy: z.enum(["name", "classifiedAt", "confidence"]).default("classifiedAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }).optional(),
    responses: {
      200: z.object({
        content: z.array(contentReferenceSchema),
        total: z.number(),
      }),
      404: taxonomyErrorSchemas.notFound,
    },
  },
};

// ============================================================================
// STATS API
// ============================================================================

export const taxonomyStatsApi = {
  /**
   * Get overall taxonomy statistics.
   */
  overview: {
    method: "GET" as const,
    path: "/api/taxonomy/stats",
    responses: {
      200: z.object({
        vocabularyCount: z.number(),
        termCount: z.number(),
        classifiedContentCount: z.number(),
        symlinkCount: z.number(),
        lastClassificationAt: z.string().datetime().nullable(),
        configVersion: z.number().nullable(),
      }),
    },
  },

  /**
   * Get vocabulary statistics.
   */
  byVocabulary: {
    method: "GET" as const,
    path: "/api/taxonomy/stats/vocabularies",
    responses: {
      200: z.array(z.object({
        id: z.string(),
        name: z.string(),
        termCount: z.number(),
        contentCount: z.number(),
        avgTermsPerContent: z.number(),
        mostUsedTerms: z.array(z.object({
          termId: z.string(),
          termValue: z.string(),
          contentCount: z.number(),
        })).max(10),
      })),
    },
  },

  /**
   * Get classification conflict statistics.
   */
  conflicts: {
    method: "GET" as const,
    path: "/api/taxonomy/stats/conflicts",
    responses: {
      200: z.object({
        totalConflicts: z.number(),
        byType: z.record(z.number()),
        byVocabulary: z.record(z.number()),
        pendingReview: z.number(),
      }),
    },
  },
};

// ============================================================================
// COMBINED TAXONOMY API
// ============================================================================

export const taxonomyApi = {
  vocabularies: vocabularyApi,
  terms: termApi,
  classifications: classificationApi,
  content: contentApi,
  stats: taxonomyStatsApi,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Builds a URL for a taxonomy API endpoint.
 */
export function buildTaxonomyUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, encodeURIComponent(String(value)));
      }
    });
  }
  return url;
}
