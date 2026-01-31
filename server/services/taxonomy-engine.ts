/**
 * @file taxonomy-engine.ts
 * @description RSES-based Taxonomy/Vocabulary Engine for CMS transformation.
 *              Transforms RSES rules into a vocabulary/taxonomy system where:
 *              - RSES rules define vocabularies (by-topic, by-type, etc.)
 *              - Pattern matches create terms automatically
 *              - Symlinks become term references in the CMS
 *              - Content is classified by RSES rules into vocabularies
 *
 * @phase CMS Transformation - Auto-Link Integration
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Architecture Overview:
 * =====================
 *
 * 1. Vocabulary System
 *    - Vocabularies are derived from RSES rule categories (topic, type, filetype)
 *    - Each vocabulary contains terms extracted from rule results
 *    - Hierarchical support via nested rules (e.g., "ai/claude" -> parent: "ai", child: "claude")
 *
 * 2. Term Management
 *    - Terms are auto-created when content matches RSES rules
 *    - Terms track back-references to content items
 *    - Terms can be weighted by match frequency
 *
 * 3. Classification Engine
 *    - Real-time classification as content arrives
 *    - Batch re-classification when rules change
 *    - Incremental updates for performance
 *
 * 4. Symlink Manifestation
 *    - Symlinks are the physical representation of term references
 *    - Creating a symlink "links" content to a term
 *    - Term reference count = symlink count to that term directory
 */

import { EventEmitter } from "events";
import { RsesParser, RsesConfig, TestMatchResponse, deriveAttributesFromPath } from "../lib/rses";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("taxonomy-engine");

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Represents a vocabulary (collection of terms) in the taxonomy.
 * Maps to RSES rule categories: topic, type, filetype.
 */
export interface Vocabulary {
  /** Unique identifier for the vocabulary */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of this vocabulary's purpose */
  description?: string;
  /** Source RSES rule category that generates this vocabulary */
  sourceCategory: "topic" | "type" | "filetype" | "custom";
  /** Terms within this vocabulary */
  terms: Map<string, Term>;
  /** Hierarchical structure metadata */
  hierarchy: VocabularyHierarchy;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Configuration that generated this vocabulary */
  configVersion?: number;
}

/**
 * Represents a term within a vocabulary.
 * Terms are auto-created from RSES rule results.
 */
export interface Term {
  /** Unique identifier (vocabulary-scoped) */
  id: string;
  /** The term value (e.g., "ai", "claude", "tools") */
  value: string;
  /** Human-readable label */
  label: string;
  /** Vocabulary this term belongs to */
  vocabularyId: string;
  /** Parent term ID for hierarchical terms */
  parentId?: string;
  /** Child term IDs */
  childIds: string[];
  /** Content items classified under this term */
  contentRefs: ContentReference[];
  /** Number of content items (for performance) */
  contentCount: number;
  /** Weight/importance score based on usage */
  weight: number;
  /** The RSES rule that created this term */
  sourceRule?: {
    condition: string;
    result: string;
    line: number;
  };
  /** Physical path for symlinks (e.g., "/organized/by-topic/ai") */
  symlinkPath?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last classification timestamp */
  lastClassifiedAt?: Date;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Reference to content classified under a term.
 */
export interface ContentReference {
  /** Content identifier (usually file path) */
  contentId: string;
  /** Human-readable name */
  name: string;
  /** When this content was classified under the term */
  classifiedAt: Date;
  /** Classification confidence (0-1) */
  confidence: number;
  /** Attributes used during classification */
  attributes: Record<string, string>;
  /** Whether a symlink exists for this reference */
  hasSymlink: boolean;
  /** Symlink path if exists */
  symlinkPath?: string;
}

/**
 * Hierarchical structure within a vocabulary.
 */
export interface VocabularyHierarchy {
  /** Whether this vocabulary supports hierarchy */
  enabled: boolean;
  /** Delimiter for hierarchical paths (e.g., "/" for "ai/claude") */
  delimiter: string;
  /** Maximum depth allowed */
  maxDepth: number;
  /** Root term IDs (terms with no parent) */
  roots: string[];
}

/**
 * Content item to be classified.
 */
export interface ContentItem {
  /** Unique identifier (usually absolute path) */
  id: string;
  /** Content name (usually filename or project name) */
  name: string;
  /** Full path to content */
  path: string;
  /** Attributes for classification (derived or manual) */
  attributes: Record<string, string>;
  /** Project markers if applicable */
  markers?: string[];
  /** Last modified time */
  mtime?: Date;
  /** Current classification result */
  classification?: ClassificationResult;
}

/**
 * Result of classifying a content item.
 */
export interface ClassificationResult {
  /** Content item ID */
  contentId: string;
  /** Timestamp of classification */
  timestamp: Date;
  /** Config version used */
  configVersion?: number;
  /** Matched sets from RSES */
  sets: string[];
  /** Term assignments by vocabulary */
  termAssignments: TermAssignment[];
  /** Raw RSES test result */
  rawResult: TestMatchResponse;
  /** Conflicts detected */
  conflicts: ClassificationConflict[];
  /** Whether classification needs human review */
  needsReview: boolean;
}

/**
 * Assignment of content to a term.
 */
export interface TermAssignment {
  /** Vocabulary ID */
  vocabularyId: string;
  /** Term ID within the vocabulary */
  termId: string;
  /** Term value for convenience */
  termValue: string;
  /** Assignment confidence (0-1) */
  confidence: number;
  /** Rule that matched */
  matchedRule?: {
    condition: string;
    result: string;
    line: number;
  };
  /** Whether this was from a pattern or attribute match */
  matchType: "pattern" | "attribute" | "compound" | "override" | "default";
}

/**
 * Conflict when multiple rules match the same content.
 */
export interface ClassificationConflict {
  /** Type of conflict */
  type: "multiple_matches" | "hierarchy_ambiguity" | "priority_tie";
  /** Vocabulary where conflict occurred */
  vocabularyId: string;
  /** Conflicting term assignments */
  conflictingTerms: string[];
  /** Conflicting rules */
  rules: Array<{ condition: string; result: string; line: number }>;
  /** Resolution strategy used */
  resolution: "first_match" | "all_matches" | "highest_priority" | "manual";
  /** The chosen term(s) after resolution */
  resolvedTerms: string[];
}

// ============================================================================
// CLASSIFICATION ENGINE INTERFACES
// ============================================================================

/**
 * Configuration for the classification engine.
 */
export interface ClassificationEngineConfig {
  /** RSES config content (parsed) */
  rsesConfig: RsesConfig;
  /** Config version for tracking */
  configVersion?: number;
  /** Base directory for symlinks */
  symlinkBaseDir: string;
  /** Conflict resolution strategy */
  conflictResolution: ConfigConflictResolutionStrategy;
  /** Enable hierarchy extraction from term values */
  enableHierarchy: boolean;
  /** Hierarchy delimiter */
  hierarchyDelimiter: string;
  /** Batch size for re-classification */
  batchSize: number;
  /** Enable incremental updates */
  incrementalMode: boolean;
}

/**
 * Strategy for resolving classification conflicts.
 */
export type ConflictResolutionStrategy =
  | "first_match"      // Use the first matching rule
  | "all_matches"      // Keep all matches (multi-valued)
  | "highest_priority" // Use rule with lowest line number
  | "most_specific"    // Use the most specific pattern (internal use)
  | "manual";          // Flag for manual resolution

// Type for config that only accepts strategies that can be auto-resolved
export type ConfigConflictResolutionStrategy = Exclude<ConflictResolutionStrategy, "most_specific">;

/**
 * Options for classification operations.
 */
export interface ClassificationOptions {
  /** Force re-classification even if cached */
  force?: boolean;
  /** Include only specific vocabularies */
  vocabularies?: string[];
  /** Additional attributes to merge */
  additionalAttributes?: Record<string, string>;
  /** Dry run - don't create symlinks */
  dryRun?: boolean;
  /** Skip conflict detection */
  skipConflictDetection?: boolean;
}

/**
 * Result of a batch classification operation.
 */
export interface BatchClassificationResult {
  /** Total items processed */
  totalProcessed: number;
  /** Successfully classified */
  successCount: number;
  /** Failed classifications */
  failureCount: number;
  /** Items needing review */
  reviewCount: number;
  /** Duration in milliseconds */
  duration: number;
  /** Individual results */
  results: ClassificationResult[];
  /** Aggregate term counts */
  termCounts: Map<string, number>;
  /** New terms created */
  newTerms: Term[];
  /** Errors encountered */
  errors: Array<{ contentId: string; error: string }>;
}

/**
 * Re-classification plan for when rules change.
 */
export interface ReclassificationPlan {
  /** Plan ID */
  id: string;
  /** Items to re-classify */
  affectedContent: string[];
  /** Vocabularies affected */
  affectedVocabularies: string[];
  /** Estimated duration */
  estimatedDuration: number;
  /** Whether this is incremental or full */
  mode: "incremental" | "full";
  /** Old config version */
  oldConfigVersion?: number;
  /** New config version */
  newConfigVersion?: number;
  /** Changes detected */
  changes: RuleChangeSet;
}

/**
 * Set of changes between config versions.
 */
export interface RuleChangeSet {
  /** Added rules */
  added: Array<{ category: string; condition: string; result: string }>;
  /** Removed rules */
  removed: Array<{ category: string; condition: string; result: string }>;
  /** Modified rules */
  modified: Array<{
    category: string;
    oldCondition: string;
    newCondition: string;
    oldResult: string;
    newResult: string;
  }>;
  /** Added/removed/modified sets */
  setChanges: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}

// ============================================================================
// EVENT INTERFACES
// ============================================================================

/**
 * Events emitted by the taxonomy engine.
 */
export interface TaxonomyEngineEvents {
  /** Content was classified */
  "content:classified": (result: ClassificationResult) => void;
  /** Term was created */
  "term:created": (term: Term) => void;
  /** Term was updated */
  "term:updated": (term: Term) => void;
  /** Term was deleted */
  "term:deleted": (termId: string, vocabularyId: string) => void;
  /** Vocabulary was created */
  "vocabulary:created": (vocabulary: Vocabulary) => void;
  /** Vocabulary was updated */
  "vocabulary:updated": (vocabulary: Vocabulary) => void;
  /** Classification conflict detected */
  "conflict:detected": (conflict: ClassificationConflict) => void;
  /** Re-classification started */
  "reclassification:started": (plan: ReclassificationPlan) => void;
  /** Re-classification progress */
  "reclassification:progress": (processed: number, total: number) => void;
  /** Re-classification completed */
  "reclassification:completed": (result: BatchClassificationResult) => void;
  /** Symlink created for term reference */
  "symlink:created": (termId: string, contentId: string, path: string) => void;
  /** Symlink removed */
  "symlink:removed": (termId: string, contentId: string, path: string) => void;
  /** Error occurred */
  "error": (error: Error, context?: string) => void;
}

// ============================================================================
// API INTERFACES
// ============================================================================

/**
 * API for vocabulary CRUD operations.
 */
export interface VocabularyAPI {
  /** List all vocabularies */
  list(): Promise<Vocabulary[]>;
  /** Get a vocabulary by ID */
  get(id: string): Promise<Vocabulary | null>;
  /** Create a custom vocabulary (non-RSES derived) */
  create(data: CreateVocabularyInput): Promise<Vocabulary>;
  /** Update a vocabulary */
  update(id: string, data: UpdateVocabularyInput): Promise<Vocabulary>;
  /** Delete a vocabulary */
  delete(id: string): Promise<void>;
  /** Get vocabulary with all terms loaded */
  getWithTerms(id: string): Promise<VocabularyWithTerms | null>;
  /** Sync vocabularies from RSES config */
  syncFromConfig(config: RsesConfig): Promise<SyncResult>;
}

export interface CreateVocabularyInput {
  name: string;
  description?: string;
  sourceCategory?: "topic" | "type" | "filetype" | "custom";
  hierarchy?: {
    enabled: boolean;
    delimiter?: string;
    maxDepth?: number;
  };
}

export interface UpdateVocabularyInput {
  name?: string;
  description?: string;
  hierarchy?: Partial<VocabularyHierarchy>;
}

export interface VocabularyWithTerms extends Vocabulary {
  terms: Map<string, Term>;
  termTree: TermTreeNode[];
}

export interface TermTreeNode {
  term: Term;
  children: TermTreeNode[];
}

export interface SyncResult {
  vocabulariesCreated: number;
  vocabulariesUpdated: number;
  termsCreated: number;
  termsUpdated: number;
  termsRemoved: number;
}

/**
 * API for term CRUD operations.
 */
export interface TermAPI {
  /** List terms in a vocabulary */
  list(vocabularyId: string, options?: TermListOptions): Promise<Term[]>;
  /** Get a term by ID */
  get(vocabularyId: string, termId: string): Promise<Term | null>;
  /** Create a term */
  create(vocabularyId: string, data: CreateTermInput): Promise<Term>;
  /** Update a term */
  update(vocabularyId: string, termId: string, data: UpdateTermInput): Promise<Term>;
  /** Delete a term */
  delete(vocabularyId: string, termId: string): Promise<void>;
  /** Get term with content references */
  getWithContent(vocabularyId: string, termId: string): Promise<TermWithContent | null>;
  /** Move term in hierarchy */
  move(vocabularyId: string, termId: string, newParentId: string | null): Promise<Term>;
  /** Merge terms */
  merge(vocabularyId: string, sourceTermId: string, targetTermId: string): Promise<Term>;
  /** Search terms across vocabularies */
  search(query: string, options?: TermSearchOptions): Promise<Term[]>;
}

export interface TermListOptions {
  parentId?: string | null;
  includeChildren?: boolean;
  sortBy?: "value" | "label" | "contentCount" | "createdAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface CreateTermInput {
  value: string;
  label?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTermInput {
  label?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface TermWithContent extends Term {
  content: ContentItem[];
}

export interface TermSearchOptions {
  vocabularyIds?: string[];
  matchType?: "exact" | "prefix" | "contains";
  limit?: number;
}

/**
 * API for content classification operations.
 */
export interface ClassificationAPI {
  /** Classify a single content item */
  classify(content: ContentItem, options?: ClassificationOptions): Promise<ClassificationResult>;
  /** Batch classify multiple content items */
  classifyBatch(contents: ContentItem[], options?: ClassificationOptions): Promise<BatchClassificationResult>;
  /** Get classification for content */
  getClassification(contentId: string): Promise<ClassificationResult | null>;
  /** Re-classify all content under a vocabulary */
  reclassifyVocabulary(vocabularyId: string, options?: ClassificationOptions): Promise<BatchClassificationResult>;
  /** Re-classify all content (full re-classification) */
  reclassifyAll(options?: ClassificationOptions): Promise<BatchClassificationResult>;
  /** Create re-classification plan */
  createReclassificationPlan(newConfig: RsesConfig): Promise<ReclassificationPlan>;
  /** Execute re-classification plan */
  executeReclassificationPlan(planId: string): Promise<BatchClassificationResult>;
  /** Remove classification from content */
  unclassify(contentId: string, vocabularyId?: string): Promise<void>;
}

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

/**
 * Storage interface for taxonomy data.
 * Implementations can use database, file system, or memory.
 */
export interface TaxonomyStorage {
  // Vocabulary operations
  getVocabulary(id: string): Promise<Vocabulary | null>;
  getVocabularies(): Promise<Vocabulary[]>;
  saveVocabulary(vocabulary: Vocabulary): Promise<void>;
  deleteVocabulary(id: string): Promise<void>;

  // Term operations
  getTerm(vocabularyId: string, termId: string): Promise<Term | null>;
  getTerms(vocabularyId: string): Promise<Term[]>;
  getTermByValue(vocabularyId: string, value: string): Promise<Term | null>;
  saveTerm(term: Term): Promise<void>;
  deleteTerm(vocabularyId: string, termId: string): Promise<void>;

  // Content reference operations
  getContentReferences(vocabularyId: string, termId: string): Promise<ContentReference[]>;
  addContentReference(vocabularyId: string, termId: string, ref: ContentReference): Promise<void>;
  removeContentReference(vocabularyId: string, termId: string, contentId: string): Promise<void>;

  // Classification operations
  getClassification(contentId: string): Promise<ClassificationResult | null>;
  saveClassification(result: ClassificationResult): Promise<void>;
  deleteClassification(contentId: string): Promise<void>;

  // Bulk operations
  getContentByTerms(termIds: string[]): Promise<ContentItem[]>;
  getTermsByContent(contentId: string): Promise<Array<{ vocabularyId: string; term: Term }>>;

  // Cleanup
  clear(): Promise<void>;
}

// ============================================================================
// MAIN ENGINE CLASS
// ============================================================================

/**
 * Main taxonomy engine class.
 * Coordinates classification, term management, and symlink creation.
 */
export class TaxonomyEngine extends EventEmitter {
  private config: ClassificationEngineConfig;
  private storage: TaxonomyStorage;
  private vocabularies: Map<string, Vocabulary> = new Map();
  private reclassificationPlans: Map<string, ReclassificationPlan> = new Map();
  private initialized: boolean = false;

  constructor(config: ClassificationEngineConfig, storage: TaxonomyStorage) {
    super();
    this.config = config;
    this.storage = storage;
  }

  /**
   * Initializes the engine by loading/creating vocabularies from RSES config.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn("Engine already initialized");
      return;
    }

    log.info("Initializing taxonomy engine");

    // Create default vocabularies from RSES categories
    await this.syncVocabulariesFromConfig();

    this.initialized = true;
    log.info({ vocabularyCount: this.vocabularies.size }, "Taxonomy engine initialized");
  }

  /**
   * Syncs vocabularies from the current RSES config.
   */
  private async syncVocabulariesFromConfig(): Promise<SyncResult> {
    const result: SyncResult = {
      vocabulariesCreated: 0,
      vocabulariesUpdated: 0,
      termsCreated: 0,
      termsUpdated: 0,
      termsRemoved: 0,
    };

    const categories: Array<"topic" | "type" | "filetype"> = ["topic", "type", "filetype"];

    for (const category of categories) {
      const vocabId = `by-${category}`;
      let vocabulary = await this.storage.getVocabulary(vocabId);

      if (!vocabulary) {
        vocabulary = this.createVocabularyFromCategory(category);
        await this.storage.saveVocabulary(vocabulary);
        this.vocabularies.set(vocabId, vocabulary);
        this.emit("vocabulary:created", vocabulary);
        result.vocabulariesCreated++;
      } else {
        vocabulary.updatedAt = new Date();
        vocabulary.configVersion = this.config.configVersion;
        await this.storage.saveVocabulary(vocabulary);
        this.vocabularies.set(vocabId, vocabulary);
        this.emit("vocabulary:updated", vocabulary);
        result.vocabulariesUpdated++;
      }

      // Extract terms from rules
      const rules = this.config.rsesConfig.rules[category] || [];
      for (const rule of rules) {
        const termResult = await this.getOrCreateTerm(vocabId, rule.result, rule);
        if (termResult.created) {
          result.termsCreated++;
        } else {
          result.termsUpdated++;
        }
      }
    }

    return result;
  }

  /**
   * Creates a vocabulary from an RSES rule category.
   */
  private createVocabularyFromCategory(category: "topic" | "type" | "filetype"): Vocabulary {
    return {
      id: `by-${category}`,
      name: `By ${category.charAt(0).toUpperCase() + category.slice(1)}`,
      description: `Vocabulary for ${category} classification derived from RSES rules`,
      sourceCategory: category,
      terms: new Map(),
      hierarchy: {
        enabled: this.config.enableHierarchy,
        delimiter: this.config.hierarchyDelimiter,
        maxDepth: 5,
        roots: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      configVersion: this.config.configVersion,
    };
  }

  /**
   * Gets or creates a term within a vocabulary.
   */
  private async getOrCreateTerm(
    vocabularyId: string,
    termValue: string,
    sourceRule?: { condition: string; result: string; line: number }
  ): Promise<{ term: Term; created: boolean }> {
    // Parse hierarchical terms (e.g., "ai/claude" -> parent: "ai", child: "claude")
    const parts = this.config.enableHierarchy
      ? termValue.split(this.config.hierarchyDelimiter)
      : [termValue];

    let parentId: string | undefined;
    let term: Term | null = null;
    let created = false;

    // Create parent terms if hierarchical
    for (let i = 0; i < parts.length; i++) {
      const partValue = parts.slice(0, i + 1).join(this.config.hierarchyDelimiter);
      const isLeaf = i === parts.length - 1;

      term = await this.storage.getTermByValue(vocabularyId, partValue);

      if (!term) {
        term = {
          id: this.generateTermId(vocabularyId, partValue),
          value: partValue,
          label: parts[i],
          vocabularyId,
          parentId,
          childIds: [],
          contentRefs: [],
          contentCount: 0,
          weight: 0,
          sourceRule: isLeaf ? sourceRule : undefined,
          symlinkPath: `${this.config.symlinkBaseDir}/${vocabularyId}/${partValue}`,
          createdAt: new Date(),
          metadata: {},
        };

        await this.storage.saveTerm(term);

        // Update parent's childIds
        if (parentId) {
          const parent = await this.storage.getTerm(vocabularyId, parentId);
          if (parent && !parent.childIds.includes(term.id)) {
            parent.childIds.push(term.id);
            await this.storage.saveTerm(parent);
          }
        } else {
          // This is a root term
          const vocab = this.vocabularies.get(vocabularyId);
          if (vocab && !vocab.hierarchy.roots.includes(term.id)) {
            vocab.hierarchy.roots.push(term.id);
          }
        }

        this.emit("term:created", term);
        created = true;
      }

      parentId = term.id;
    }

    return { term: term!, created };
  }

  /**
   * Generates a unique term ID.
   */
  private generateTermId(vocabularyId: string, value: string): string {
    // Create a deterministic ID from vocabulary and value
    return `${vocabularyId}:${value.replace(/[^a-zA-Z0-9-_]/g, "_")}`;
  }

  /**
   * Classifies a content item against the RSES rules.
   */
  async classify(content: ContentItem, options: ClassificationOptions = {}): Promise<ClassificationResult> {
    const startTime = Date.now();

    // Merge attributes
    const attributes = {
      ...deriveAttributesFromPath(content.path),
      ...content.attributes,
      ...options.additionalAttributes,
    };

    // Run RSES classification
    const rawResult = RsesParser.test(this.config.rsesConfig, content.name, attributes);

    // Build term assignments
    const termAssignments: TermAssignment[] = [];
    const conflicts: ClassificationConflict[] = [];

    // Process topics
    const topicConflict = await this.processClassificationCategory(
      "by-topic",
      rawResult.topics,
      termAssignments,
      options
    );
    if (topicConflict) conflicts.push(topicConflict);

    // Process types
    const typeConflict = await this.processClassificationCategory(
      "by-type",
      rawResult.types,
      termAssignments,
      options
    );
    if (typeConflict) conflicts.push(typeConflict);

    // Process filetypes
    const filetypeConflict = await this.processClassificationCategory(
      "by-filetype",
      rawResult.filetypes,
      termAssignments,
      options
    );
    if (filetypeConflict) conflicts.push(filetypeConflict);

    const result: ClassificationResult = {
      contentId: content.id,
      timestamp: new Date(),
      configVersion: this.config.configVersion,
      sets: rawResult.sets,
      termAssignments,
      rawResult,
      conflicts,
      needsReview: conflicts.length > 0 && this.config.conflictResolution === "manual",
    };

    // Save classification
    await this.storage.saveClassification(result);

    // Update term references
    if (!options.dryRun) {
      await this.updateTermReferences(content, result, attributes);
    }

    this.emit("content:classified", result);

    log.debug(
      { contentId: content.id, duration: Date.now() - startTime, termCount: termAssignments.length },
      "Content classified"
    );

    return result;
  }

  /**
   * Processes a classification category (topic/type/filetype).
   */
  private async processClassificationCategory(
    vocabularyId: string,
    values: string[],
    assignments: TermAssignment[],
    options: ClassificationOptions
  ): Promise<ClassificationConflict | null> {
    if (options.vocabularies && !options.vocabularies.includes(vocabularyId)) {
      return null;
    }

    let conflict: ClassificationConflict | null = null;

    // Detect conflicts
    if (values.length > 1 && !options.skipConflictDetection) {
      conflict = {
        type: "multiple_matches",
        vocabularyId,
        conflictingTerms: values,
        rules: [], // Would need to track which rules matched
        resolution: this.config.conflictResolution,
        resolvedTerms: this.resolveConflict(values),
      };
      this.emit("conflict:detected", conflict);
    }

    // Apply resolution
    const resolvedValues = conflict ? conflict.resolvedTerms : values;

    for (const value of resolvedValues) {
      const { term } = await this.getOrCreateTerm(vocabularyId, value);

      assignments.push({
        vocabularyId,
        termId: term.id,
        termValue: term.value,
        confidence: conflict ? 0.7 : 1.0, // Lower confidence if conflicted
        matchType: "pattern", // Default; could be refined
      });
    }

    return conflict;
  }

  /**
   * Resolves classification conflicts based on strategy.
   */
  private resolveConflict(values: string[]): string[] {
    switch (this.config.conflictResolution) {
      case "first_match":
        return values.slice(0, 1);
      case "all_matches":
        return values;
      case "highest_priority":
        return values.slice(0, 1); // Assuming sorted by priority
      case "most_specific":
        // Choose the longest/most specific value
        return [values.reduce((a, b) => (a.length > b.length ? a : b))];
      case "manual":
        return values; // Keep all for review
      default:
        return values.slice(0, 1);
    }
  }

  /**
   * Updates term references after classification.
   */
  private async updateTermReferences(
    content: ContentItem,
    result: ClassificationResult,
    attributes: Record<string, string>
  ): Promise<void> {
    // Get existing term assignments to detect changes
    const existing = await this.storage.getTermsByContent(content.id);
    const existingTermIds = new Set(existing.map((e) => `${e.vocabularyId}:${e.term.id}`));
    const newTermIds = new Set(result.termAssignments.map((a) => `${a.vocabularyId}:${a.termId}`));

    // Remove old references
    for (const { vocabularyId, term } of existing) {
      const key = `${vocabularyId}:${term.id}`;
      if (!newTermIds.has(key)) {
        await this.storage.removeContentReference(vocabularyId, term.id, content.id);

        // Update term counts
        const updatedTerm = await this.storage.getTerm(vocabularyId, term.id);
        if (updatedTerm) {
          updatedTerm.contentCount = Math.max(0, updatedTerm.contentCount - 1);
          await this.storage.saveTerm(updatedTerm);
        }
      }
    }

    // Add new references
    for (const assignment of result.termAssignments) {
      const key = `${assignment.vocabularyId}:${assignment.termId}`;
      if (!existingTermIds.has(key)) {
        const ref: ContentReference = {
          contentId: content.id,
          name: content.name,
          classifiedAt: new Date(),
          confidence: assignment.confidence,
          attributes,
          hasSymlink: false, // Will be updated when symlink is created
        };

        await this.storage.addContentReference(assignment.vocabularyId, assignment.termId, ref);

        // Update term counts
        const term = await this.storage.getTerm(assignment.vocabularyId, assignment.termId);
        if (term) {
          term.contentCount++;
          term.lastClassifiedAt = new Date();
          term.weight = this.calculateTermWeight(term);
          await this.storage.saveTerm(term);
          this.emit("term:updated", term);
        }
      }
    }
  }

  /**
   * Calculates term weight based on usage patterns.
   */
  private calculateTermWeight(term: Term): number {
    // Simple weight calculation based on content count
    // Could be extended with time decay, hierarchy position, etc.
    return Math.log10(term.contentCount + 1) * 10;
  }

  /**
   * Batch classifies multiple content items.
   */
  async classifyBatch(
    contents: ContentItem[],
    options: ClassificationOptions = {}
  ): Promise<BatchClassificationResult> {
    const startTime = Date.now();
    const results: ClassificationResult[] = [];
    const errors: Array<{ contentId: string; error: string }> = [];
    const termCounts = new Map<string, number>();
    const newTerms: Term[] = [];

    let successCount = 0;
    let failureCount = 0;
    let reviewCount = 0;

    for (let i = 0; i < contents.length; i += this.config.batchSize) {
      const batch = contents.slice(i, i + this.config.batchSize);

      for (const content of batch) {
        try {
          const result = await this.classify(content, options);
          results.push(result);
          successCount++;

          if (result.needsReview) {
            reviewCount++;
          }

          // Track term counts
          for (const assignment of result.termAssignments) {
            const key = `${assignment.vocabularyId}:${assignment.termId}`;
            termCounts.set(key, (termCounts.get(key) || 0) + 1);
          }
        } catch (error) {
          failureCount++;
          errors.push({
            contentId: content.id,
            error: error instanceof Error ? error.message : String(error),
          });
          this.emit("error", error instanceof Error ? error : new Error(String(error)), content.id);
        }
      }

      // Emit progress
      this.emit("reclassification:progress", i + batch.length, contents.length);
    }

    const result: BatchClassificationResult = {
      totalProcessed: contents.length,
      successCount,
      failureCount,
      reviewCount,
      duration: Date.now() - startTime,
      results,
      termCounts,
      newTerms,
      errors,
    };

    log.info(
      { total: contents.length, success: successCount, failed: failureCount, duration: result.duration },
      "Batch classification completed"
    );

    return result;
  }

  /**
   * Creates a re-classification plan by comparing configs.
   */
  async createReclassificationPlan(newConfig: RsesConfig): Promise<ReclassificationPlan> {
    const changes = this.detectConfigChanges(this.config.rsesConfig, newConfig);

    // Determine affected content
    const affectedVocabularies: string[] = [];
    const affectedContent: string[] = [];

    if (changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0) {
      // Get all categories affected
      const categories = new Set<string>();
      [...changes.added, ...changes.removed, ...changes.modified].forEach((change) => {
        categories.add(`by-${(change as any).category || "topic"}`);
      });
      affectedVocabularies.push(...categories);

      // Get all content under affected vocabularies
      for (const vocabId of affectedVocabularies) {
        const terms = await this.storage.getTerms(vocabId);
        for (const term of terms) {
          const refs = await this.storage.getContentReferences(vocabId, term.id);
          affectedContent.push(...refs.map((r) => r.contentId));
        }
      }
    }

    const plan: ReclassificationPlan = {
      id: `plan-${Date.now()}`,
      affectedContent: [...new Set(affectedContent)],
      affectedVocabularies,
      estimatedDuration: affectedContent.length * 10, // ~10ms per item estimate
      mode: affectedContent.length > 1000 ? "full" : "incremental",
      oldConfigVersion: this.config.configVersion,
      newConfigVersion: (this.config.configVersion || 0) + 1,
      changes,
    };

    this.reclassificationPlans.set(plan.id, plan);
    return plan;
  }

  /**
   * Detects changes between two RSES configs.
   */
  private detectConfigChanges(oldConfig: RsesConfig, newConfig: RsesConfig): RuleChangeSet {
    const changes: RuleChangeSet = {
      added: [],
      removed: [],
      modified: [],
      setChanges: {
        added: [],
        removed: [],
        modified: [],
      },
    };

    // Compare rules for each category
    const categories: Array<"topic" | "type" | "filetype"> = ["topic", "type", "filetype"];

    for (const category of categories) {
      const oldRules = oldConfig.rules[category] || [];
      const newRules = newConfig.rules[category] || [];

      const oldRuleMap = new Map(oldRules.map((r) => [`${r.condition}->${r.result}`, r]));
      const newRuleMap = new Map(newRules.map((r) => [`${r.condition}->${r.result}`, r]));

      // Find added rules
      for (const [key, rule] of newRuleMap) {
        if (!oldRuleMap.has(key)) {
          changes.added.push({ category, condition: rule.condition, result: rule.result });
        }
      }

      // Find removed rules
      for (const [key, rule] of oldRuleMap) {
        if (!newRuleMap.has(key)) {
          changes.removed.push({ category, condition: rule.condition, result: rule.result });
        }
      }
    }

    // Compare sets
    const oldSets = new Set(Object.keys(oldConfig.sets));
    const newSets = new Set(Object.keys(newConfig.sets));

    for (const name of newSets) {
      if (!oldSets.has(name)) {
        changes.setChanges.added.push(name);
      } else if (oldConfig.sets[name] !== newConfig.sets[name]) {
        changes.setChanges.modified.push(name);
      }
    }

    for (const name of oldSets) {
      if (!newSets.has(name)) {
        changes.setChanges.removed.push(name);
      }
    }

    return changes;
  }

  /**
   * Executes a re-classification plan.
   */
  async executeReclassificationPlan(planId: string): Promise<BatchClassificationResult> {
    const plan = this.reclassificationPlans.get(planId);
    if (!plan) {
      throw new Error(`Re-classification plan not found: ${planId}`);
    }

    this.emit("reclassification:started", plan);

    // Load content items
    const contents = await this.storage.getContentByTerms(plan.affectedContent);

    const result = await this.classifyBatch(contents, { force: true });

    this.emit("reclassification:completed", result);
    this.reclassificationPlans.delete(planId);

    return result;
  }

  /**
   * Gets the current RSES config.
   */
  getConfig(): ClassificationEngineConfig {
    return this.config;
  }

  /**
   * Updates the RSES config and triggers re-classification if needed.
   */
  async updateConfig(newRsesConfig: RsesConfig, autoReclassify: boolean = false): Promise<ReclassificationPlan | null> {
    const plan = await this.createReclassificationPlan(newRsesConfig);

    // Update config
    this.config = {
      ...this.config,
      rsesConfig: newRsesConfig,
      configVersion: plan.newConfigVersion,
    };

    // Re-sync vocabularies
    await this.syncVocabulariesFromConfig();

    if (autoReclassify && plan.affectedContent.length > 0) {
      await this.executeReclassificationPlan(plan.id);
    }

    return plan;
  }

  /**
   * Gets all vocabularies.
   */
  getVocabularies(): Map<string, Vocabulary> {
    return new Map(this.vocabularies);
  }

  /**
   * Gets a specific vocabulary.
   */
  async getVocabulary(id: string): Promise<Vocabulary | null> {
    return this.vocabularies.get(id) || await this.storage.getVocabulary(id);
  }

  /**
   * Gets terms for a vocabulary.
   */
  async getTerms(vocabularyId: string): Promise<Term[]> {
    return this.storage.getTerms(vocabularyId);
  }

  /**
   * Gets a specific term.
   */
  async getTerm(vocabularyId: string, termId: string): Promise<Term | null> {
    return this.storage.getTerm(vocabularyId, termId);
  }

  /**
   * Checks if the engine is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Shuts down the engine.
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
    this.vocabularies.clear();
    this.reclassificationPlans.clear();
    log.info("Taxonomy engine shut down");
  }
}

// ============================================================================
// IN-MEMORY STORAGE IMPLEMENTATION
// ============================================================================

/**
 * In-memory implementation of TaxonomyStorage for development/testing.
 */
export class InMemoryTaxonomyStorage implements TaxonomyStorage {
  private vocabularies: Map<string, Vocabulary> = new Map();
  private terms: Map<string, Map<string, Term>> = new Map();
  private contentRefs: Map<string, Map<string, ContentReference[]>> = new Map();
  private classifications: Map<string, ClassificationResult> = new Map();

  async getVocabulary(id: string): Promise<Vocabulary | null> {
    return this.vocabularies.get(id) || null;
  }

  async getVocabularies(): Promise<Vocabulary[]> {
    return Array.from(this.vocabularies.values());
  }

  async saveVocabulary(vocabulary: Vocabulary): Promise<void> {
    this.vocabularies.set(vocabulary.id, vocabulary);
    if (!this.terms.has(vocabulary.id)) {
      this.terms.set(vocabulary.id, new Map());
    }
    if (!this.contentRefs.has(vocabulary.id)) {
      this.contentRefs.set(vocabulary.id, new Map());
    }
  }

  async deleteVocabulary(id: string): Promise<void> {
    this.vocabularies.delete(id);
    this.terms.delete(id);
    this.contentRefs.delete(id);
  }

  async getTerm(vocabularyId: string, termId: string): Promise<Term | null> {
    return this.terms.get(vocabularyId)?.get(termId) || null;
  }

  async getTerms(vocabularyId: string): Promise<Term[]> {
    const vocabTerms = this.terms.get(vocabularyId);
    return vocabTerms ? Array.from(vocabTerms.values()) : [];
  }

  async getTermByValue(vocabularyId: string, value: string): Promise<Term | null> {
    const vocabTerms = this.terms.get(vocabularyId);
    if (!vocabTerms) return null;
    for (const term of vocabTerms.values()) {
      if (term.value === value) return term;
    }
    return null;
  }

  async saveTerm(term: Term): Promise<void> {
    let vocabTerms = this.terms.get(term.vocabularyId);
    if (!vocabTerms) {
      vocabTerms = new Map();
      this.terms.set(term.vocabularyId, vocabTerms);
    }
    vocabTerms.set(term.id, term);
  }

  async deleteTerm(vocabularyId: string, termId: string): Promise<void> {
    this.terms.get(vocabularyId)?.delete(termId);
    this.contentRefs.get(vocabularyId)?.delete(termId);
  }

  async getContentReferences(vocabularyId: string, termId: string): Promise<ContentReference[]> {
    return this.contentRefs.get(vocabularyId)?.get(termId) || [];
  }

  async addContentReference(vocabularyId: string, termId: string, ref: ContentReference): Promise<void> {
    let vocabRefs = this.contentRefs.get(vocabularyId);
    if (!vocabRefs) {
      vocabRefs = new Map();
      this.contentRefs.set(vocabularyId, vocabRefs);
    }
    let termRefs = vocabRefs.get(termId);
    if (!termRefs) {
      termRefs = [];
      vocabRefs.set(termId, termRefs);
    }
    // Avoid duplicates
    if (!termRefs.some((r) => r.contentId === ref.contentId)) {
      termRefs.push(ref);
    }
  }

  async removeContentReference(vocabularyId: string, termId: string, contentId: string): Promise<void> {
    const termRefs = this.contentRefs.get(vocabularyId)?.get(termId);
    if (termRefs) {
      const index = termRefs.findIndex((r) => r.contentId === contentId);
      if (index !== -1) {
        termRefs.splice(index, 1);
      }
    }
  }

  async getClassification(contentId: string): Promise<ClassificationResult | null> {
    return this.classifications.get(contentId) || null;
  }

  async saveClassification(result: ClassificationResult): Promise<void> {
    this.classifications.set(result.contentId, result);
  }

  async deleteClassification(contentId: string): Promise<void> {
    this.classifications.delete(contentId);
  }

  async getContentByTerms(termIds: string[]): Promise<ContentItem[]> {
    const contentIds = new Set<string>();
    for (const vocabRefs of this.contentRefs.values()) {
      for (const [termId, refs] of vocabRefs) {
        if (termIds.includes(termId)) {
          refs.forEach((r) => contentIds.add(r.contentId));
        }
      }
    }
    // Return placeholder content items (would need actual content in real impl)
    return Array.from(contentIds).map((id) => ({
      id,
      name: id.split("/").pop() || id,
      path: id,
      attributes: {},
    }));
  }

  async getTermsByContent(contentId: string): Promise<Array<{ vocabularyId: string; term: Term }>> {
    const results: Array<{ vocabularyId: string; term: Term }> = [];
    for (const [vocabularyId, vocabRefs] of this.contentRefs) {
      for (const [termId, refs] of vocabRefs) {
        if (refs.some((r) => r.contentId === contentId)) {
          const term = await this.getTerm(vocabularyId, termId);
          if (term) {
            results.push({ vocabularyId, term });
          }
        }
      }
    }
    return results;
  }

  async clear(): Promise<void> {
    this.vocabularies.clear();
    this.terms.clear();
    this.contentRefs.clear();
    this.classifications.clear();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a taxonomy engine with default configuration.
 */
export function createTaxonomyEngine(
  rsesConfig: RsesConfig,
  options: Partial<ClassificationEngineConfig> = {}
): TaxonomyEngine {
  const config: ClassificationEngineConfig = {
    rsesConfig,
    configVersion: 1,
    symlinkBaseDir: options.symlinkBaseDir || "/organized",
    conflictResolution: options.conflictResolution || "all_matches",
    enableHierarchy: options.enableHierarchy ?? true,
    hierarchyDelimiter: options.hierarchyDelimiter || "/",
    batchSize: options.batchSize || 100,
    incrementalMode: options.incrementalMode ?? true,
    ...options,
  };

  const storage = new InMemoryTaxonomyStorage();
  return new TaxonomyEngine(config, storage);
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let taxonomyEngineInstance: TaxonomyEngine | null = null;

/**
 * Gets the singleton taxonomy engine instance.
 */
export function getTaxonomyEngine(): TaxonomyEngine | null {
  return taxonomyEngineInstance;
}

/**
 * Initializes the singleton taxonomy engine.
 */
export async function initTaxonomyEngine(
  rsesConfig: RsesConfig,
  options: Partial<ClassificationEngineConfig> = {}
): Promise<TaxonomyEngine> {
  if (taxonomyEngineInstance) {
    await taxonomyEngineInstance.shutdown();
  }

  taxonomyEngineInstance = createTaxonomyEngine(rsesConfig, options);
  await taxonomyEngineInstance.initialize();
  return taxonomyEngineInstance;
}

/**
 * Shuts down the singleton taxonomy engine.
 */
export async function shutdownTaxonomyEngine(): Promise<void> {
  if (taxonomyEngineInstance) {
    await taxonomyEngineInstance.shutdown();
    taxonomyEngineInstance = null;
  }
}
