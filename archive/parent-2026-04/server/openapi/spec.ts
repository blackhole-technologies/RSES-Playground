/**
 * @file spec.ts
 * @description OpenAPI 3.0 specification for RSES CMS API
 */

import type { OpenAPIV3 } from "openapi-types";

export const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "RSES CMS API",
    description: "Runtime Symlink Expression System - Content Management System API",
    version: "0.6.4",
    contact: {
      name: "RSES Team",
    },
  },
  servers: [
    {
      url: "http://localhost:5001",
      description: "Development server",
    },
  ],
  tags: [
    { name: "Configs", description: "RSES configuration management" },
    { name: "Engine", description: "RSES engine operations" },
    { name: "Projects", description: "Project management" },
    { name: "Auth", description: "Authentication" },
    { name: "Admin", description: "Admin operations" },
    { name: "Health", description: "Health and metrics" },
  ],
  paths: {
    // Health endpoints
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        responses: {
          "200": { description: "Service is ready" },
          "503": { description: "Service not ready" },
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["Health"],
        summary: "Prometheus metrics",
        responses: {
          "200": {
            description: "Prometheus metrics",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },

    // Configs CRUD
    "/api/configs": {
      get: {
        tags: ["Configs"],
        summary: "List all configurations",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": {
            description: "List of configurations",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Config" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Configs"],
        summary: "Create a new configuration",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConfigInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Configuration created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Config" },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/configs/{id}": {
      get: {
        tags: ["Configs"],
        summary: "Get a configuration by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Configuration found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Config" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      put: {
        tags: ["Configs"],
        summary: "Update a configuration",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ConfigInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Configuration updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Config" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Configs"],
        summary: "Delete a configuration",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "204": { description: "Configuration deleted" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // Engine operations
    "/api/engine/validate": {
      post: {
        tags: ["Engine"],
        summary: "Validate RSES configuration syntax",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: {
                  content: { type: "string", description: "RSES config content" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Validation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    valid: { type: "boolean" },
                    errors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          line: { type: "integer" },
                          message: { type: "string" },
                          code: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/engine/test": {
      post: {
        tags: ["Engine"],
        summary: "Test configuration against a filename",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["configContent", "filename"],
                properties: {
                  configContent: { type: "string" },
                  filename: { type: "string" },
                  attributes: {
                    type: "object",
                    additionalProperties: { type: "string" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Classification result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sets: { type: "array", items: { type: "string" } },
                    topics: { type: "array", items: { type: "string" } },
                    types: { type: "array", items: { type: "string" } },
                    filetypes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },

    // Auth endpoints
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with username and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: {
                  username: { type: "string" },
                  password: { type: "string", format: "password" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout current session",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Logout successful" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user info",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // Projects
    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List all projects",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": {
            description: "List of projects",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Project" },
                },
              },
            },
          },
        },
      },
    },
    "/api/projects/{id}": {
      get: {
        tags: ["Projects"],
        summary: "Get a project by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Project found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Project" },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/projects/scan": {
      post: {
        tags: ["Projects"],
        summary: "Scan a directory for projects",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["path"],
                properties: {
                  path: { type: "string", description: "Directory path to scan" },
                  maxDepth: { type: "integer", default: 3 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Scan results",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Project" },
                },
              },
            },
          },
        },
      },
    },

    // Admin Sites
    "/api/admin/sites": {
      get: {
        tags: ["Admin"],
        summary: "List all sites",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "List of sites",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Site" },
                },
              },
            },
          },
        },
      },
    },

    // Feature Flags
    "/api/admin/feature-flags": {
      get: {
        tags: ["Admin"],
        summary: "List all feature flags",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "List of feature flags",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FeatureFlag" },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "connect.sid",
        description: "Session cookie authentication",
      },
    },
    schemas: {
      Config: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          content: { type: "string" },
          description: { type: "string", nullable: true },
          enabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ConfigInput: {
        type: "object",
        required: ["name", "content"],
        properties: {
          name: { type: "string" },
          content: { type: "string" },
          description: { type: "string" },
          enabled: { type: "boolean", default: true },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          path: { type: "string" },
          type: { type: "string" },
          linked: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          username: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["admin", "editor", "viewer"] },
        },
      },
      Site: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          domain: { type: "string" },
          status: { type: "string", enum: ["active", "inactive", "maintenance"] },
        },
      },
      FeatureFlag: {
        type: "object",
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          globallyEnabled: { type: "boolean" },
          category: { type: "string", enum: ["core", "optional", "experimental"] },
        },
      },
      Error: {
        type: "object",
        properties: {
          message: { type: "string" },
          field: { type: "string" },
          code: { type: "string" },
        },
      },
    },
    responses: {
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      ValidationError: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Unauthorized: {
        description: "Authentication required",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
};
