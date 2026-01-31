/**
 * @file media-module-types.ts
 * @description Modular Media Architecture for RSES CMS
 * @phase Phase 10 - Plug-and-Play Media System
 * @author Media Integration Specialist
 * @created 2026-02-01
 *
 * This module defines a complete plug-and-play media architecture where:
 * - System works with just basic media module (core)
 * - Each processing capability is independently toggleable
 * - Third-party media processors can be plugged in
 * - Admin can see media pipeline visualization
 *
 * Module Tiers:
 * 1. Basic Media (core) - Required, always enabled
 * 2. Advanced Processing - Image manipulation, video transcoding
 * 3. AI Media - Auto-tagging, NSFW detection, alt-text generation
 * 4. CDN Optimization - Edge caching, adaptive delivery
 *
 * Key Design Principles:
 * - Hexagonal architecture with ports and adapters
 * - Registry pattern for dynamic module discovery
 * - Pipeline pattern for composable processing stages
 * - Feature flags for runtime toggling
 */

import { z } from "zod";

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

type Brand<T, B> = T & { __brand: B };

export type MediaId = Brand<string, 'MediaId'>;
export type ModuleId = Brand<string, 'ModuleId'>;
export type PipelineId = Brand<string, 'PipelineId'>;
export type ProcessorId = Brand<string, 'ProcessorId'>;
export type AdapterId = Brand<string, 'AdapterId'>;
export type StorageProviderId = Brand<string, 'StorageProviderId'>;

// =============================================================================
// MODULE TIER DEFINITIONS
// =============================================================================

/**
 * Module tier levels defining the hierarchy of media capabilities.
 * Higher tiers require lower tiers to be enabled.
 */
export type ModuleTier =
  | 'core'           // Basic Media - always enabled, essential functionality
  | 'processing'     // Advanced Processing - image/video manipulation
  | 'ai'             // AI Media - ML-powered features
  | 'optimization';  // CDN Optimization - edge delivery, adaptive formats

/**
 * Module tier configuration with dependencies
 */
export interface ModuleTierConfig {
  readonly tier: ModuleTier;
  readonly label: string;
  readonly description: string;
  readonly requiredTiers: ModuleTier[];
  readonly defaultEnabled: boolean;
  readonly licenseRequired?: 'free' | 'pro' | 'enterprise';
}

/**
 * Tier hierarchy definition
 */
export const MODULE_TIERS: Record<ModuleTier, ModuleTierConfig> = {
  core: {
    tier: 'core',
    label: 'Basic Media',
    description: 'Essential media handling: upload, storage, retrieval, basic metadata',
    requiredTiers: [],
    defaultEnabled: true,
    licenseRequired: 'free',
  },
  processing: {
    tier: 'processing',
    label: 'Advanced Processing',
    description: 'Image manipulation, video transcoding, format conversion',
    requiredTiers: ['core'],
    defaultEnabled: false,
    licenseRequired: 'pro',
  },
  ai: {
    tier: 'ai',
    label: 'AI Media',
    description: 'Auto-tagging, NSFW detection, alt-text generation, object recognition',
    requiredTiers: ['core'],
    defaultEnabled: false,
    licenseRequired: 'enterprise',
  },
  optimization: {
    tier: 'optimization',
    label: 'CDN Optimization',
    description: 'Edge caching, adaptive delivery, responsive images, lazy loading',
    requiredTiers: ['core'],
    defaultEnabled: false,
    licenseRequired: 'pro',
  },
};

// =============================================================================
// MEDIA MODULE INTERFACE (PORT)
// =============================================================================

/**
 * Base interface that all media modules must implement.
 * This is the primary inbound port for the module system.
 */
export interface MediaModule {
  /** Unique module identifier */
  readonly id: ModuleId;
  /** Human-readable name */
  readonly name: string;
  /** Module description */
  readonly description: string;
  /** Module version (semver) */
  readonly version: string;
  /** Module tier */
  readonly tier: ModuleTier;
  /** Module author/vendor */
  readonly author: string;
  /** Documentation URL */
  readonly docsUrl?: string;
  /** Dependencies on other modules */
  readonly dependencies: ModuleId[];
  /** Optional dependencies (enhanced when present) */
  readonly optionalDependencies?: ModuleId[];
  /** Provided capabilities */
  readonly capabilities: MediaCapability[];
  /** Configuration schema */
  readonly configSchema: z.ZodSchema;
  /** Default configuration */
  readonly defaultConfig: Record<string, unknown>;

  /** Initialize the module */
  initialize(config: Record<string, unknown>): Promise<ModuleInitResult>;
  /** Shutdown the module */
  shutdown(): Promise<void>;
  /** Health check */
  healthCheck(): Promise<ModuleHealthStatus>;
  /** Get module status */
  getStatus(): ModuleStatus;
}

/**
 * Media capabilities that modules can provide
 */
export type MediaCapability =
  // Core capabilities
  | 'upload'
  | 'download'
  | 'delete'
  | 'metadata-read'
  | 'metadata-write'
  | 'list'
  | 'search'
  // Processing capabilities
  | 'resize'
  | 'crop'
  | 'rotate'
  | 'watermark'
  | 'format-convert'
  | 'compress'
  | 'transcode-video'
  | 'transcode-audio'
  | 'thumbnail-generate'
  | 'sprite-generate'
  | 'animated-preview'
  // AI capabilities
  | 'auto-tag'
  | 'nsfw-detect'
  | 'alt-text-generate'
  | 'object-detect'
  | 'face-detect'
  | 'face-blur'
  | 'ocr'
  | 'scene-classification'
  | 'color-extraction'
  | 'smart-crop'
  // CDN capabilities
  | 'edge-cache'
  | 'adaptive-delivery'
  | 'responsive-images'
  | 'lazy-load'
  | 'preload-hints'
  | 'cdn-purge'
  | 'geo-optimization';

/**
 * Module initialization result
 */
export interface ModuleInitResult {
  readonly success: boolean;
  readonly message?: string;
  readonly warnings?: string[];
  readonly registeredProcessors?: ProcessorId[];
  readonly registeredAdapters?: AdapterId[];
}

/**
 * Module health status
 */
export interface ModuleHealthStatus {
  readonly healthy: boolean;
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  readonly message?: string;
  readonly lastCheck: Date;
  readonly metrics?: ModuleMetrics;
  readonly dependencies?: Record<ModuleId, boolean>;
}

/**
 * Module metrics for monitoring
 */
export interface ModuleMetrics {
  readonly operationsTotal: number;
  readonly operationsPerSecond: number;
  readonly errorRate: number;
  readonly averageLatencyMs: number;
  readonly p99LatencyMs: number;
  readonly memoryUsageBytes?: number;
  readonly customMetrics?: Record<string, number>;
}

/**
 * Module runtime status
 */
export interface ModuleStatus {
  readonly id: ModuleId;
  readonly enabled: boolean;
  readonly initialized: boolean;
  readonly healthy: boolean;
  readonly version: string;
  readonly tier: ModuleTier;
  readonly uptime: number;
  readonly lastError?: ModuleError;
  readonly config: Record<string, unknown>;
}

/**
 * Module error details
 */
export interface ModuleError {
  readonly code: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly stack?: string;
  readonly context?: Record<string, unknown>;
}

// =============================================================================
// STORAGE ADAPTER INTERFACE (PLUGGABLE STORAGE)
// =============================================================================

/**
 * Storage adapter interface for pluggable storage backends.
 * Implementations: S3, R2 (Cloudflare), Local filesystem, Custom
 */
export interface StorageAdapter {
  /** Unique adapter identifier */
  readonly id: StorageProviderId;
  /** Adapter name */
  readonly name: string;
  /** Provider type */
  readonly provider: StorageProvider;
  /** Supported operations */
  readonly capabilities: StorageCapability[];

  /** Initialize the adapter with configuration */
  initialize(config: StorageConfig): Promise<StorageInitResult>;
  /** Shutdown the adapter */
  shutdown(): Promise<void>;
  /** Health check */
  healthCheck(): Promise<StorageHealthStatus>;

  // Core operations
  /** Upload a file */
  upload(request: UploadRequest): Promise<UploadResult>;
  /** Download a file */
  download(request: DownloadRequest): Promise<DownloadResult>;
  /** Delete a file */
  delete(key: string): Promise<DeleteResult>;
  /** Check if file exists */
  exists(key: string): Promise<boolean>;
  /** Get file metadata */
  getMetadata(key: string): Promise<MediaMetadata | null>;
  /** Update file metadata */
  updateMetadata(key: string, metadata: Partial<MediaMetadata>): Promise<void>;
  /** List files */
  list(request: ListRequest): Promise<ListResult>;
  /** Generate signed URL for direct access */
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;

  // Advanced operations (optional)
  /** Copy file within storage */
  copy?(sourceKey: string, destKey: string): Promise<CopyResult>;
  /** Move file within storage */
  move?(sourceKey: string, destKey: string): Promise<MoveResult>;
  /** Get storage stats */
  getStats?(): Promise<StorageStats>;
  /** Multipart upload support */
  initiateMultipartUpload?(key: string, options: MultipartOptions): Promise<MultipartUploadInit>;
  uploadPart?(uploadId: string, partNumber: number, data: Buffer): Promise<PartUploadResult>;
  completeMultipartUpload?(uploadId: string, parts: PartInfo[]): Promise<UploadResult>;
  abortMultipartUpload?(uploadId: string): Promise<void>;
}

/**
 * Storage provider types
 */
export type StorageProvider =
  | 's3'           // Amazon S3 compatible
  | 'r2'           // Cloudflare R2
  | 'gcs'          // Google Cloud Storage
  | 'azure-blob'   // Azure Blob Storage
  | 'local'        // Local filesystem
  | 'minio'        // MinIO (self-hosted S3)
  | 'backblaze-b2' // Backblaze B2
  | 'custom';      // Custom implementation

/**
 * Storage capabilities
 */
export type StorageCapability =
  | 'read'
  | 'write'
  | 'delete'
  | 'list'
  | 'signed-urls'
  | 'multipart-upload'
  | 'versioning'
  | 'lifecycle-rules'
  | 'encryption'
  | 'replication'
  | 'object-lock';

/**
 * Storage configuration (base)
 */
export interface StorageConfig {
  readonly provider: StorageProvider;
  readonly region?: string;
  readonly endpoint?: string;
  readonly bucket?: string;
  readonly basePath?: string;
  readonly credentials?: StorageCredentials;
  readonly encryption?: EncryptionConfig;
  readonly publicAccess?: boolean;
  readonly customDomain?: string;
  readonly retryConfig?: RetryConfig;
}

/**
 * S3-compatible storage configuration
 */
export interface S3StorageConfig extends StorageConfig {
  readonly provider: 's3' | 'r2' | 'minio' | 'backblaze-b2';
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle?: boolean;
  readonly signatureVersion?: 'v2' | 'v4';
}

/**
 * Local filesystem storage configuration
 */
export interface LocalStorageConfig extends StorageConfig {
  readonly provider: 'local';
  readonly rootPath: string;
  readonly maxFileSize?: number;
  readonly createDirectories?: boolean;
  readonly permissions?: {
    readonly fileMode?: number;
    readonly directoryMode?: number;
  };
}

/**
 * Storage credentials
 */
export interface StorageCredentials {
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly sessionToken?: string;
  readonly refreshToken?: string;
  /** Secret reference (e.g., vault path) - never store actual secrets */
  readonly secretRef?: string;
}

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  readonly enabled: boolean;
  readonly type: 'server-side' | 'client-side';
  readonly algorithm?: 'AES256' | 'aws:kms';
  readonly keyId?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly retryableErrors?: string[];
}

/**
 * Storage initialization result
 */
export interface StorageInitResult {
  readonly success: boolean;
  readonly message?: string;
  readonly bucketExists?: boolean;
  readonly bucketCreated?: boolean;
  readonly warnings?: string[];
}

/**
 * Storage health status
 */
export interface StorageHealthStatus {
  readonly healthy: boolean;
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  readonly latencyMs: number;
  readonly message?: string;
  readonly lastCheck: Date;
}

// Storage operation types
export interface UploadRequest {
  readonly key: string;
  readonly data: Buffer | ReadableStream | string;
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
  readonly acl?: 'private' | 'public-read';
  readonly cacheControl?: string;
  readonly contentDisposition?: string;
  readonly tags?: Record<string, string>;
}

export interface UploadResult {
  readonly key: string;
  readonly location: string;
  readonly etag: string;
  readonly versionId?: string;
  readonly size: number;
}

export interface DownloadRequest {
  readonly key: string;
  readonly range?: { start: number; end: number };
  readonly versionId?: string;
}

export interface DownloadResult {
  readonly data: Buffer | ReadableStream;
  readonly contentType: string;
  readonly contentLength: number;
  readonly etag: string;
  readonly lastModified: Date;
  readonly metadata?: Record<string, string>;
}

export interface DeleteResult {
  readonly deleted: boolean;
  readonly versionId?: string;
}

export interface ListRequest {
  readonly prefix?: string;
  readonly delimiter?: string;
  readonly maxKeys?: number;
  readonly continuationToken?: string;
}

export interface ListResult {
  readonly items: StorageItem[];
  readonly prefixes?: string[];
  readonly isTruncated: boolean;
  readonly nextContinuationToken?: string;
}

export interface StorageItem {
  readonly key: string;
  readonly size: number;
  readonly lastModified: Date;
  readonly etag: string;
  readonly storageClass?: string;
}

export interface SignedUrlOptions {
  readonly expiresIn: number;  // seconds
  readonly method: 'GET' | 'PUT';
  readonly contentType?: string;
  readonly responseContentDisposition?: string;
}

export interface CopyResult {
  readonly key: string;
  readonly etag: string;
  readonly versionId?: string;
}

export interface MoveResult {
  readonly key: string;
  readonly etag: string;
  readonly versionId?: string;
}

export interface StorageStats {
  readonly totalObjects: number;
  readonly totalSize: number;
  readonly bucketCount?: number;
  readonly bytesUsedByType?: Record<string, number>;
}

export interface MultipartOptions {
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
  readonly acl?: 'private' | 'public-read';
}

export interface MultipartUploadInit {
  readonly uploadId: string;
  readonly key: string;
}

export interface PartUploadResult {
  readonly etag: string;
  readonly partNumber: number;
}

export interface PartInfo {
  readonly partNumber: number;
  readonly etag: string;
}

// =============================================================================
// PROCESSING PIPELINE INTERFACE
// =============================================================================

/**
 * Processing pipeline for composable media transformations.
 * Stages can be enabled/disabled independently.
 */
export interface MediaPipeline {
  /** Pipeline identifier */
  readonly id: PipelineId;
  /** Pipeline name */
  readonly name: string;
  /** Pipeline description */
  readonly description: string;
  /** Ordered stages in the pipeline */
  readonly stages: PipelineStage[];
  /** Global pipeline configuration */
  readonly config: PipelineConfig;

  /** Execute the pipeline on media */
  execute(input: PipelineInput): Promise<PipelineResult>;
  /** Execute with streaming (for large files) */
  executeStreaming(input: PipelineInput): AsyncIterableIterator<PipelineProgress>;
  /** Validate pipeline configuration */
  validate(): PipelineValidationResult;
  /** Get pipeline visualization data */
  getVisualization(): PipelineVisualization;
  /** Estimate processing time */
  estimateTime(input: PipelineInput): Promise<TimeEstimate>;
}

/**
 * Pipeline stage - individual processing step
 */
export interface PipelineStage {
  /** Stage identifier */
  readonly id: string;
  /** Stage name */
  readonly name: string;
  /** Processor to use */
  readonly processorId: ProcessorId;
  /** Whether this stage is enabled */
  readonly enabled: boolean;
  /** Stage-specific configuration */
  readonly config: Record<string, unknown>;
  /** Conditional execution */
  readonly condition?: StageCondition;
  /** Error handling strategy */
  readonly onError: ErrorStrategy;
  /** Timeout in milliseconds */
  readonly timeout?: number;
  /** Retry configuration */
  readonly retry?: RetryConfig;
}

/**
 * Stage execution condition
 */
export interface StageCondition {
  /** Condition type */
  readonly type: 'always' | 'media-type' | 'file-size' | 'metadata' | 'custom';
  /** Media types to match (for media-type condition) */
  readonly mediaTypes?: string[];
  /** Size threshold in bytes (for file-size condition) */
  readonly sizeThreshold?: number;
  readonly sizeOperator?: 'gt' | 'lt' | 'gte' | 'lte';
  /** Metadata key-value match (for metadata condition) */
  readonly metadataMatch?: Record<string, unknown>;
  /** Custom condition function name */
  readonly customCondition?: string;
}

/**
 * Error handling strategy for pipeline stages
 */
export type ErrorStrategy =
  | { type: 'fail'; message?: string }
  | { type: 'skip'; logLevel: 'warn' | 'error' | 'silent' }
  | { type: 'fallback'; fallbackValue: unknown }
  | { type: 'retry'; maxRetries: number; delay: number };

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Maximum concurrent operations */
  readonly maxConcurrency: number;
  /** Global timeout in milliseconds */
  readonly timeout: number;
  /** Whether to preserve original file */
  readonly preserveOriginal: boolean;
  /** Output path template */
  readonly outputPathTemplate?: string;
  /** Metadata to add to processed files */
  readonly outputMetadata?: Record<string, string>;
  /** Enable pipeline caching */
  readonly caching?: PipelineCacheConfig;
  /** Telemetry configuration */
  readonly telemetry?: TelemetryConfig;
}

/**
 * Pipeline caching configuration
 */
export interface PipelineCacheConfig {
  readonly enabled: boolean;
  readonly ttlSeconds: number;
  readonly cacheKeyStrategy: 'content-hash' | 'path-hash' | 'custom';
  readonly maxCacheSize?: number;
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  readonly enabled: boolean;
  readonly metrics: boolean;
  readonly tracing: boolean;
  readonly logging: boolean;
}

/**
 * Pipeline input
 */
export interface PipelineInput {
  /** Source media identifier or path */
  readonly source: string | MediaId;
  /** Source data (if not using identifier) */
  readonly data?: Buffer | ReadableStream;
  /** Media type hint */
  readonly contentType?: string;
  /** Original filename */
  readonly filename?: string;
  /** Input metadata */
  readonly metadata?: Record<string, unknown>;
  /** Processing options override */
  readonly options?: Record<string, unknown>;
  /** Request context for tracing */
  readonly context?: ProcessingContext;
}

/**
 * Processing context for tracing and logging
 */
export interface ProcessingContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly tags?: Record<string, string>;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  readonly success: boolean;
  readonly pipelineId: PipelineId;
  readonly input: string;
  readonly output: ProcessedMedia;
  readonly stages: StageResult[];
  readonly metrics: PipelineMetrics;
  readonly errors?: PipelineError[];
}

/**
 * Processed media output
 */
export interface ProcessedMedia {
  readonly mediaId: MediaId;
  readonly location: string;
  readonly contentType: string;
  readonly size: number;
  readonly metadata: MediaMetadata;
  /** Variants generated (different sizes, formats) */
  readonly variants?: MediaVariant[];
}

/**
 * Media variant (responsive image, different format, etc.)
 */
export interface MediaVariant {
  readonly key: string;
  readonly width?: number;
  readonly height?: number;
  readonly format: string;
  readonly quality?: number;
  readonly location: string;
  readonly size: number;
}

/**
 * Individual stage execution result
 */
export interface StageResult {
  readonly stageId: string;
  readonly stageName: string;
  readonly processorId: ProcessorId;
  readonly status: 'success' | 'skipped' | 'failed';
  readonly durationMs: number;
  readonly inputSize?: number;
  readonly outputSize?: number;
  readonly metadata?: Record<string, unknown>;
  readonly error?: PipelineError;
}

/**
 * Pipeline metrics
 */
export interface PipelineMetrics {
  readonly totalDurationMs: number;
  readonly stageDurations: Record<string, number>;
  readonly inputSize: number;
  readonly outputSize: number;
  readonly compressionRatio?: number;
  readonly memorypeakBytes?: number;
  readonly cpuTimeMs?: number;
}

/**
 * Pipeline error
 */
export interface PipelineError {
  readonly code: string;
  readonly message: string;
  readonly stage?: string;
  readonly recoverable: boolean;
  readonly cause?: unknown;
}

/**
 * Pipeline progress (for streaming execution)
 */
export interface PipelineProgress {
  readonly stage: string;
  readonly progress: number;  // 0-100
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly message?: string;
  readonly bytesProcessed?: number;
  readonly estimatedTimeRemaining?: number;
}

/**
 * Pipeline validation result
 */
export interface PipelineValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
}

export interface ValidationError {
  readonly stage?: string;
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

export interface ValidationWarning {
  readonly stage?: string;
  readonly message: string;
  readonly suggestion?: string;
}

/**
 * Pipeline visualization data for admin UI
 */
export interface PipelineVisualization {
  readonly pipelineId: PipelineId;
  readonly name: string;
  readonly nodes: VisualizationNode[];
  readonly edges: VisualizationEdge[];
  readonly layout?: 'horizontal' | 'vertical';
}

export interface VisualizationNode {
  readonly id: string;
  readonly type: 'input' | 'stage' | 'output' | 'condition';
  readonly label: string;
  readonly enabled: boolean;
  readonly processor?: string;
  readonly tier?: ModuleTier;
  readonly status?: 'idle' | 'processing' | 'success' | 'failed';
  readonly position?: { x: number; y: number };
}

export interface VisualizationEdge {
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly conditional?: boolean;
}

/**
 * Time estimate for processing
 */
export interface TimeEstimate {
  readonly estimatedMs: number;
  readonly confidence: number;  // 0-1
  readonly breakdown: Record<string, number>;
  readonly basedOn: 'historical' | 'heuristic' | 'unknown';
}

// =============================================================================
// MEDIA PROCESSOR INTERFACE
// =============================================================================

/**
 * Media processor interface - individual processing unit.
 * Processors are pluggable and can be third-party.
 */
export interface MediaProcessor {
  /** Processor identifier */
  readonly id: ProcessorId;
  /** Processor name */
  readonly name: string;
  /** Processor description */
  readonly description: string;
  /** Processor version */
  readonly version: string;
  /** Supported input types */
  readonly inputTypes: string[];
  /** Output type(s) */
  readonly outputTypes: string[];
  /** Capabilities provided */
  readonly capabilities: MediaCapability[];
  /** Configuration schema */
  readonly configSchema: z.ZodSchema;
  /** Whether this processor supports streaming */
  readonly supportsStreaming: boolean;
  /** Estimated memory usage for operation */
  estimateMemory(input: ProcessorInput): number;

  /** Process media */
  process(input: ProcessorInput): Promise<ProcessorOutput>;
  /** Process with streaming */
  processStreaming?(input: ProcessorInput): AsyncIterableIterator<ProcessorProgress>;
  /** Validate input */
  validateInput(input: ProcessorInput): ProcessorValidationResult;
  /** Get processor info */
  getInfo(): ProcessorInfo;
}

export interface ProcessorInput {
  readonly data: Buffer | ReadableStream;
  readonly contentType: string;
  readonly metadata?: Record<string, unknown>;
  readonly config: Record<string, unknown>;
  readonly context?: ProcessingContext;
}

export interface ProcessorOutput {
  readonly data: Buffer | ReadableStream;
  readonly contentType: string;
  readonly metadata: Record<string, unknown>;
  readonly size: number;
}

export interface ProcessorProgress {
  readonly progress: number;
  readonly bytesProcessed: number;
  readonly status: string;
}

export interface ProcessorValidationResult {
  readonly valid: boolean;
  readonly errors?: string[];
  readonly warnings?: string[];
}

export interface ProcessorInfo {
  readonly id: ProcessorId;
  readonly name: string;
  readonly version: string;
  readonly capabilities: MediaCapability[];
  readonly inputTypes: string[];
  readonly outputTypes: string[];
  readonly configOptions: ConfigOption[];
}

export interface ConfigOption {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'select' | 'object';
  readonly required: boolean;
  readonly default?: unknown;
  readonly options?: Array<{ value: string; label: string }>;
  readonly description: string;
}

// =============================================================================
// FORMAT CONVERSION MODULES
// =============================================================================

/**
 * Format conversion module interface.
 * Supports WebP, AVIF, HEIC, and other modern formats.
 */
export interface FormatConversionModule extends MediaModule {
  readonly tier: 'processing';
  readonly capabilities: ['format-convert'];

  /** Get supported input formats */
  getSupportedInputFormats(): FormatInfo[];
  /** Get supported output formats */
  getSupportedOutputFormats(): FormatInfo[];
  /** Check if conversion is supported */
  supportsConversion(from: string, to: string): boolean;
  /** Get conversion quality options */
  getQualityOptions(format: string): QualityOptions;
  /** Convert format */
  convert(request: FormatConversionRequest): Promise<FormatConversionResult>;
}

export interface FormatInfo {
  readonly format: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly description: string;
  readonly lossless: boolean;
  readonly animation: boolean;
  readonly transparency: boolean;
  readonly browserSupport: BrowserSupport;
}

export interface BrowserSupport {
  readonly chrome: number | null;  // minimum version, null if unsupported
  readonly firefox: number | null;
  readonly safari: number | null;
  readonly edge: number | null;
}

export interface QualityOptions {
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly step: number;
  readonly losslessOption: boolean;
}

export interface FormatConversionRequest {
  readonly input: Buffer | ReadableStream;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly quality?: number;
  readonly lossless?: boolean;
  readonly preserveMetadata?: boolean;
  readonly stripMetadata?: boolean;
  readonly resize?: ResizeOptions;
}

export interface ResizeOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  readonly position?: string;
  readonly background?: string;
  readonly withoutEnlargement?: boolean;
}

export interface FormatConversionResult {
  readonly data: Buffer;
  readonly format: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly quality?: number;
  readonly savings?: {
    readonly originalSize: number;
    readonly newSize: number;
    readonly percentage: number;
  };
}

// =============================================================================
// CDN MODULE INTERFACE
// =============================================================================

/**
 * CDN module interface for multi-provider CDN support.
 * Works with any CDN provider through adapters.
 */
export interface CdnModule extends MediaModule {
  readonly tier: 'optimization';
  readonly capabilities: ['edge-cache', 'cdn-purge', 'adaptive-delivery'];

  /** Get active CDN provider */
  getActiveProvider(): CdnProviderInfo;
  /** List available providers */
  listProviders(): CdnProviderInfo[];
  /** Set active provider */
  setActiveProvider(providerId: string): Promise<void>;

  /** Get CDN URL for media */
  getCdnUrl(mediaId: MediaId, options?: CdnUrlOptions): string;
  /** Purge from CDN cache */
  purge(request: PurgeRequest): Promise<PurgeResult>;
  /** Prefetch to CDN edge */
  prefetch(urls: string[]): Promise<PrefetchResult>;
  /** Get cache status */
  getCacheStatus(url: string): Promise<CacheStatus>;
  /** Get CDN analytics */
  getAnalytics(request: CdnAnalyticsRequest): Promise<CdnAnalytics>;

  /** Configure responsive images */
  configureResponsiveImages(config: ResponsiveImagesConfig): void;
  /** Generate responsive image srcset */
  generateSrcSet(mediaId: MediaId, options?: SrcSetOptions): string;
}

export type CdnProviderType =
  | 'cloudflare'
  | 'cloudfront'
  | 'fastly'
  | 'akamai'
  | 'bunny-cdn'
  | 'keycdn'
  | 'stackpath'
  | 'custom';

export interface CdnProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly type: CdnProviderType;
  readonly status: 'active' | 'inactive' | 'error';
  readonly baseUrl: string;
  readonly features: CdnFeature[];
  readonly regions?: string[];
}

export type CdnFeature =
  | 'image-optimization'
  | 'video-streaming'
  | 'edge-compute'
  | 'ddos-protection'
  | 'waf'
  | 'bot-management'
  | 'analytics'
  | 'real-user-monitoring';

export interface CdnUrlOptions {
  readonly variant?: string;
  readonly format?: string;
  readonly quality?: number;
  readonly width?: number;
  readonly height?: number;
  readonly dpr?: number;
  readonly signed?: boolean;
  readonly expiresIn?: number;
}

export interface PurgeRequest {
  readonly type: 'url' | 'tag' | 'prefix' | 'all';
  readonly urls?: string[];
  readonly tags?: string[];
  readonly prefix?: string;
}

export interface PurgeResult {
  readonly success: boolean;
  readonly purgedCount: number;
  readonly purgeId?: string;
  readonly estimatedTime?: number;
}

export interface PrefetchResult {
  readonly success: boolean;
  readonly prefetchedCount: number;
  readonly errors?: string[];
}

export interface CacheStatus {
  readonly url: string;
  readonly cached: boolean;
  readonly cacheAge?: number;
  readonly ttl?: number;
  readonly edgeLocations?: string[];
  readonly hitRatio?: number;
}

export interface CdnAnalyticsRequest {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly metrics: CdnMetric[];
  readonly dimensions?: CdnDimension[];
  readonly filters?: Record<string, string>;
}

export type CdnMetric =
  | 'requests'
  | 'bandwidth'
  | 'cache-hit-ratio'
  | 'origin-requests'
  | 'error-rate'
  | 'latency-p50'
  | 'latency-p99';

export type CdnDimension =
  | 'country'
  | 'device'
  | 'content-type'
  | 'status-code'
  | 'cache-status';

export interface CdnAnalytics {
  readonly period: { start: Date; end: Date };
  readonly metrics: Record<CdnMetric, number>;
  readonly timeSeries?: TimeSeriesData[];
  readonly byDimension?: Record<CdnDimension, DimensionData[]>;
}

export interface TimeSeriesData {
  readonly timestamp: Date;
  readonly values: Record<CdnMetric, number>;
}

export interface DimensionData {
  readonly value: string;
  readonly metrics: Record<CdnMetric, number>;
}

export interface ResponsiveImagesConfig {
  readonly breakpoints: number[];
  readonly formats: string[];
  readonly quality: Record<string, number>;
  readonly defaultFormat: string;
  readonly lazyLoading: boolean;
  readonly placeholderStrategy: 'blur' | 'dominant-color' | 'lqip' | 'none';
}

export interface SrcSetOptions {
  readonly sizes: string;
  readonly formats?: string[];
  readonly quality?: number;
  readonly aspectRatio?: string;
}

// =============================================================================
// AI MEDIA MODULES
// =============================================================================

/**
 * AI Media module interface for ML-powered media features.
 */
export interface AiMediaModule extends MediaModule {
  readonly tier: 'ai';

  /** Auto-tag media */
  autoTag(request: AutoTagRequest): Promise<AutoTagResult>;
  /** Detect NSFW content */
  detectNsfw(request: NsfwDetectionRequest): Promise<NsfwDetectionResult>;
  /** Generate alt text */
  generateAltText(request: AltTextRequest): Promise<AltTextResult>;
  /** Detect objects */
  detectObjects(request: ObjectDetectionRequest): Promise<ObjectDetectionResult>;
  /** Extract colors */
  extractColors(request: ColorExtractionRequest): Promise<ColorExtractionResult>;
  /** Smart crop */
  smartCrop(request: SmartCropRequest): Promise<SmartCropResult>;
  /** OCR */
  performOcr(request: OcrRequest): Promise<OcrResult>;
  /** Face detection (for blurring, not recognition) */
  detectFaces(request: FaceDetectionRequest): Promise<FaceDetectionResult>;
}

export interface AutoTagRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly maxTags?: number;
  readonly minConfidence?: number;
  readonly categories?: string[];
  readonly language?: string;
}

export interface AutoTagResult {
  readonly tags: Array<{
    readonly name: string;
    readonly confidence: number;
    readonly category?: string;
  }>;
  readonly dominantColors?: string[];
  readonly modelUsed: string;
  readonly processingTimeMs: number;
}

export interface NsfwDetectionRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly categories?: NsfwCategory[];
  readonly threshold?: number;
}

export type NsfwCategory =
  | 'adult'
  | 'violence'
  | 'racy'
  | 'spoof'
  | 'medical'
  | 'drugs';

export interface NsfwDetectionResult {
  readonly safe: boolean;
  readonly scores: Record<NsfwCategory, number>;
  readonly flaggedCategories: NsfwCategory[];
  readonly confidence: number;
  readonly modelUsed: string;
  readonly processingTimeMs: number;
}

export interface AltTextRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly maxLength?: number;
  readonly language?: string;
  readonly style?: 'descriptive' | 'concise' | 'detailed';
  readonly context?: string;
}

export interface AltTextResult {
  readonly altText: string;
  readonly confidence: number;
  readonly detectedObjects?: string[];
  readonly detectedText?: string[];
  readonly modelUsed: string;
  readonly processingTimeMs: number;
}

export interface ObjectDetectionRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly maxObjects?: number;
  readonly minConfidence?: number;
  readonly categories?: string[];
}

export interface ObjectDetectionResult {
  readonly objects: Array<{
    readonly name: string;
    readonly confidence: number;
    readonly boundingBox: BoundingBox;
    readonly category?: string;
  }>;
  readonly modelUsed: string;
  readonly processingTimeMs: number;
}

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ColorExtractionRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly maxColors?: number;
  readonly format?: 'hex' | 'rgb' | 'hsl';
}

export interface ColorExtractionResult {
  readonly colors: Array<{
    readonly color: string;
    readonly percentage: number;
    readonly name?: string;
  }>;
  readonly dominantColor: string;
  readonly palette: string[];
  readonly processingTimeMs: number;
}

export interface SmartCropRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly focusOn?: 'face' | 'subject' | 'center' | 'auto';
}

export interface SmartCropResult {
  readonly cropArea: BoundingBox;
  readonly focusPoint: { x: number; y: number };
  readonly confidence: number;
  readonly croppedData?: Buffer;
  readonly processingTimeMs: number;
}

export interface OcrRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly languages?: string[];
  readonly detectOrientation?: boolean;
}

export interface OcrResult {
  readonly text: string;
  readonly blocks: OcrBlock[];
  readonly language?: string;
  readonly orientation?: number;
  readonly confidence: number;
  readonly processingTimeMs: number;
}

export interface OcrBlock {
  readonly text: string;
  readonly boundingBox: BoundingBox;
  readonly confidence: number;
  readonly type: 'line' | 'paragraph' | 'word';
}

export interface FaceDetectionRequest {
  readonly mediaId: MediaId;
  readonly data?: Buffer;
  readonly detectAttributes?: boolean;
}

export interface FaceDetectionResult {
  readonly faces: Array<{
    readonly boundingBox: BoundingBox;
    readonly confidence: number;
    readonly attributes?: FaceAttributes;
  }>;
  readonly faceCount: number;
  readonly processingTimeMs: number;
}

export interface FaceAttributes {
  readonly age?: { min: number; max: number };
  readonly gender?: string;
  readonly emotion?: string;
  readonly glasses?: boolean;
  readonly beard?: boolean;
}

// =============================================================================
// MEDIA METADATA
// =============================================================================

/**
 * Comprehensive media metadata structure
 */
export interface MediaMetadata {
  // Core metadata
  readonly id: MediaId;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy?: string;

  // File metadata
  readonly hash?: string;
  readonly extension: string;
  readonly storageKey: string;
  readonly storageBucket?: string;
  readonly storageProvider: StorageProvider;

  // Image-specific metadata
  readonly width?: number;
  readonly height?: number;
  readonly aspectRatio?: string;
  readonly colorSpace?: string;
  readonly hasAlpha?: boolean;
  readonly isAnimated?: boolean;
  readonly frameCount?: number;
  readonly duration?: number;  // for video/audio in seconds

  // EXIF metadata (for images)
  readonly exif?: ExifMetadata;

  // Video-specific metadata
  readonly video?: VideoMetadata;

  // Audio-specific metadata
  readonly audio?: AudioMetadata;

  // AI-generated metadata
  readonly ai?: AiMetadata;

  // Custom metadata
  readonly custom?: Record<string, unknown>;

  // Access control
  readonly acl?: 'private' | 'public-read';
  readonly permissions?: MediaPermissions;

  // Processing status
  readonly processingStatus?: ProcessingStatus;

  // Variants
  readonly variants?: Record<string, VariantMetadata>;
}

export interface ExifMetadata {
  readonly make?: string;
  readonly model?: string;
  readonly dateTime?: Date;
  readonly exposureTime?: string;
  readonly fNumber?: number;
  readonly iso?: number;
  readonly focalLength?: number;
  readonly gps?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly altitude?: number;
  };
  readonly orientation?: number;
}

export interface VideoMetadata {
  readonly codec: string;
  readonly bitrate: number;
  readonly frameRate: number;
  readonly duration: number;
  readonly hasAudio: boolean;
  readonly audioCodec?: string;
  readonly audioBitrate?: number;
  readonly audioChannels?: number;
}

export interface AudioMetadata {
  readonly codec: string;
  readonly bitrate: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly duration: number;
}

export interface AiMetadata {
  readonly tags?: Array<{ name: string; confidence: number }>;
  readonly altText?: string;
  readonly nsfw?: {
    readonly safe: boolean;
    readonly scores: Record<string, number>;
  };
  readonly objects?: Array<{ name: string; confidence: number }>;
  readonly colors?: string[];
  readonly text?: string;
  readonly faces?: number;
  readonly processedAt?: Date;
  readonly modelVersion?: string;
}

export interface MediaPermissions {
  readonly public: boolean;
  readonly users?: string[];
  readonly roles?: string[];
  readonly expiresAt?: Date;
}

export interface ProcessingStatus {
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly progress?: number;
  readonly stages?: Record<string, 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'>;
  readonly error?: string;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
}

export interface VariantMetadata {
  readonly key: string;
  readonly format: string;
  readonly width?: number;
  readonly height?: number;
  readonly size: number;
  readonly quality?: number;
}

// =============================================================================
// MODULE REGISTRY
// =============================================================================

/**
 * Module registry for dynamic module discovery and management.
 */
export interface MediaModuleRegistry {
  /** Register a module */
  register(module: MediaModule): void;
  /** Unregister a module */
  unregister(moduleId: ModuleId): void;
  /** Get a module by ID */
  get(moduleId: ModuleId): MediaModule | undefined;
  /** Get all modules */
  getAll(): MediaModule[];
  /** Get modules by tier */
  getByTier(tier: ModuleTier): MediaModule[];
  /** Get modules by capability */
  getByCapability(capability: MediaCapability): MediaModule[];
  /** Check if module is registered */
  has(moduleId: ModuleId): boolean;
  /** Get enabled modules */
  getEnabled(): MediaModule[];
  /** Enable a module */
  enable(moduleId: ModuleId): Promise<ModuleInitResult>;
  /** Disable a module */
  disable(moduleId: ModuleId): Promise<void>;
  /** Get module dependency graph */
  getDependencyGraph(): DependencyGraph;
  /** Validate module dependencies */
  validateDependencies(moduleId: ModuleId): DependencyValidationResult;
}

export interface DependencyGraph {
  readonly nodes: Array<{
    readonly moduleId: ModuleId;
    readonly tier: ModuleTier;
    readonly enabled: boolean;
  }>;
  readonly edges: Array<{
    readonly from: ModuleId;
    readonly to: ModuleId;
    readonly type: 'required' | 'optional';
  }>;
}

export interface DependencyValidationResult {
  readonly valid: boolean;
  readonly missingDependencies: ModuleId[];
  readonly circularDependencies?: ModuleId[][];
  readonly warnings?: string[];
}

// =============================================================================
// PROCESSOR REGISTRY
// =============================================================================

/**
 * Processor registry for pluggable processors.
 */
export interface MediaProcessorRegistry {
  /** Register a processor */
  register(processor: MediaProcessor): void;
  /** Unregister a processor */
  unregister(processorId: ProcessorId): void;
  /** Get a processor by ID */
  get(processorId: ProcessorId): MediaProcessor | undefined;
  /** Get all processors */
  getAll(): MediaProcessor[];
  /** Get processors by capability */
  getByCapability(capability: MediaCapability): MediaProcessor[];
  /** Get processors for input type */
  getForInputType(mimeType: string): MediaProcessor[];
  /** Check if processor is registered */
  has(processorId: ProcessorId): boolean;
}

// =============================================================================
// STORAGE ADAPTER REGISTRY
// =============================================================================

/**
 * Storage adapter registry for pluggable storage backends.
 */
export interface StorageAdapterRegistry {
  /** Register a storage adapter */
  register(adapter: StorageAdapter): void;
  /** Unregister a storage adapter */
  unregister(adapterId: StorageProviderId): void;
  /** Get a storage adapter by ID */
  get(adapterId: StorageProviderId): StorageAdapter | undefined;
  /** Get the default (active) storage adapter */
  getDefault(): StorageAdapter;
  /** Set the default storage adapter */
  setDefault(adapterId: StorageProviderId): void;
  /** Get all registered adapters */
  getAll(): StorageAdapter[];
  /** Check if adapter is registered */
  has(adapterId: StorageProviderId): boolean;
}

// =============================================================================
// MEDIA SERVICE INTERFACE (MAIN API)
// =============================================================================

/**
 * Main media service interface - the primary API for media operations.
 * This is the facade that coordinates modules, storage, and processing.
 */
export interface MediaService {
  // Module management
  readonly modules: MediaModuleRegistry;
  readonly processors: MediaProcessorRegistry;
  readonly storage: StorageAdapterRegistry;

  // Core operations
  /** Upload media */
  upload(request: MediaUploadRequest): Promise<MediaUploadResult>;
  /** Get media by ID */
  get(mediaId: MediaId): Promise<MediaMetadata | null>;
  /** Delete media */
  delete(mediaId: MediaId): Promise<void>;
  /** List media */
  list(request: MediaListRequest): Promise<MediaListResult>;
  /** Search media */
  search(request: MediaSearchRequest): Promise<MediaSearchResult>;

  // Processing
  /** Process media through pipeline */
  process(mediaId: MediaId, pipelineId: PipelineId): Promise<PipelineResult>;
  /** Create a custom pipeline */
  createPipeline(config: PipelineConfig, stages: PipelineStage[]): MediaPipeline;
  /** Get default pipeline for media type */
  getDefaultPipeline(mimeType: string): MediaPipeline | undefined;

  // URLs
  /** Get URL for media */
  getUrl(mediaId: MediaId, options?: UrlOptions): string;
  /** Get signed URL for private media */
  getSignedUrl(mediaId: MediaId, options: SignedUrlOptions): Promise<string>;

  // Variants
  /** Get variant of media */
  getVariant(mediaId: MediaId, variant: string): Promise<MediaMetadata | null>;
  /** Generate variants */
  generateVariants(mediaId: MediaId, variants: VariantConfig[]): Promise<Record<string, MediaMetadata>>;

  // Batch operations
  /** Batch upload */
  batchUpload(requests: MediaUploadRequest[]): Promise<MediaUploadResult[]>;
  /** Batch delete */
  batchDelete(mediaIds: MediaId[]): Promise<void>;
  /** Batch process */
  batchProcess(mediaIds: MediaId[], pipelineId: PipelineId): Promise<PipelineResult[]>;

  // Events
  /** Subscribe to media events */
  on(event: MediaEvent, handler: MediaEventHandler): void;
  /** Unsubscribe from media events */
  off(event: MediaEvent, handler: MediaEventHandler): void;

  // Health & Status
  /** Get service health */
  healthCheck(): Promise<MediaServiceHealth>;
  /** Get service status */
  getStatus(): MediaServiceStatus;
  /** Get pipeline visualization for admin */
  getPipelineVisualization(pipelineId?: PipelineId): PipelineVisualization[];
}

export interface MediaUploadRequest {
  readonly data: Buffer | ReadableStream;
  readonly filename: string;
  readonly contentType: string;
  readonly metadata?: Record<string, unknown>;
  readonly pipeline?: PipelineId;
  readonly variants?: VariantConfig[];
  readonly acl?: 'private' | 'public-read';
  readonly tags?: string[];
  readonly folder?: string;
}

export interface MediaUploadResult {
  readonly success: boolean;
  readonly media: MediaMetadata;
  readonly variants?: Record<string, MediaMetadata>;
  readonly processingResult?: PipelineResult;
  readonly warnings?: string[];
}

export interface MediaListRequest {
  readonly folder?: string;
  readonly mimeTypes?: string[];
  readonly tags?: string[];
  readonly createdAfter?: Date;
  readonly createdBefore?: Date;
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'filename' | 'size';
  readonly sortOrder?: 'asc' | 'desc';
  readonly page?: number;
  readonly limit?: number;
}

export interface MediaListResult {
  readonly items: MediaMetadata[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
}

export interface MediaSearchRequest {
  readonly query: string;
  readonly filters?: {
    readonly mimeTypes?: string[];
    readonly tags?: string[];
    readonly dateRange?: { start: Date; end: Date };
    readonly sizeRange?: { min: number; max: number };
  };
  readonly page?: number;
  readonly limit?: number;
}

export interface MediaSearchResult {
  readonly items: Array<MediaMetadata & { score: number }>;
  readonly facets?: Record<string, Array<{ value: string; count: number }>>;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
}

export interface UrlOptions {
  readonly variant?: string;
  readonly format?: string;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
}

export interface VariantConfig {
  readonly name: string;
  readonly format?: string;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export type MediaEvent =
  | 'upload:start'
  | 'upload:progress'
  | 'upload:complete'
  | 'upload:error'
  | 'process:start'
  | 'process:progress'
  | 'process:complete'
  | 'process:error'
  | 'delete'
  | 'variant:created';

export type MediaEventHandler = (event: MediaEventData) => void;

export interface MediaEventData {
  readonly event: MediaEvent;
  readonly mediaId?: MediaId;
  readonly timestamp: Date;
  readonly data?: Record<string, unknown>;
}

export interface MediaServiceHealth {
  readonly healthy: boolean;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly modules: Record<ModuleId, ModuleHealthStatus>;
  readonly storage: StorageHealthStatus;
  readonly uptime: number;
  readonly lastCheck: Date;
}

export interface MediaServiceStatus {
  readonly version: string;
  readonly enabledModules: ModuleId[];
  readonly enabledTiers: ModuleTier[];
  readonly storageProvider: StorageProvider;
  readonly pipelinesConfigured: number;
  readonly processorsRegistered: number;
  readonly metrics: MediaServiceMetrics;
}

export interface MediaServiceMetrics {
  readonly uploadsTotal: number;
  readonly uploadsToday: number;
  readonly storageUsedBytes: number;
  readonly processingQueueLength: number;
  readonly averageProcessingTimeMs: number;
  readonly errorRate: number;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

export const storageConfigSchema = z.object({
  provider: z.enum(['s3', 'r2', 'gcs', 'azure-blob', 'local', 'minio', 'backblaze-b2', 'custom']),
  region: z.string().optional(),
  endpoint: z.string().url().optional(),
  bucket: z.string().optional(),
  basePath: z.string().optional(),
  publicAccess: z.boolean().optional(),
  customDomain: z.string().optional(),
});

export const pipelineStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  processorId: z.string().min(1),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
  onError: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fail'), message: z.string().optional() }),
    z.object({ type: z.literal('skip'), logLevel: z.enum(['warn', 'error', 'silent']) }),
    z.object({ type: z.literal('fallback'), fallbackValue: z.unknown() }),
    z.object({ type: z.literal('retry'), maxRetries: z.number(), delay: z.number() }),
  ]),
  timeout: z.number().positive().optional(),
});

export const pipelineConfigSchema = z.object({
  maxConcurrency: z.number().int().positive().default(4),
  timeout: z.number().positive().default(60000),
  preserveOriginal: z.boolean().default(true),
  outputPathTemplate: z.string().optional(),
  outputMetadata: z.record(z.string()).optional(),
});

export const variantConfigSchema = z.object({
  name: z.string().min(1),
  format: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  quality: z.number().min(1).max(100).optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
});

export const mediaUploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  pipeline: z.string().optional(),
  variants: z.array(variantConfigSchema).optional(),
  acl: z.enum(['private', 'public-read']).optional(),
  tags: z.array(z.string()).optional(),
  folder: z.string().optional(),
});

// =============================================================================
// DEFAULT MODULE CONFIGURATIONS
// =============================================================================

/**
 * Default configurations for built-in modules
 */
export const DEFAULT_MODULE_CONFIGS = {
  'basic-media': {
    maxUploadSize: 100 * 1024 * 1024, // 100MB
    allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf'],
    preserveOriginals: true,
    generateThumbnails: true,
    thumbnailSizes: [150, 300, 600],
  },
  'image-processing': {
    defaultQuality: 85,
    defaultFormat: 'webp',
    maxDimension: 4096,
    stripMetadata: false,
    autoOrient: true,
  },
  'video-processing': {
    defaultCodec: 'h264',
    defaultQuality: 'medium',
    generateThumbnails: true,
    thumbnailInterval: 10,
    maxDuration: 3600,
  },
  'ai-media': {
    autoTagOnUpload: true,
    generateAltText: true,
    nsfwDetection: true,
    nsfwThreshold: 0.7,
    maxTagsPerImage: 20,
    minTagConfidence: 0.5,
  },
  'cdn-optimization': {
    defaultTtl: 86400,
    immutableTtl: 31536000,
    responsiveBreakpoints: [320, 640, 768, 1024, 1280, 1920],
    defaultFormats: ['webp', 'avif'],
    lazyLoading: true,
    placeholderStrategy: 'blur',
  },
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  ModuleTier,
  MediaCapability,
  StorageProvider,
  StorageCapability,
  CdnProviderType,
  CdnFeature,
  CdnMetric,
  CdnDimension,
  NsfwCategory,
  MediaEvent,
};
