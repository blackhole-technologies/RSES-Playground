/**
 * @file subsystem-ports.ts
 * @description Hexagonal Architecture Port Definitions for All Subsystems
 * @phase Enterprise Architecture Enhancement
 * @author Project Architect Agent
 * @created 2026-02-01
 *
 * These interfaces define the ports (boundaries) for each subsystem.
 * Adapters implement these ports to connect to external systems.
 */

import type {
  AggregateId,
  Brand,
  Command,
  CommandMetadata,
  DomainEvent,
  EventMetadata,
  Query,
  QueryMetadata,
  Result,
  UserId,
  TenantId,
} from './kernel-contracts';

// =============================================================================
// CONTENT SUBSYSTEM PORTS
// =============================================================================

export type ContentId = Brand<string, 'ContentId'>;
export type ContentTypeId = Brand<string, 'ContentTypeId'>;
export type RevisionId = Brand<string, 'RevisionId'>;
export type FieldId = Brand<string, 'FieldId'>;

/**
 * Content API Port - Inbound port for content operations.
 * This is what the application layer exposes to the outside world.
 */
export interface ContentApiPort {
  // Commands (Write Operations)
  createContent(command: CreateContentCommand): Promise<Result<ContentId, ContentError>>;
  updateContent(command: UpdateContentCommand): Promise<Result<void, ContentError>>;
  publishContent(command: PublishContentCommand): Promise<Result<void, ContentError>>;
  unpublishContent(command: UnpublishContentCommand): Promise<Result<void, ContentError>>;
  deleteContent(command: DeleteContentCommand): Promise<Result<void, ContentError>>;
  restoreContent(command: RestoreContentCommand): Promise<Result<void, ContentError>>;

  // Revision Commands
  createRevision(command: CreateRevisionCommand): Promise<Result<RevisionId, ContentError>>;
  revertToRevision(command: RevertToRevisionCommand): Promise<Result<void, ContentError>>;

  // Queries (Read Operations)
  getContent(query: GetContentQuery): Promise<Result<ContentDTO, ContentError>>;
  listContent(query: ListContentQuery): Promise<Result<ContentListDTO, ContentError>>;
  searchContent(query: SearchContentQuery): Promise<Result<SearchResultDTO, ContentError>>;
  getRevisions(query: GetRevisionsQuery): Promise<Result<RevisionListDTO, ContentError>>;
  diffRevisions(query: DiffRevisionsQuery): Promise<Result<RevisionDiffDTO, ContentError>>;
}

// Content Commands
export interface CreateContentCommand extends Command<CreateContentPayload> {
  readonly commandType: 'CreateContent';
}

export interface CreateContentPayload {
  readonly contentTypeId: ContentTypeId;
  readonly title: string;
  readonly fields: Record<string, FieldValue>;
  readonly langcode?: string;
  readonly status?: 'draft' | 'published';
}

export interface UpdateContentCommand extends Command<UpdateContentPayload> {
  readonly commandType: 'UpdateContent';
}

export interface UpdateContentPayload {
  readonly contentId: ContentId;
  readonly title?: string;
  readonly fields?: Record<string, FieldValue>;
  readonly createRevision?: boolean;
  readonly revisionMessage?: string;
}

export interface PublishContentCommand extends Command<PublishContentPayload> {
  readonly commandType: 'PublishContent';
}

export interface PublishContentPayload {
  readonly contentId: ContentId;
  readonly scheduledFor?: Date;
}

export interface UnpublishContentCommand extends Command<UnpublishContentPayload> {
  readonly commandType: 'UnpublishContent';
}

export interface UnpublishContentPayload {
  readonly contentId: ContentId;
}

export interface DeleteContentCommand extends Command<DeleteContentPayload> {
  readonly commandType: 'DeleteContent';
}

export interface DeleteContentPayload {
  readonly contentId: ContentId;
  readonly permanent?: boolean;
}

export interface RestoreContentCommand extends Command<RestoreContentPayload> {
  readonly commandType: 'RestoreContent';
}

export interface RestoreContentPayload {
  readonly contentId: ContentId;
}

export interface CreateRevisionCommand extends Command<CreateRevisionPayload> {
  readonly commandType: 'CreateRevision';
}

export interface CreateRevisionPayload {
  readonly contentId: ContentId;
  readonly message?: string;
}

export interface RevertToRevisionCommand extends Command<RevertToRevisionPayload> {
  readonly commandType: 'RevertToRevision';
}

export interface RevertToRevisionPayload {
  readonly contentId: ContentId;
  readonly revisionId: RevisionId;
  readonly message?: string;
}

// Content Queries
export interface GetContentQuery extends Query<ContentDTO> {
  readonly queryType: 'GetContent';
  readonly contentId: ContentId;
  readonly includeFields?: boolean;
  readonly includeMetadata?: boolean;
}

export interface ListContentQuery extends Query<ContentListDTO> {
  readonly queryType: 'ListContent';
  readonly contentTypeId?: ContentTypeId;
  readonly status?: 'draft' | 'published' | 'all';
  readonly page?: number;
  readonly limit?: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
  readonly filters?: ContentFilter[];
}

export interface ContentFilter {
  readonly field: string;
  readonly operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  readonly value: unknown;
}

export interface SearchContentQuery extends Query<SearchResultDTO> {
  readonly queryType: 'SearchContent';
  readonly query: string;
  readonly contentTypeId?: ContentTypeId;
  readonly facets?: string[];
  readonly page?: number;
  readonly limit?: number;
}

export interface GetRevisionsQuery extends Query<RevisionListDTO> {
  readonly queryType: 'GetRevisions';
  readonly contentId: ContentId;
  readonly page?: number;
  readonly limit?: number;
}

export interface DiffRevisionsQuery extends Query<RevisionDiffDTO> {
  readonly queryType: 'DiffRevisions';
  readonly contentId: ContentId;
  readonly fromRevisionId: RevisionId;
  readonly toRevisionId: RevisionId;
}

// Content DTOs
export interface ContentDTO {
  readonly id: ContentId;
  readonly contentTypeId: ContentTypeId;
  readonly title: string;
  readonly status: 'draft' | 'published' | 'archived';
  readonly fields: Record<string, FieldValue>;
  readonly langcode: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt?: Date;
  readonly author: UserReference;
  readonly currentRevisionId?: RevisionId;
  readonly metadata?: ContentMetadata;
}

export interface ContentListDTO {
  readonly items: ContentDTO[];
  readonly pagination: Pagination;
}

export interface SearchResultDTO {
  readonly items: SearchHit[];
  readonly facets?: Record<string, FacetResult[]>;
  readonly pagination: Pagination;
  readonly took: number;
}

export interface SearchHit {
  readonly content: ContentDTO;
  readonly score: number;
  readonly highlights?: Record<string, string[]>;
}

export interface FacetResult {
  readonly value: string;
  readonly count: number;
}

export interface RevisionListDTO {
  readonly items: RevisionDTO[];
  readonly pagination: Pagination;
}

export interface RevisionDTO {
  readonly id: RevisionId;
  readonly contentId: ContentId;
  readonly version: number;
  readonly message?: string;
  readonly createdAt: Date;
  readonly author: UserReference;
  readonly changes: string[];
}

export interface RevisionDiffDTO {
  readonly fromRevision: RevisionDTO;
  readonly toRevision: RevisionDTO;
  readonly changes: FieldDiff[];
}

export interface FieldDiff {
  readonly fieldId: string;
  readonly type: 'added' | 'removed' | 'modified';
  readonly oldValue?: FieldValue;
  readonly newValue?: FieldValue;
}

// Content Storage Port - Outbound port for persistence
export interface ContentStoragePort {
  save(aggregate: ContentAggregate): Promise<void>;
  load(id: ContentId): Promise<ContentAggregate | null>;
  delete(id: ContentId): Promise<void>;

  // Event Sourcing
  appendEvents(aggregateId: ContentId, events: DomainEvent[], expectedVersion: number): Promise<void>;
  loadEvents(aggregateId: ContentId, fromVersion?: number): Promise<DomainEvent[]>;

  // Snapshots
  saveSnapshot(aggregateId: ContentId, snapshot: ContentSnapshot, version: number): Promise<void>;
  loadSnapshot(aggregateId: ContentId): Promise<{ snapshot: ContentSnapshot; version: number } | null>;
}

// Search Port - Outbound port for search engine
export interface ContentSearchPort {
  index(content: ContentDTO): Promise<void>;
  update(content: ContentDTO): Promise<void>;
  remove(contentId: ContentId): Promise<void>;
  search(query: SearchQuery): Promise<SearchResults>;
  suggest(prefix: string, options?: SuggestOptions): Promise<Suggestion[]>;
  reindex(contentTypeId?: ContentTypeId): Promise<ReindexResult>;
}

// Content Error Types
export type ContentError =
  | { type: 'NOT_FOUND'; contentId: ContentId }
  | { type: 'VALIDATION_ERROR'; violations: ValidationViolation[] }
  | { type: 'CONCURRENCY_ERROR'; expectedVersion: number; actualVersion: number }
  | { type: 'CONTENT_TYPE_NOT_FOUND'; contentTypeId: ContentTypeId }
  | { type: 'FIELD_TYPE_MISMATCH'; fieldId: string; expected: string; actual: string }
  | { type: 'PUBLISH_WORKFLOW_ERROR'; message: string }
  | { type: 'STORAGE_ERROR'; message: string; cause?: unknown };

// =============================================================================
// TAXONOMY SUBSYSTEM PORTS
// =============================================================================

export type VocabularyId = Brand<string, 'VocabularyId'>;
export type TermId = Brand<string, 'TermId'>;

/**
 * Taxonomy API Port - Inbound port for taxonomy operations.
 */
export interface TaxonomyApiPort {
  // Vocabulary Commands
  createVocabulary(command: CreateVocabularyCommand): Promise<Result<VocabularyId, TaxonomyError>>;
  updateVocabulary(command: UpdateVocabularyCommand): Promise<Result<void, TaxonomyError>>;
  deleteVocabulary(command: DeleteVocabularyCommand): Promise<Result<void, TaxonomyError>>;

  // Term Commands
  createTerm(command: CreateTermCommand): Promise<Result<TermId, TaxonomyError>>;
  updateTerm(command: UpdateTermCommand): Promise<Result<void, TaxonomyError>>;
  deleteTerm(command: DeleteTermCommand): Promise<Result<void, TaxonomyError>>;
  moveTerm(command: MoveTermCommand): Promise<Result<void, TaxonomyError>>;
  mergeTerm(command: MergeTermCommand): Promise<Result<void, TaxonomyError>>;

  // Classification
  classifyContent(contentId: ContentId): Promise<Result<ClassificationResult, TaxonomyError>>;
  suggestTerms(content: ContentDTO): Promise<Result<TermSuggestion[], TaxonomyError>>;

  // Queries
  getVocabulary(vocabId: VocabularyId): Promise<Result<VocabularyDTO, TaxonomyError>>;
  listVocabularies(): Promise<Result<VocabularyDTO[], TaxonomyError>>;
  getTerm(termId: TermId): Promise<Result<TermDTO, TaxonomyError>>;
  getTermTree(vocabId: VocabularyId): Promise<Result<TermTreeDTO, TaxonomyError>>;
  searchTerms(query: TermSearchQuery): Promise<Result<TermDTO[], TaxonomyError>>;

  // Set-theoretic Operations (from taxonomy algebra)
  queryTerms(query: TaxonomyQuery): Promise<Result<TermDTO[], TaxonomyError>>;
  getFacetCounts(vocabId: VocabularyId, baseContentIds?: ContentId[]): Promise<Result<FacetCounts, TaxonomyError>>;
  findLCA(termId1: TermId, termId2: TermId): Promise<Result<TermId[], TaxonomyError>>;
  getAncestors(termId: TermId): Promise<Result<TermId[], TaxonomyError>>;
  getDescendants(termId: TermId): Promise<Result<TermId[], TaxonomyError>>;
}

// Taxonomy Commands
export interface CreateVocabularyCommand extends Command<CreateVocabularyPayload> {
  readonly commandType: 'CreateVocabulary';
}

export interface CreateVocabularyPayload {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly hierarchy: 0 | 1 | 2;  // 0=flat, 1=single-parent, 2=multi-parent
  readonly rsesIntegration?: RsesIntegrationConfig;
}

export interface RsesIntegrationConfig {
  readonly enabled: boolean;
  readonly category: string;
  readonly configId: number | null;
  readonly autoCreateTerms: boolean;
  readonly symlinkBasePath?: string;
}

export interface CreateTermCommand extends Command<CreateTermPayload> {
  readonly commandType: 'CreateTerm';
}

export interface CreateTermPayload {
  readonly vocabularyId: VocabularyId;
  readonly name: string;
  readonly description?: string;
  readonly parentIds?: TermId[];
  readonly weight?: number;
  readonly rsesMetadata?: RsesTermMetadata;
}

export interface RsesTermMetadata {
  readonly sourceRule?: string;
  readonly matchedPattern?: string;
  readonly symlinks?: string[];
}

export interface MoveTermCommand extends Command<MoveTermPayload> {
  readonly commandType: 'MoveTerm';
}

export interface MoveTermPayload {
  readonly termId: TermId;
  readonly newParentIds: TermId[];
}

export interface MergeTermCommand extends Command<MergeTermPayload> {
  readonly commandType: 'MergeTerm';
}

export interface MergeTermPayload {
  readonly sourceTermId: TermId;
  readonly targetTermId: TermId;
  readonly keepSource?: boolean;
}

// Taxonomy Query Types
export interface TaxonomyQuery {
  readonly type: 'AND' | 'OR' | 'NOT' | 'DESCENDANTS' | 'ANCESTORS' | 'TERM';
  readonly left?: TaxonomyQuery;
  readonly right?: TaxonomyQuery;
  readonly operand?: TaxonomyQuery;
  readonly vocabId?: VocabularyId;
  readonly termName?: string;
}

// Taxonomy DTOs
export interface VocabularyDTO {
  readonly id: VocabularyId;
  readonly label: string;
  readonly description: string;
  readonly hierarchy: 0 | 1 | 2;
  readonly termCount: number;
  readonly rsesIntegration?: RsesIntegrationConfig;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TermDTO {
  readonly id: TermId;
  readonly vocabularyId: VocabularyId;
  readonly name: string;
  readonly description: string;
  readonly weight: number;
  readonly parentIds: TermId[];
  readonly depth: number;
  readonly path: string;  // Materialized path
  readonly contentCount: number;
  readonly rsesMetadata?: RsesTermMetadata;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TermTreeDTO {
  readonly vocabulary: VocabularyDTO;
  readonly roots: TermTreeNode[];
}

export interface TermTreeNode {
  readonly term: TermDTO;
  readonly children: TermTreeNode[];
}

export interface ClassificationResult {
  readonly contentId: ContentId;
  readonly topics: TermId[];
  readonly types: TermId[];
  readonly sets: TermId[];
  readonly confidence: Record<string, number>;
  readonly suggestedNewTerms?: string[];
}

export interface TermSuggestion {
  readonly vocabularyId: VocabularyId;
  readonly termId?: TermId;
  readonly termName: string;
  readonly confidence: number;
  readonly isNew: boolean;
}

export interface FacetCounts {
  readonly vocabularyId: VocabularyId;
  readonly counts: Map<TermId, number>;
}

// RSES Engine Port - Outbound port for RSES integration
export interface RsesEnginePort {
  classify(path: string): Promise<RsesClassification>;
  getRules(configId: number): Promise<RsesRule[]>;
  validateRule(rule: RsesRule): Promise<ValidationResult>;
  syncVocabulary(vocabId: VocabularyId, direction: 'rses-to-cms' | 'cms-to-rses'): Promise<SyncResult>;
}

export interface RsesClassification {
  readonly sets: string[];
  readonly topics: string[];
  readonly types: string[];
  readonly matchedRules: RsesMatchedRule[];
}

export interface RsesMatchedRule {
  readonly ruleId: string;
  readonly pattern: string;
  readonly category: string;
  readonly target: string;
}

export interface RsesRule {
  readonly id: string;
  readonly type: 'classification' | 'attribute' | 'transform';
  readonly pattern: string;
  readonly target: string;
  readonly priority: number;
}

// Taxonomy Error Types
export type TaxonomyError =
  | { type: 'VOCABULARY_NOT_FOUND'; vocabId: VocabularyId }
  | { type: 'TERM_NOT_FOUND'; termId: TermId }
  | { type: 'CYCLE_DETECTED'; path: TermId[] }
  | { type: 'HIERARCHY_VIOLATION'; message: string }
  | { type: 'RSES_SYNC_ERROR'; message: string; cause?: unknown }
  | { type: 'VALIDATION_ERROR'; violations: ValidationViolation[] };

// =============================================================================
// AI SUBSYSTEM PORTS
// =============================================================================

export type ModelId = Brand<string, 'ModelId'>;
export type PipelineId = Brand<string, 'PipelineId'>;

/**
 * AI Inference Port - Inbound port for AI operations.
 */
export interface AIInferencePort {
  // Text generation
  generateText(request: TextGenerationRequest): Promise<Result<TextGenerationResponse, AIError>>;
  streamText(request: TextGenerationRequest): AsyncIterableIterator<string>;

  // Classification
  classifyText(request: ClassifyTextRequest): Promise<Result<ClassificationResponse, AIError>>;

  // Embeddings
  generateEmbeddings(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, AIError>>;

  // Content analysis
  analyzeContent(request: ContentAnalysisRequest): Promise<Result<ContentAnalysisResponse, AIError>>;

  // Model management
  listModels(): Promise<ModelInfo[]>;
  getModelInfo(modelId: ModelId): Promise<Result<ModelInfo, AIError>>;
}

export interface TextGenerationRequest {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly modelId?: ModelId;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: string[];
  readonly context?: Record<string, unknown>;
}

export interface TextGenerationResponse {
  readonly text: string;
  readonly modelId: ModelId;
  readonly tokensUsed: number;
  readonly finishReason: 'stop' | 'length' | 'content_filter';
}

export interface ClassifyTextRequest {
  readonly text: string;
  readonly labels: string[];
  readonly modelId?: ModelId;
  readonly multiLabel?: boolean;
}

export interface ClassificationResponse {
  readonly labels: Array<{ label: string; confidence: number }>;
  readonly modelId: ModelId;
}

export interface EmbeddingRequest {
  readonly texts: string[];
  readonly modelId?: ModelId;
  readonly dimensions?: number;
}

export interface EmbeddingResponse {
  readonly embeddings: number[][];
  readonly modelId: ModelId;
  readonly dimensions: number;
}

export interface ContentAnalysisRequest {
  readonly content: ContentDTO;
  readonly analyses: Array<'sentiment' | 'entities' | 'topics' | 'readability' | 'toxicity'>;
}

export interface ContentAnalysisResponse {
  readonly sentiment?: SentimentResult;
  readonly entities?: EntityResult[];
  readonly topics?: TopicResult[];
  readonly readability?: ReadabilityResult;
  readonly toxicity?: ToxicityResult;
}

export interface SentimentResult {
  readonly score: number;  // -1 to 1
  readonly magnitude: number;
  readonly label: 'negative' | 'neutral' | 'positive';
}

export interface EntityResult {
  readonly name: string;
  readonly type: string;
  readonly salience: number;
  readonly mentions: Array<{ text: string; offset: number }>;
}

export interface TopicResult {
  readonly name: string;
  readonly confidence: number;
}

export interface ReadabilityResult {
  readonly fleschKincaid: number;
  readonly gunningFog: number;
  readonly smogIndex: number;
  readonly averageSentenceLength: number;
  readonly averageWordLength: number;
}

export interface ToxicityResult {
  readonly score: number;
  readonly categories: Record<string, number>;
  readonly flagged: boolean;
}

export interface ModelInfo {
  readonly id: ModelId;
  readonly name: string;
  readonly provider: string;
  readonly capabilities: string[];
  readonly maxTokens: number;
  readonly costPerToken?: number;
}

// AI Model Adapter Port - Outbound port for AI providers
export interface AIModelAdapterPort {
  readonly providerId: string;

  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete(request: CompletionRequest): AsyncIterableIterator<string>;
  embed(texts: string[]): Promise<number[][]>;
  getModels(): Promise<ModelInfo[]>;
}

export interface CompletionRequest {
  readonly modelId: string;
  readonly messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: string[];
}

export interface CompletionResponse {
  readonly content: string;
  readonly tokensUsed: number;
  readonly finishReason: string;
}

export type AIError =
  | { type: 'MODEL_NOT_FOUND'; modelId: ModelId }
  | { type: 'RATE_LIMIT_EXCEEDED'; retryAfter: number }
  | { type: 'CONTENT_FILTERED'; reason: string }
  | { type: 'CONTEXT_TOO_LONG'; maxTokens: number; requestedTokens: number }
  | { type: 'PROVIDER_ERROR'; provider: string; message: string; cause?: unknown };

// =============================================================================
// QUANTUM SUBSYSTEM PORTS
// =============================================================================

export type CircuitId = Brand<string, 'CircuitId'>;
export type JobId = Brand<string, 'JobId'>;

/**
 * Quantum Execution Port - Inbound port for quantum operations.
 */
export interface QuantumExecutionPort {
  // Circuit execution
  executeCircuit(request: CircuitExecutionRequest): Promise<Result<CircuitExecutionResult, QuantumError>>;

  // Hybrid algorithms
  runGroverSearch<T>(oracle: GroverOracle<T>, iterations?: number): Promise<Result<T, QuantumError>>;
  runQAOA(problem: QAOAProblem): Promise<Result<QAOAResult, QuantumError>>;

  // State management
  createSuperposition<T>(states: T[], amplitudes?: number[]): Promise<QuantumState<T>>;
  measure<T>(state: QuantumState<T>): Promise<T>;
  measureProbabilities<T>(state: QuantumState<T>): Promise<Map<T, number>>;

  // Quantum cache (superposition-based)
  quantumCacheGet<V>(key: string): Promise<V | undefined>;
  quantumCacheSet<V>(key: string, value: V, ttl?: number): Promise<void>;

  // Backend management
  listBackends(): Promise<QuantumBackendInfo[]>;
  getBackendInfo(backendId: string): Promise<Result<QuantumBackendInfo, QuantumError>>;
}

export interface CircuitExecutionRequest {
  readonly circuit: QuantumCircuit;
  readonly shots: number;
  readonly backend?: string;
  readonly optimizationLevel?: number;
}

export interface QuantumCircuit {
  readonly id: CircuitId;
  readonly name: string;
  readonly qubits: number;
  readonly gates: QuantumGate[];
  readonly measurements: number[];
}

export interface QuantumGate {
  readonly type: 'H' | 'X' | 'Y' | 'Z' | 'CNOT' | 'CZ' | 'RX' | 'RY' | 'RZ' | 'SWAP' | 'TOFFOLI';
  readonly qubits: number[];
  readonly parameters?: number[];
}

export interface CircuitExecutionResult {
  readonly jobId: JobId;
  readonly counts: Map<string, number>;
  readonly shots: number;
  readonly backend: string;
  readonly executionTime: number;
}

export interface GroverOracle<T> {
  readonly targetStates: T[];
  readonly encode: (state: T) => string;
  readonly decode: (bitstring: string) => T;
}

export interface QAOAProblem {
  readonly costFunction: (bitstring: string) => number;
  readonly numQubits: number;
  readonly depth: number;
  readonly initialParams?: number[];
}

export interface QAOAResult {
  readonly optimalBitstring: string;
  readonly optimalCost: number;
  readonly iterations: number;
  readonly history: Array<{ params: number[]; cost: number }>;
}

export interface QuantumState<T> {
  readonly dimension: number;
  readonly amplitudes: Map<T, ComplexNumber>;
}

export interface ComplexNumber {
  readonly real: number;
  readonly imag: number;
}

export interface QuantumBackendInfo {
  readonly id: string;
  readonly name: string;
  readonly provider: 'ibm' | 'aws' | 'azure' | 'google' | 'simulator';
  readonly qubits: number;
  readonly status: 'available' | 'busy' | 'maintenance';
  readonly queueDepth: number;
  readonly averageJobTime: number;
}

// Quantum Hardware Adapter Port - Outbound port for quantum providers
export interface QuantumHardwareAdapterPort {
  readonly providerId: string;

  submitJob(circuit: QuantumCircuit, shots: number): Promise<JobId>;
  getJobStatus(jobId: JobId): Promise<JobStatus>;
  getJobResult(jobId: JobId): Promise<CircuitExecutionResult>;
  cancelJob(jobId: JobId): Promise<void>;
  listBackends(): Promise<QuantumBackendInfo[]>;
}

export type JobStatus =
  | { status: 'queued'; position: number }
  | { status: 'running'; progress: number }
  | { status: 'completed' }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

export type QuantumError =
  | { type: 'BACKEND_NOT_AVAILABLE'; backendId: string }
  | { type: 'CIRCUIT_TOO_DEEP'; maxDepth: number; actualDepth: number }
  | { type: 'QUBIT_LIMIT_EXCEEDED'; maxQubits: number; requestedQubits: number }
  | { type: 'JOB_FAILED'; jobId: JobId; reason: string }
  | { type: 'SIMULATION_ERROR'; message: string; cause?: unknown };

// =============================================================================
// COMMON TYPES
// =============================================================================

export interface Pagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

export interface UserReference {
  readonly id: UserId;
  readonly name: string;
  readonly email?: string;
}

export interface ContentMetadata {
  readonly wordCount: number;
  readonly readingTime: number;
  readonly lastEditor: UserReference;
  readonly revisionCount: number;
}

export interface ValidationViolation {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

export interface FieldValue {
  value?: string | number | boolean | null;
  format?: string;
  summary?: string;
  targetId?: string;
  targetType?: string;
  uri?: string;
  alt?: string;
  title?: string;
  [key: string]: unknown;
}

export interface ContentAggregate {
  readonly id: ContentId;
  readonly version: number;
  // ... aggregate implementation details
}

export interface ContentSnapshot {
  readonly contentTypeId: ContentTypeId;
  readonly title: string;
  readonly fields: Record<string, FieldValue>;
  readonly status: string;
  // ... snapshot fields
}

export interface SearchQuery {
  readonly query: string;
  readonly filters?: Record<string, unknown>;
  readonly page?: number;
  readonly limit?: number;
}

export interface SearchResults {
  readonly hits: unknown[];
  readonly total: number;
  readonly took: number;
}

export interface SuggestOptions {
  readonly limit?: number;
  readonly fuzzy?: boolean;
}

export interface Suggestion {
  readonly text: string;
  readonly score: number;
}

export interface ReindexResult {
  readonly indexed: number;
  readonly failed: number;
  readonly took: number;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors?: string[];
}

export interface SyncResult {
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
  readonly errors: Array<{ item: string; error: string }>;
}

export interface TermSearchQuery {
  readonly query: string;
  readonly vocabularyId?: VocabularyId;
  readonly limit?: number;
}

export interface UpdateVocabularyCommand extends Command<UpdateVocabularyPayload> {
  readonly commandType: 'UpdateVocabulary';
}

export interface UpdateVocabularyPayload {
  readonly vocabularyId: VocabularyId;
  readonly label?: string;
  readonly description?: string;
}

export interface DeleteVocabularyCommand extends Command<DeleteVocabularyPayload> {
  readonly commandType: 'DeleteVocabulary';
}

export interface DeleteVocabularyPayload {
  readonly vocabularyId: VocabularyId;
}

export interface UpdateTermCommand extends Command<UpdateTermPayload> {
  readonly commandType: 'UpdateTerm';
}

export interface UpdateTermPayload {
  readonly termId: TermId;
  readonly name?: string;
  readonly description?: string;
  readonly weight?: number;
}

export interface DeleteTermCommand extends Command<DeleteTermPayload> {
  readonly commandType: 'DeleteTerm';
}

export interface DeleteTermPayload {
  readonly termId: TermId;
  readonly reassignTo?: TermId;
}
