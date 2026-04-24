/**
 * @file index.ts
 * @description RSES Engine Module for the Kernel.
 *
 * This is an OPTIONAL tier module that provides RSES configuration
 * parsing, validation, and testing services.
 *
 * @module modules/engine
 * @tier optional
 * @phase Phase 2 - Module Migration
 * @created 2026-02-01
 *
 * @architecture
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                      ENGINE MODULE                                   │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                      │
 * │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
 * │  │  RsesService     │  │  Validator       │  │  Preview        │   │
 * │  │  - parse         │  │  - validate      │  │  - generate     │   │
 * │  │  - test          │  │  - checkSyntax   │  │  - symlinks     │   │
 * │  │  - preview       │  └──────────────────┘  └─────────────────┘   │
 * │  └──────────────────┘                                               │
 * │                                                                      │
 * │  Events Emitted:                                                     │
 * │  - engine:validated    - Config validated                           │
 * │  - engine:tested       - Config tested against filename             │
 * │  - engine:previewed    - Preview generated                          │
 * │  - engine:error        - Engine error occurred                      │
 * │                                                                      │
 * │  Services Registered:                                                │
 * │  - RsesService         - Main RSES engine service                   │
 * │                                                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type {
  IModule,
  ModuleManifest,
  ModuleContext,
  ModuleHealth,
  IEventBus,
} from "../../kernel/types";
import { RsesParser, type ParseResult, type TestResult } from "../../lib/rses";
import { createExtendedResult } from "../../lib/suggestion-engine";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const validateSchema = z.object({
  content: z.string(),
});

const testSchema = z.object({
  configContent: z.string(),
  filename: z.string(),
  attributes: z.record(z.string()).optional().default({}),
});

const previewSchema = z.object({
  configContent: z.string(),
  testPath: z.string(),
  manualAttributes: z.record(z.string()).optional().default({}),
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Derive attributes from a file path.
 */
function deriveAttributesFromPath(testPath: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const parts = testPath.split("/").filter(Boolean);

  // Common path patterns
  if (parts.includes("src")) {
    attributes.source = "true";
  }
  if (parts.includes("test") || parts.includes("tests") || parts.includes("__tests__")) {
    attributes.test = "true";
  }
  if (parts.includes("docs") || parts.includes("documentation")) {
    attributes.docs = "true";
  }
  if (parts.includes("config") || parts.includes("configs")) {
    attributes.config = "true";
  }

  // File extension based attributes
  const filename = parts[parts.length - 1] || "";
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext) {
    attributes.extension = ext;

    const langMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rb: "ruby",
      go: "go",
      rs: "rust",
      java: "java",
      kt: "kotlin",
      swift: "swift",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
    };

    if (langMap[ext]) {
      attributes.language = langMap[ext];
    }
  }

  return attributes;
}

// =============================================================================
// RSES SERVICE
// =============================================================================

/**
 * RSES Engine service providing parsing, validation, and testing.
 */
export class RsesService {
  private events: IEventBus;
  private parseCount = 0;
  private testCount = 0;
  private errorCount = 0;

  constructor(events: IEventBus) {
    this.events = events;
  }

  /**
   * Parse and validate RSES configuration content.
   */
  async parse(content: string): Promise<ParseResult> {
    try {
      const result = RsesParser.parse(content);
      this.parseCount++;

      await this.events.emit("engine:validated", {
        valid: result.valid,
        errorCount: result.errors?.length || 0,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.errorCount++;
      await this.events.emit("engine:error", {
        operation: "parse",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Test a filename against a parsed configuration.
   */
  async test(
    configContent: string,
    filename: string,
    attributes: Record<string, string> = {}
  ): Promise<TestResult | { error: string }> {
    try {
      const parseResult = RsesParser.parse(configContent);

      if (!parseResult.valid || !parseResult.parsed) {
        return { error: "Config is invalid, cannot test" };
      }

      const basicResult = RsesParser.test(parseResult.parsed, filename, attributes);
      const result = createExtendedResult(filename, parseResult.parsed, basicResult);

      this.testCount++;

      await this.events.emit("engine:tested", {
        filename,
        matched: result.topics.length > 0 || result.types.length > 0,
        topicCount: result.topics.length,
        typeCount: result.types.length,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.errorCount++;
      await this.events.emit("engine:error", {
        operation: "test",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Generate a preview of symlinks for a path.
   */
  async preview(
    configContent: string,
    testPath: string,
    manualAttributes: Record<string, string> = {}
  ) {
    try {
      const parseResult = RsesParser.parse(configContent);

      if (!parseResult.valid || !parseResult.parsed) {
        return {
          error: "Config is invalid",
          errors: parseResult.errors,
        };
      }

      const derived = deriveAttributesFromPath(testPath);
      const combined = { ...derived, ...manualAttributes };
      const projectName = testPath.split("/").filter(Boolean).pop() || testPath;

      const testResult = RsesParser.test(parseResult.parsed, projectName, combined);

      const symlinks: Array<{
        type: "topic" | "type";
        name: string;
        target: string;
        category: string;
      }> = [];

      for (const topic of testResult.topics) {
        symlinks.push({
          type: "topic",
          name: projectName,
          target: testPath,
          category: `by-topic/${topic}`,
        });
      }

      for (const type of testResult.types) {
        symlinks.push({
          type: "type",
          name: projectName,
          target: testPath,
          category: `by-type/${type}`,
        });
      }

      await this.events.emit("engine:previewed", {
        path: testPath,
        symlinkCount: symlinks.length,
        timestamp: new Date(),
      });

      return {
        derivedAttributes: derived,
        combinedAttributes: combined,
        matchedSets: testResult.sets,
        symlinks,
        parsed: parseResult.parsed,
      };
    } catch (error) {
      this.errorCount++;
      await this.events.emit("engine:error", {
        operation: "preview",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Get engine statistics.
   */
  getStats() {
    return {
      parseCount: this.parseCount,
      testCount: this.testCount,
      errorCount: this.errorCount,
    };
  }
}

// =============================================================================
// ENGINE MODULE
// =============================================================================

/**
 * RSES Engine Module - Optional tier module for configuration processing.
 */
export class EngineModule implements IModule {
  public readonly manifest: ModuleManifest = {
    id: "engine",
    name: "RSES Engine",
    version: "1.0.0",
    description:
      "RSES configuration parsing, validation, testing, and preview generation",
    tier: "optional",
    author: {
      name: "RSES Team",
      email: "team@rses.dev",
    },
    license: "MIT",
    dependencies: [], // No dependencies
    permissions: [
      {
        capability: "content:read",
        level: "normal",
        reason: "Read RSES configurations for parsing",
      },
    ],
    configSchema: z.object({
      enableMetrics: z.boolean().optional(),
      cacheResults: z.boolean().optional(),
    }),
    exports: ["RsesService"],
    events: {
      emits: ["engine:validated", "engine:tested", "engine:previewed", "engine:error"],
      listens: [],
    },
    tags: ["rses", "parser", "validation", "engine"],
  };

  private context: ModuleContext | null = null;
  private rsesService: RsesService | null = null;

  /**
   * Initialize the engine module.
   */
  async initialize(context: ModuleContext): Promise<void> {
    this.context = context;
    const { logger, container, events, router } = context;

    logger.info("Initializing engine module");

    // Create services
    this.rsesService = new RsesService(events);

    // Register services in DI container
    container.registerSingleton("RsesService", this.rsesService, "engine");

    // Set up routes
    this.setupRoutes(router, logger);

    logger.info("Engine module initialized");
  }

  /**
   * Set up engine routes.
   */
  private setupRoutes(router: Router, logger: any): void {
    // POST /validate - Validate RSES configuration
    router.post("/validate", async (req: Request, res: Response) => {
      try {
        const { content } = validateSchema.parse(req.body);
        const result = await this.rsesService!.parse(content);
        res.json(result);
      } catch (err) {
        logger.error({ err }, "Parser error");
        res.status(500).json({ message: "Internal parser error" });
      }
    });

    // POST /test - Test a filename against configuration
    router.post("/test", async (req: Request, res: Response) => {
      try {
        const { configContent, filename, attributes } = testSchema.parse(req.body);
        const result = await this.rsesService!.test(configContent, filename, attributes);

        if ("error" in result) {
          return res.status(400).json({ message: result.error });
        }

        res.json(result);
      } catch (err) {
        logger.error({ err }, "Engine test error");
        res.status(500).json({ message: "Internal engine error" });
      }
    });

    // POST /preview - Generate symlink preview
    router.post("/preview", async (req: Request, res: Response) => {
      try {
        const { configContent, testPath, manualAttributes } = previewSchema.parse(
          req.body
        );
        const result = await this.rsesService!.preview(
          configContent,
          testPath,
          manualAttributes
        );

        if ("error" in result) {
          return res.status(400).json(result);
        }

        res.json(result);
      } catch (err) {
        logger.error({ err }, "Preview error");
        res.status(500).json({ message: "Internal preview error" });
      }
    });

    // GET /stats - Get engine statistics
    router.get("/stats", (req: Request, res: Response) => {
      const stats = this.rsesService!.getStats();
      res.json(stats);
    });

    // GET /health - Module health endpoint
    router.get("/health", (req: Request, res: Response) => {
      res.json({
        module: "engine",
        status: "operational",
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Start the module.
   */
  async start(): Promise<void> {
    this.context?.logger.info("Engine module started");
  }

  /**
   * Stop the module.
   */
  async stop(): Promise<void> {
    this.context?.logger.info("Engine module stopped");
  }

  /**
   * Clean up resources.
   */
  async dispose(): Promise<void> {
    this.rsesService = null;
    this.context = null;
  }

  /**
   * Health check for the engine module.
   */
  async healthCheck(): Promise<ModuleHealth> {
    try {
      if (!this.rsesService) {
        return {
          status: "unhealthy",
          message: "RsesService not initialized",
        };
      }

      // Quick validation test
      const testResult = await this.rsesService.parse("# Test\nrule test {}");

      return {
        status: "healthy",
        message: "Engine module operational",
        metrics: this.rsesService.getStats(),
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      };
    }
  }
}

// Default export for module auto-loading
export default EngineModule;
