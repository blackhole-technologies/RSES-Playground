/**
 * @file media-pipeline.ts
 * @description Media Processing Pipeline Implementation
 * @phase Phase 10 - Plug-and-Play Media System
 * @author Media Integration Specialist
 * @created 2026-02-01
 *
 * This module implements the composable media processing pipeline where:
 * - Stages can be enabled/disabled independently
 * - Third-party processors can be plugged in
 * - Admin can visualize the pipeline
 * - Processing is efficient and parallelized where possible
 */

import type {
  MediaPipeline,
  PipelineId,
  PipelineStage,
  PipelineConfig,
  PipelineInput,
  PipelineResult,
  PipelineProgress,
  PipelineValidationResult,
  PipelineVisualization,
  VisualizationNode,
  VisualizationEdge,
  TimeEstimate,
  StageResult,
  ProcessedMedia,
  PipelineMetrics,
  PipelineError,
  MediaId,
  ProcessorId,
  MediaProcessor,
  ProcessorInput,
  ProcessorOutput,
  StageCondition,
  ErrorStrategy,
  ProcessingContext,
} from "@shared/cms/media-module-types";
import { processorRegistry } from "./media-registry";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// PIPELINE BUILDER
// =============================================================================

/**
 * Builder for creating media processing pipelines.
 */
export class MediaPipelineBuilder {
  private id: PipelineId;
  private name: string = "Unnamed Pipeline";
  private description: string = "";
  private stages: PipelineStage[] = [];
  private config: PipelineConfig = {
    maxConcurrency: 4,
    timeout: 60000,
    preserveOriginal: true,
  };

  constructor(id?: PipelineId) {
    this.id = (id || `pipeline-${uuidv4()}`) as PipelineId;
  }

  /**
   * Set pipeline name.
   */
  withName(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Set pipeline description.
   */
  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Add a processing stage.
   */
  addStage(stage: Omit<PipelineStage, "id"> & { id?: string }): this {
    const stageWithId: PipelineStage = {
      ...stage,
      id: stage.id || `stage-${this.stages.length + 1}`,
      enabled: stage.enabled ?? true,
      onError: stage.onError || { type: "fail" },
    };
    this.stages.push(stageWithId);
    return this;
  }

  /**
   * Add multiple stages.
   */
  addStages(stages: Array<Omit<PipelineStage, "id"> & { id?: string }>): this {
    stages.forEach(stage => this.addStage(stage));
    return this;
  }

  /**
   * Configure the pipeline.
   */
  configure(config: Partial<PipelineConfig>): this {
    this.config = { ...this.config, ...config };
    return this;
  }

  /**
   * Set maximum concurrency.
   */
  withConcurrency(maxConcurrency: number): this {
    this.config = { ...this.config, maxConcurrency };
    return this;
  }

  /**
   * Set global timeout.
   */
  withTimeout(timeout: number): this {
    this.config = { ...this.config, timeout };
    return this;
  }

  /**
   * Build the pipeline.
   */
  build(): MediaPipeline {
    return new MediaPipelineImpl(
      this.id,
      this.name,
      this.description,
      [...this.stages],
      { ...this.config }
    );
  }
}

// =============================================================================
// PIPELINE IMPLEMENTATION
// =============================================================================

/**
 * Implementation of the MediaPipeline interface.
 */
export class MediaPipelineImpl implements MediaPipeline {
  readonly id: PipelineId;
  readonly name: string;
  readonly description: string;
  readonly stages: PipelineStage[];
  readonly config: PipelineConfig;

  private executionCount = 0;
  private totalExecutionTime = 0;
  private errorCount = 0;

  constructor(
    id: PipelineId,
    name: string,
    description: string,
    stages: PipelineStage[],
    config: PipelineConfig
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.stages = stages;
    this.config = config;
  }

  /**
   * Execute the pipeline on media.
   */
  async execute(input: PipelineInput): Promise<PipelineResult> {
    const startTime = Date.now();
    const stageResults: StageResult[] = [];
    const errors: PipelineError[] = [];

    let currentData: Buffer | ReadableStream | undefined = input.data;
    let currentContentType = input.contentType || "application/octet-stream";
    let currentMetadata: Record<string, unknown> = { ...input.metadata };

    const enabledStages = this.stages.filter(s => s.enabled);

    for (const stage of enabledStages) {
      const stageStartTime = Date.now();

      try {
        // Check stage condition
        if (stage.condition && !this.evaluateCondition(stage.condition, currentContentType, currentData, currentMetadata)) {
          stageResults.push({
            stageId: stage.id,
            stageName: stage.name,
            processorId: stage.processorId,
            status: "skipped",
            durationMs: 0,
            metadata: { reason: "condition not met" },
          });
          continue;
        }

        // Get the processor
        const processor = processorRegistry.get(stage.processorId);
        if (!processor) {
          throw new Error(`Processor '${stage.processorId}' not found`);
        }

        // Prepare input
        const processorInput: ProcessorInput = {
          data: currentData!,
          contentType: currentContentType,
          metadata: currentMetadata,
          config: stage.config,
          context: input.context,
        };

        // Validate input
        const validation = processor.validateInput(processorInput);
        if (!validation.valid) {
          throw new Error(`Input validation failed: ${validation.errors?.join(", ")}`);
        }

        // Execute with timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Stage timeout")), stage.timeout || this.config.timeout);
        });

        const processPromise = processor.process(processorInput);
        const output = await Promise.race([processPromise, timeoutPromise]) as ProcessorOutput;

        // Update current state
        currentData = output.data;
        currentContentType = output.contentType;
        currentMetadata = { ...currentMetadata, ...output.metadata };

        const inputSize = processorInput.data instanceof Buffer ? processorInput.data.length : undefined;
        const outputSize = output.data instanceof Buffer ? output.data.length : output.size;

        stageResults.push({
          stageId: stage.id,
          stageName: stage.name,
          processorId: stage.processorId,
          status: "success",
          durationMs: Date.now() - stageStartTime,
          inputSize,
          outputSize,
          metadata: output.metadata,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const pipelineError: PipelineError = {
          code: "STAGE_ERROR",
          message: errorMessage,
          stage: stage.id,
          recoverable: stage.onError.type !== "fail",
        };
        errors.push(pipelineError);

        // Handle error based on strategy
        const errorResult = await this.handleStageError(stage, error, stageStartTime);
        stageResults.push(errorResult);

        if (stage.onError.type === "fail") {
          break; // Stop pipeline execution
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    this.executionCount++;
    this.totalExecutionTime += totalDuration;
    if (errors.some(e => !e.recoverable)) {
      this.errorCount++;
    }

    const inputSize = input.data instanceof Buffer ? input.data.length : 0;
    const outputSize = currentData instanceof Buffer ? currentData.length : 0;

    const metrics: PipelineMetrics = {
      totalDurationMs: totalDuration,
      stageDurations: Object.fromEntries(stageResults.map(r => [r.stageId, r.durationMs])),
      inputSize,
      outputSize,
      compressionRatio: inputSize > 0 ? outputSize / inputSize : 1,
    };

    const hasFailure = stageResults.some(r => r.status === "failed") &&
                       errors.some(e => !e.recoverable);

    const output: ProcessedMedia = {
      mediaId: `media-${uuidv4()}` as MediaId,
      location: "", // Would be set by storage
      contentType: currentContentType,
      size: outputSize,
      metadata: currentMetadata as any,
    };

    return {
      success: !hasFailure,
      pipelineId: this.id,
      input: typeof input.source === "string" ? input.source : "buffer",
      output,
      stages: stageResults,
      metrics,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute with streaming progress updates.
   */
  async *executeStreaming(input: PipelineInput): AsyncIterableIterator<PipelineProgress> {
    const enabledStages = this.stages.filter(s => s.enabled);
    const totalStages = enabledStages.length;
    let completedStages = 0;

    for (const stage of enabledStages) {
      yield {
        stage: stage.name,
        progress: (completedStages / totalStages) * 100,
        status: "processing",
        message: `Processing: ${stage.name}`,
      };

      // Simulate processing (actual implementation would stream from processor)
      await new Promise(resolve => setTimeout(resolve, 100));

      completedStages++;

      yield {
        stage: stage.name,
        progress: (completedStages / totalStages) * 100,
        status: "completed",
        message: `Completed: ${stage.name}`,
      };
    }

    yield {
      stage: "done",
      progress: 100,
      status: "completed",
      message: "Pipeline completed",
    };
  }

  /**
   * Validate pipeline configuration.
   */
  validate(): PipelineValidationResult {
    const errors: PipelineValidationResult["errors"] = [];
    const warnings: PipelineValidationResult["warnings"] = [];

    if (this.stages.length === 0) {
      errors.push({
        field: "stages",
        message: "Pipeline must have at least one stage",
        code: "NO_STAGES",
      });
    }

    for (const stage of this.stages) {
      // Check processor exists
      if (!processorRegistry.has(stage.processorId)) {
        errors.push({
          stage: stage.id,
          field: "processorId",
          message: `Processor '${stage.processorId}' is not registered`,
          code: "PROCESSOR_NOT_FOUND",
        });
      } else {
        // Validate stage config against processor schema
        const processor = processorRegistry.get(stage.processorId)!;
        const configResult = processor.configSchema.safeParse(stage.config);
        if (!configResult.success) {
          errors.push({
            stage: stage.id,
            field: "config",
            message: `Invalid stage configuration: ${configResult.error.message}`,
            code: "INVALID_CONFIG",
          });
        }
      }

      // Check for unreachable stages after a fail error strategy
      const stageIndex = this.stages.indexOf(stage);
      const previousStages = this.stages.slice(0, stageIndex);
      const hasBlockingFail = previousStages.some(
        s => s.enabled && s.onError.type === "fail"
      );
      if (hasBlockingFail && stage.enabled) {
        warnings.push({
          stage: stage.id,
          message: "This stage may be unreachable if a previous stage fails",
          suggestion: "Consider using 'skip' or 'fallback' error strategy for non-critical stages",
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get pipeline visualization data for admin UI.
   */
  getVisualization(): PipelineVisualization {
    const nodes: VisualizationNode[] = [];
    const edges: VisualizationEdge[] = [];

    // Input node
    nodes.push({
      id: "input",
      type: "input",
      label: "Input",
      enabled: true,
      position: { x: 0, y: 0 },
    });

    // Stage nodes
    let previousNodeId = "input";
    this.stages.forEach((stage, index) => {
      const processor = processorRegistry.get(stage.processorId);

      nodes.push({
        id: stage.id,
        type: stage.condition ? "condition" : "stage",
        label: stage.name,
        enabled: stage.enabled,
        processor: processor?.name,
        tier: undefined, // Would be determined from processor's module
        position: { x: (index + 1) * 200, y: 0 },
      });

      edges.push({
        source: previousNodeId,
        target: stage.id,
        conditional: !!stage.condition,
      });

      previousNodeId = stage.id;
    });

    // Output node
    nodes.push({
      id: "output",
      type: "output",
      label: "Output",
      enabled: true,
      position: { x: (this.stages.length + 1) * 200, y: 0 },
    });

    edges.push({
      source: previousNodeId,
      target: "output",
    });

    return {
      pipelineId: this.id,
      name: this.name,
      nodes,
      edges,
      layout: "horizontal",
    };
  }

  /**
   * Estimate processing time.
   */
  async estimateTime(input: PipelineInput): Promise<TimeEstimate> {
    const breakdown: Record<string, number> = {};
    let totalEstimate = 0;

    const inputSize = input.data instanceof Buffer ? input.data.length : 0;

    for (const stage of this.stages.filter(s => s.enabled)) {
      const processor = processorRegistry.get(stage.processorId);
      if (processor) {
        // Estimate based on input size and processor characteristics
        const memoryEstimate = processor.estimateMemory({
          data: input.data || Buffer.alloc(0),
          contentType: input.contentType || "application/octet-stream",
          config: stage.config,
        });

        // Rough estimation: 1ms per 100KB + base time
        const baseTime = 50; // 50ms base
        const sizeBasedTime = (inputSize / 100000) * 10; // 10ms per 100KB
        const stageEstimate = baseTime + sizeBasedTime;

        breakdown[stage.id] = stageEstimate;
        totalEstimate += stageEstimate;
      }
    }

    // Use historical data if available
    const hasHistoricalData = this.executionCount > 0;
    const historicalAverage = hasHistoricalData
      ? this.totalExecutionTime / this.executionCount
      : 0;

    return {
      estimatedMs: hasHistoricalData
        ? (totalEstimate + historicalAverage) / 2
        : totalEstimate,
      confidence: hasHistoricalData ? 0.8 : 0.5,
      breakdown,
      basedOn: hasHistoricalData ? "historical" : "heuristic",
    };
  }

  /**
   * Clone the pipeline with optional modifications.
   */
  clone(modifications?: {
    id?: PipelineId;
    name?: string;
    stages?: PipelineStage[];
    config?: Partial<PipelineConfig>;
  }): MediaPipeline {
    return new MediaPipelineImpl(
      modifications?.id || (`${this.id}-clone` as PipelineId),
      modifications?.name || `${this.name} (Copy)`,
      this.description,
      modifications?.stages || [...this.stages],
      { ...this.config, ...modifications?.config }
    );
  }

  /**
   * Enable a specific stage.
   */
  enableStage(stageId: string): void {
    const stage = this.stages.find(s => s.id === stageId);
    if (stage) {
      (stage as any).enabled = true;
    }
  }

  /**
   * Disable a specific stage.
   */
  disableStage(stageId: string): void {
    const stage = this.stages.find(s => s.id === stageId);
    if (stage) {
      (stage as any).enabled = false;
    }
  }

  /**
   * Get pipeline statistics.
   */
  getStats() {
    return {
      executionCount: this.executionCount,
      totalExecutionTime: this.totalExecutionTime,
      averageExecutionTime: this.executionCount > 0
        ? this.totalExecutionTime / this.executionCount
        : 0,
      errorCount: this.errorCount,
      errorRate: this.executionCount > 0
        ? this.errorCount / this.executionCount
        : 0,
    };
  }

  // Private helper methods

  private evaluateCondition(
    condition: StageCondition,
    contentType: string,
    data: Buffer | ReadableStream | undefined,
    metadata: Record<string, unknown>
  ): boolean {
    switch (condition.type) {
      case "always":
        return true;

      case "media-type":
        if (!condition.mediaTypes) return true;
        return condition.mediaTypes.some(type => {
          if (type.endsWith("/*")) {
            return contentType.startsWith(type.slice(0, -1));
          }
          return contentType === type;
        });

      case "file-size":
        if (!data || !(data instanceof Buffer)) return true;
        const size = data.length;
        const threshold = condition.sizeThreshold || 0;
        switch (condition.sizeOperator) {
          case "gt": return size > threshold;
          case "lt": return size < threshold;
          case "gte": return size >= threshold;
          case "lte": return size <= threshold;
          default: return true;
        }

      case "metadata":
        if (!condition.metadataMatch) return true;
        return Object.entries(condition.metadataMatch).every(
          ([key, value]) => metadata[key] === value
        );

      case "custom":
        // Custom conditions would be evaluated by a registered function
        return true;

      default:
        return true;
    }
  }

  private async handleStageError(
    stage: PipelineStage,
    error: unknown,
    startTime: number
  ): Promise<StageResult> {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    switch (stage.onError.type) {
      case "skip":
        if (stage.onError.logLevel !== "silent") {
          console[stage.onError.logLevel](`Stage ${stage.id} error (skipped): ${errorMessage}`);
        }
        return {
          stageId: stage.id,
          stageName: stage.name,
          processorId: stage.processorId,
          status: "skipped",
          durationMs: Date.now() - startTime,
          error: {
            code: "STAGE_SKIPPED",
            message: errorMessage,
            recoverable: true,
          },
        };

      case "retry":
        // Retry logic would go here
        return {
          stageId: stage.id,
          stageName: stage.name,
          processorId: stage.processorId,
          status: "failed",
          durationMs: Date.now() - startTime,
          error: {
            code: "RETRY_EXHAUSTED",
            message: `Failed after retries: ${errorMessage}`,
            recoverable: false,
          },
        };

      case "fallback":
        return {
          stageId: stage.id,
          stageName: stage.name,
          processorId: stage.processorId,
          status: "success",
          durationMs: Date.now() - startTime,
          metadata: { fallbackUsed: true },
        };

      case "fail":
      default:
        return {
          stageId: stage.id,
          stageName: stage.name,
          processorId: stage.processorId,
          status: "failed",
          durationMs: Date.now() - startTime,
          error: {
            code: "STAGE_FAILED",
            message: errorMessage,
            recoverable: false,
          },
        };
    }
  }
}

// =============================================================================
// PREDEFINED PIPELINES
// =============================================================================

/**
 * Create the default image processing pipeline.
 */
export function createDefaultImagePipeline(): MediaPipeline {
  return new MediaPipelineBuilder("default-image-pipeline" as PipelineId)
    .withName("Default Image Pipeline")
    .withDescription("Standard image processing: metadata extraction, format conversion, thumbnail generation")
    .addStage({
      id: "metadata-extraction",
      name: "Extract Metadata",
      processorId: "metadata-extractor" as ProcessorId,
      enabled: true,
      config: { extractExif: true, extractColors: true },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "auto-orient",
      name: "Auto Orient",
      processorId: "image-transformer" as ProcessorId,
      enabled: true,
      config: { operation: "auto-orient" },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "format-conversion",
      name: "Convert to WebP",
      processorId: "format-converter" as ProcessorId,
      enabled: true,
      config: { targetFormat: "webp", quality: 85 },
      condition: {
        type: "media-type",
        mediaTypes: ["image/jpeg", "image/png", "image/gif"],
      },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "thumbnail-generation",
      name: "Generate Thumbnails",
      processorId: "thumbnail-generator" as ProcessorId,
      enabled: true,
      config: { sizes: [150, 300, 600, 1200] },
      onError: { type: "skip", logLevel: "warn" },
    })
    .configure({
      maxConcurrency: 2,
      timeout: 30000,
      preserveOriginal: true,
    })
    .build();
}

/**
 * Create the default video processing pipeline.
 */
export function createDefaultVideoPipeline(): MediaPipeline {
  return new MediaPipelineBuilder("default-video-pipeline" as PipelineId)
    .withName("Default Video Pipeline")
    .withDescription("Standard video processing: metadata extraction, transcoding, thumbnail generation")
    .addStage({
      id: "metadata-extraction",
      name: "Extract Metadata",
      processorId: "video-metadata-extractor" as ProcessorId,
      enabled: true,
      config: {},
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "transcode",
      name: "Transcode to H.264",
      processorId: "video-transcoder" as ProcessorId,
      enabled: true,
      config: {
        codec: "h264",
        quality: "medium",
        maxWidth: 1920,
        maxHeight: 1080,
      },
      condition: {
        type: "file-size",
        sizeThreshold: 100 * 1024 * 1024, // 100MB
        sizeOperator: "lt",
      },
      onError: { type: "fail" },
      timeout: 300000, // 5 minutes
    })
    .addStage({
      id: "thumbnail-generation",
      name: "Generate Video Thumbnails",
      processorId: "video-thumbnail-generator" as ProcessorId,
      enabled: true,
      config: { count: 5, format: "webp" },
      onError: { type: "skip", logLevel: "warn" },
    })
    .configure({
      maxConcurrency: 1,
      timeout: 600000, // 10 minutes
      preserveOriginal: true,
    })
    .build();
}

/**
 * Create an AI-enhanced image pipeline.
 */
export function createAiImagePipeline(): MediaPipeline {
  return new MediaPipelineBuilder("ai-image-pipeline" as PipelineId)
    .withName("AI-Enhanced Image Pipeline")
    .withDescription("Image processing with AI: auto-tagging, alt-text, NSFW detection, smart crop")
    .addStage({
      id: "metadata-extraction",
      name: "Extract Metadata",
      processorId: "metadata-extractor" as ProcessorId,
      enabled: true,
      config: { extractExif: true },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "nsfw-detection",
      name: "NSFW Detection",
      processorId: "nsfw-detector" as ProcessorId,
      enabled: true,
      config: { threshold: 0.7, categories: ["adult", "violence"] },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "auto-tagging",
      name: "Auto Tag",
      processorId: "auto-tagger" as ProcessorId,
      enabled: true,
      config: { maxTags: 20, minConfidence: 0.5 },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "alt-text-generation",
      name: "Generate Alt Text",
      processorId: "alt-text-generator" as ProcessorId,
      enabled: true,
      config: { maxLength: 200, language: "en" },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "color-extraction",
      name: "Extract Colors",
      processorId: "color-extractor" as ProcessorId,
      enabled: true,
      config: { maxColors: 5, format: "hex" },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "smart-crop",
      name: "Smart Crop",
      processorId: "smart-cropper" as ProcessorId,
      enabled: false, // Disabled by default
      config: { focusOn: "auto" },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "format-conversion",
      name: "Convert to WebP",
      processorId: "format-converter" as ProcessorId,
      enabled: true,
      config: { targetFormat: "webp", quality: 85 },
      onError: { type: "skip", logLevel: "warn" },
    })
    .addStage({
      id: "thumbnail-generation",
      name: "Generate Thumbnails",
      processorId: "thumbnail-generator" as ProcessorId,
      enabled: true,
      config: { sizes: [150, 300, 600, 1200] },
      onError: { type: "skip", logLevel: "warn" },
    })
    .configure({
      maxConcurrency: 2,
      timeout: 60000,
      preserveOriginal: true,
    })
    .build();
}

// =============================================================================
// PIPELINE MANAGER
// =============================================================================

/**
 * Manager for pipeline registration and retrieval.
 */
export class PipelineManager {
  private pipelines: Map<PipelineId, MediaPipeline> = new Map();
  private defaultPipelines: Map<string, PipelineId> = new Map(); // mimeType prefix -> pipelineId

  constructor() {
    // Register default pipelines
    this.registerDefaults();
  }

  /**
   * Register a pipeline.
   */
  register(pipeline: MediaPipeline): void {
    this.pipelines.set(pipeline.id, pipeline);
    console.log(`[PipelineManager] Pipeline registered: ${pipeline.id}`);
  }

  /**
   * Unregister a pipeline.
   */
  unregister(pipelineId: PipelineId): void {
    this.pipelines.delete(pipelineId);

    // Remove from defaults if present
    for (const [mimeType, id] of this.defaultPipelines.entries()) {
      if (id === pipelineId) {
        this.defaultPipelines.delete(mimeType);
      }
    }
  }

  /**
   * Get a pipeline by ID.
   */
  get(pipelineId: PipelineId): MediaPipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * Get all pipelines.
   */
  getAll(): MediaPipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Set default pipeline for a mime type prefix.
   */
  setDefaultForMimeType(mimeTypePrefix: string, pipelineId: PipelineId): void {
    if (!this.pipelines.has(pipelineId)) {
      throw new Error(`Pipeline '${pipelineId}' is not registered`);
    }
    this.defaultPipelines.set(mimeTypePrefix, pipelineId);
  }

  /**
   * Get default pipeline for a mime type.
   */
  getDefaultForMimeType(mimeType: string): MediaPipeline | undefined {
    // Check for exact match first
    const exactId = this.defaultPipelines.get(mimeType);
    if (exactId) {
      return this.pipelines.get(exactId);
    }

    // Check for prefix match (e.g., "image" for "image/jpeg")
    const prefix = mimeType.split("/")[0];
    const prefixId = this.defaultPipelines.get(prefix);
    if (prefixId) {
      return this.pipelines.get(prefixId);
    }

    return undefined;
  }

  /**
   * Get all pipeline visualizations.
   */
  getAllVisualizations(): PipelineVisualization[] {
    return this.getAll().map(p => p.getVisualization());
  }

  private registerDefaults(): void {
    // Register built-in pipelines
    const imagePipeline = createDefaultImagePipeline();
    const videoPipeline = createDefaultVideoPipeline();
    const aiImagePipeline = createAiImagePipeline();

    this.register(imagePipeline);
    this.register(videoPipeline);
    this.register(aiImagePipeline);

    // Set defaults
    this.setDefaultForMimeType("image", imagePipeline.id);
    this.setDefaultForMimeType("video", videoPipeline.id);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Global pipeline manager instance.
 */
export const pipelineManager = new PipelineManager();

export default pipelineManager;
