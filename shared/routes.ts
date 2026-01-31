import { z } from 'zod';
import { insertConfigSchema, configs } from './schema';

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
          filetypes: z.array(z.string())
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
