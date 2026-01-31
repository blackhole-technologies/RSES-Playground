import { z } from 'zod';
import {
  insertConfigSchema,
  insertProjectSchema,
  configs,
  projects,
  configVersions,
  activityLog,
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  configs: {
    list: {
      method: 'GET' as const,
      path: '/api/configs',
      responses: {
        200: z.array(z.custom<typeof configs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/configs',
      input: insertConfigSchema,
      responses: {
        201: z.custom<typeof configs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/configs/:id',
      responses: {
        200: z.custom<typeof configs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/configs/:id',
      input: insertConfigSchema.partial(),
      responses: {
        200: z.custom<typeof configs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/configs/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  engine: {
    validate: {
      method: 'POST' as const,
      path: '/api/engine/validate',
      input: z.object({ content: z.string() }),
      responses: {
        200: z.object({
          valid: z.boolean(),
          errors: z.array(z.object({
            line: z.number(),
            message: z.string(),
            code: z.string()
          })),
          parsed: z.any().optional()
        })
      }
    },
    test: {
      method: 'POST' as const,
      path: '/api/engine/test',
      input: z.object({
        configContent: z.string(),
        filename: z.string(),
        attributes: z.record(z.string()).optional()
      }),
      responses: {
        200: z.object({
          sets: z.array(z.string()),
          topics: z.array(z.string()),
          types: z.array(z.string()),
          filetypes: z.array(z.string()),
          // Extended fields from suggestion engine
          _unmatched: z.boolean(),
          suggestions: z.array(z.object({
            value: z.string(),
            confidence: z.number(),
            reason: z.string(),
            type: z.enum(['set', 'topic', 'type', 'filetype'])
          })),
          prefix: z.string(),
          suffix: z.string()
        })
      }
    },
    preview: {
      method: 'POST' as const,
      path: '/api/engine/preview',
      input: z.object({
        configContent: z.string(),
        testPath: z.string(),
        manualAttributes: z.record(z.string()).optional()
      }),
      responses: {
        200: z.object({
          derivedAttributes: z.record(z.string()),
          combinedAttributes: z.record(z.string()),
          matchedSets: z.array(z.string()),
          symlinks: z.array(z.object({
            type: z.enum(['topic', 'type']),
            name: z.string(),
            target: z.string(),
            category: z.string()
          })),
          parsed: z.any().optional()
        }),
        400: errorSchemas.validation
      }
    }
  }
};

// === Projects API (Phase 6 - CMS Features) ===

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

export const projectsApi = {
  list: {
    method: 'GET' as const,
    path: '/api/projects',
    responses: {
      200: paginatedResponseSchema(z.custom<typeof projects.$inferSelect>()),
    },
  },
  get: {
    method: 'GET' as const,
    path: '/api/projects/:id',
    responses: {
      200: z.custom<typeof projects.$inferSelect>(),
      404: errorSchemas.notFound,
    },
  },
  scan: {
    method: 'POST' as const,
    path: '/api/projects/scan',
    input: z.object({
      rootPath: z.string(),
      configId: z.number().optional(),
      maxDepth: z.number().min(1).max(10).optional(),
    }),
    responses: {
      200: z.object({
        projects: z.array(z.custom<typeof projects.$inferSelect>()),
        directoriesScanned: z.number(),
        duration: z.number(),
        errors: z.array(z.object({ path: z.string(), error: z.string() })),
      }),
    },
  },
  update: {
    method: 'PATCH' as const,
    path: '/api/projects/:id',
    input: insertProjectSchema.partial(),
    responses: {
      200: z.custom<typeof projects.$inferSelect>(),
      404: errorSchemas.notFound,
    },
  },
  link: {
    method: 'POST' as const,
    path: '/api/projects/:id/link',
    input: z.object({
      linkPath: z.string().optional(),
    }),
    responses: {
      200: z.custom<typeof projects.$inferSelect>(),
      404: errorSchemas.notFound,
    },
  },
  unlink: {
    method: 'DELETE' as const,
    path: '/api/projects/:id/link',
    responses: {
      200: z.custom<typeof projects.$inferSelect>(),
      404: errorSchemas.notFound,
    },
  },
  bulkLink: {
    method: 'POST' as const,
    path: '/api/projects/bulk-link',
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
    }),
    responses: {
      200: z.object({ updated: z.number() }),
    },
  },
  bulkUnlink: {
    method: 'POST' as const,
    path: '/api/projects/bulk-unlink',
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
    }),
    responses: {
      200: z.object({ updated: z.number() }),
    },
  },
};

// === Config Versions API (Phase 6 - CMS Features) ===

export const versionsApi = {
  list: {
    method: 'GET' as const,
    path: '/api/configs/:id/versions',
    responses: {
      200: z.array(z.custom<typeof configVersions.$inferSelect>()),
      404: errorSchemas.notFound,
    },
  },
  get: {
    method: 'GET' as const,
    path: '/api/configs/:id/versions/:version',
    responses: {
      200: z.custom<typeof configVersions.$inferSelect>(),
      404: errorSchemas.notFound,
    },
  },
  restore: {
    method: 'POST' as const,
    path: '/api/configs/:id/versions/:version/restore',
    responses: {
      200: z.custom<typeof configs.$inferSelect>(),
      404: errorSchemas.notFound,
    },
  },
};

// === Activity Log API (Phase 6 - CMS Features) ===

export const activityApi = {
  list: {
    method: 'GET' as const,
    path: '/api/activity',
    responses: {
      200: paginatedResponseSchema(z.custom<typeof activityLog.$inferSelect>()),
    },
  },
  recent: {
    method: 'GET' as const,
    path: '/api/activity/recent',
    responses: {
      200: z.array(z.custom<typeof activityLog.$inferSelect>()),
    },
  },
};

// === Workbench API (Phase 8 - Backend to Frontend Connection) ===

export const workbenchApi = {
  autolink: {
    method: 'POST' as const,
    path: '/api/workbench/autolink',
    input: z.object({
      projectPath: z.string().min(1, "Project path is required"),
      configContent: z.string().min(1, "Config content is required"),
      baseDir: z.string().optional(),
      dryRun: z.boolean().optional(),
    }),
    responses: {
      200: z.object({
        success: z.boolean(),
        projectName: z.string(),
        classification: z.object({
          sets: z.array(z.string()),
          topics: z.array(z.string()),
          types: z.array(z.string()),
          filetypes: z.array(z.string()),
        }),
        symlinks: z.array(z.object({
          category: z.string(),
          target: z.string(),
          created: z.boolean(),
          error: z.string().optional(),
        })),
        errors: z.array(z.string()).optional(),
      }),
      400: errorSchemas.validation,
    },
  },
  scan: {
    method: 'POST' as const,
    path: '/api/workbench/scan',
    input: z.object({
      rootPath: z.string().min(1, "Root path is required"),
      configContent: z.string().min(1, "Config content is required"),
      maxDepth: z.number().min(1).max(10).optional(),
    }),
    responses: {
      200: z.object({
        projects: z.array(z.object({
          path: z.string(),
          name: z.string(),
          classification: z.object({
            sets: z.array(z.string()),
            topics: z.array(z.string()),
            types: z.array(z.string()),
          }),
        })),
        directoriesScanned: z.number(),
        duration: z.number(),
      }),
      400: errorSchemas.validation,
    },
  },
  bulkAutolink: {
    method: 'POST' as const,
    path: '/api/workbench/bulk-autolink',
    input: z.object({
      projectPaths: z.array(z.string()).min(1).max(100),
      configContent: z.string().min(1, "Config content is required"),
      baseDir: z.string().optional(),
      dryRun: z.boolean().optional(),
    }),
    responses: {
      200: z.object({
        success: z.boolean(),
        results: z.array(z.object({
          projectPath: z.string(),
          projectName: z.string(),
          symlinksCreated: z.number(),
          errors: z.array(z.string()).optional(),
        })),
        summary: z.object({
          total: z.number(),
          succeeded: z.number(),
          failed: z.number(),
          symlinksCreated: z.number(),
        }),
      }),
      400: errorSchemas.validation,
    },
  },
};

// === Batch Operations API (Phase 6 - CMS Features) ===

export const batchApi = {
  deleteConfigs: {
    method: 'POST' as const,
    path: '/api/configs/bulk-delete',
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
    }),
    responses: {
      200: z.object({ deleted: z.number() }),
    },
  },
  updateConfigs: {
    method: 'POST' as const,
    path: '/api/configs/bulk-update',
    input: z.object({
      ids: z.array(z.number()).min(1).max(100),
      updates: insertConfigSchema.partial(),
    }),
    responses: {
      200: z.object({ updated: z.number() }),
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
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
