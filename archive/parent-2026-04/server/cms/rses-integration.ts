/**
 * @file rses-integration.ts
 * @description RSES Integration Service for Taxonomy Synchronization
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Key insight: RSES rules define taxonomies/vocabularies through symlink-based
 * classification. This service bridges the RSES rules engine with the CMS
 * taxonomy system.
 *
 * Features:
 * - Syncs RSES classification results to taxonomy terms
 * - Creates vocabulary terms from RSES topics/types
 * - Links symlinks to taxonomy terms for traceability
 * - Auto-classifies content using RSES rules
 */

import { RsesParser, type RsesConfig, deriveAttributesFromPath } from "../lib/rses";
import { storage } from "../storage";
import {
  vocabularyStorage,
  termStorage,
  contentStorage,
  fieldDataStorage,
} from "./storage";
import type { DbTaxonomyVocabulary, DbTaxonomyTerm, DbContent } from "@shared/cms/schema";
import type { RsesSyncResult } from "@shared/cms/types";
import { SymlinkExecutor, getSymlinkExecutor } from "../services/symlink-executor";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("rses-integration");

// =============================================================================
// RSES SYNC SERVICE
// =============================================================================

export interface RsesSyncOptions {
  /** Vocabulary ID to sync */
  vocabularyId: string;
  /** RSES config ID to use (overrides vocabulary default) */
  configId?: number;
  /** Whether this is a dry run (no changes made) */
  dryRun?: boolean;
  /** Base directory for symlink scanning */
  symlinkBasePath?: string;
}

export interface ClassificationResult {
  sets: string[];
  topics: string[];
  types: string[];
  attributes: Record<string, string>;
}

/**
 * Synchronizes RSES classifications with taxonomy vocabulary.
 * Scans symlinks and creates/updates terms based on RSES rules.
 */
export async function syncVocabularyWithRses(
  options: RsesSyncOptions
): Promise<RsesSyncResult> {
  const result: RsesSyncResult = {
    vocabulary: options.vocabularyId,
    termsCreated: 0,
    termsUpdated: 0,
    termsDeleted: 0,
    symlinksProcessed: 0,
    errors: [],
  };

  // Get vocabulary
  const vocabulary = await vocabularyStorage.get(options.vocabularyId);
  if (!vocabulary) {
    throw new Error(`Vocabulary not found: ${options.vocabularyId}`);
  }

  if (!vocabulary.rsesIntegration?.enabled) {
    throw new Error(`RSES integration not enabled for vocabulary: ${options.vocabularyId}`);
  }

  // Get RSES config
  const configId = options.configId ?? vocabulary.rsesIntegration.configId;
  if (!configId) {
    throw new Error("No RSES config specified for sync");
  }

  const config = await storage.getConfig(configId);
  if (!config) {
    throw new Error(`RSES config not found: ${configId}`);
  }

  // Parse RSES config
  const parseResult = RsesParser.parse(config.content);
  if (!parseResult.valid || !parseResult.parsed) {
    throw new Error("Invalid RSES configuration");
  }

  const rsesConfig = parseResult.parsed;
  const category = vocabulary.rsesIntegration.category;

  // Extract unique values from RSES config based on category
  const extractedTerms = extractTermsFromConfig(rsesConfig, category);

  log.info(
    { vocabularyId: options.vocabularyId, category, termCount: extractedTerms.size },
    "Extracted terms from RSES config"
  );

  if (options.dryRun) {
    // In dry run mode, just count what would be created/updated
    const existingTerms = await getExistingTermNames(options.vocabularyId);

    for (const termName of extractedTerms) {
      if (existingTerms.has(termName)) {
        result.termsUpdated++;
      } else {
        result.termsCreated++;
      }
    }

    // Terms that exist but aren't in RSES would be candidates for deletion
    for (const existing of existingTerms) {
      if (!extractedTerms.has(existing)) {
        result.termsDeleted++;
      }
    }

    return result;
  }

  // Actually sync the terms
  const existingTerms = await getExistingTermMap(options.vocabularyId);

  // Create or update terms
  for (const termName of extractedTerms) {
    try {
      const existing = existingTerms.get(termName);

      if (existing) {
        // Update existing term
        await termStorage.update(existing.id, {
          rsesMetadata: {
            ...existing.rsesMetadata,
            sourceRule: category,
          },
        });
        result.termsUpdated++;
      } else {
        // Create new term
        await termStorage.create({
          vocabularyId: options.vocabularyId,
          name: termName,
          description: `Auto-created from RSES ${category} classification`,
          weight: 0,
          parentIds: [],
          rsesMetadata: {
            sourceRule: category,
          },
        });
        result.termsCreated++;
      }
    } catch (err) {
      result.errors.push({
        path: termName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Scan symlinks if base path is provided
  if (options.symlinkBasePath || vocabulary.rsesIntegration.symlinkBasePath) {
    const basePath = options.symlinkBasePath || vocabulary.rsesIntegration.symlinkBasePath!;
    const executor = getSymlinkExecutor();

    if (executor) {
      try {
        const symlinks = await executor.listSymlinks();
        const categoryPath = `by-${category}`;

        for (const symlink of symlinks) {
          if (symlink.category.startsWith(categoryPath)) {
            result.symlinksProcessed++;

            // Extract term name from symlink category
            const termName = symlink.category.replace(`${categoryPath}/`, "").split("/")[0];

            if (termName && extractedTerms.has(termName)) {
              // Link symlink to term
              const term = existingTerms.get(termName) || (await termStorage.getByName(options.vocabularyId, termName));
              if (term) {
                const symlinks = term.rsesMetadata?.symlinks || [];
                if (!symlinks.includes(symlink.link)) {
                  await termStorage.update(term.id, {
                    rsesMetadata: {
                      ...term.rsesMetadata,
                      symlinks: [...symlinks, symlink.link],
                    },
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        log.warn({ err }, "Failed to scan symlinks");
      }
    }
  }

  log.info(
    { vocabularyId: options.vocabularyId, ...result },
    "RSES sync completed"
  );

  return result;
}

/**
 * Extracts term names from RSES config based on category.
 */
function extractTermsFromConfig(config: RsesConfig, category: string): Set<string> {
  const terms = new Set<string>();

  switch (category) {
    case "topic":
      // Extract from topic rules
      for (const rule of config.rules.topic) {
        const result = rule.result.replace(/\$[a-zA-Z_][a-zA-Z0-9_]*/g, "*");
        // Handle nested paths like "quantum/claude" -> "quantum", "quantum/claude"
        const parts = result.split("/");
        for (let i = 0; i < parts.length; i++) {
          terms.add(parts.slice(0, i + 1).join("/"));
        }
      }
      // Also add topic overrides
      for (const value of Object.values(config.overrides.topic)) {
        terms.add(value);
      }
      break;

    case "type":
      // Extract from type rules
      for (const rule of config.rules.type) {
        terms.add(rule.result);
      }
      // Also add type overrides
      for (const value of Object.values(config.overrides.type)) {
        terms.add(value);
      }
      break;

    case "set":
      // Extract set names
      for (const name of Object.keys(config.sets)) {
        terms.add(name);
      }
      // Also add attribute-based sets
      for (const name of Object.keys(config.attributes)) {
        terms.add(name);
      }
      // And compound sets
      for (const name of Object.keys(config.compound)) {
        terms.add(name);
      }
      break;

    default:
      log.warn({ category }, "Unknown RSES category");
  }

  return terms;
}

/**
 * Gets existing term names for a vocabulary.
 */
async function getExistingTermNames(vocabularyId: string): Promise<Set<string>> {
  const terms = await termStorage.getTree(vocabularyId);
  return new Set(terms.map((t) => t.name));
}

/**
 * Gets existing terms as a map for efficient lookup.
 */
async function getExistingTermMap(vocabularyId: string): Promise<Map<string, DbTaxonomyTerm>> {
  const terms = await termStorage.getTree(vocabularyId);
  return new Map(terms.map((t) => [t.name, t]));
}

// =============================================================================
// CONTENT CLASSIFICATION SERVICE
// =============================================================================

export interface ContentClassificationOptions {
  /** Content ID to classify */
  contentId: number;
  /** RSES config ID to use */
  configId?: number;
  /** Whether to update taxonomy terms */
  updateTaxonomy?: boolean;
  /** Whether to create symlinks */
  createSymlinks?: boolean;
  /** Base directory for symlinks */
  symlinkBaseDir?: string;
}

export interface ContentClassificationResult {
  sets: string[];
  topics: string[];
  types: string[];
  termsCreated: number;
  symlinksCreated: number;
}

/**
 * Classifies content using RSES rules and optionally updates taxonomy.
 */
export async function classifyContent(
  options: ContentClassificationOptions
): Promise<ContentClassificationResult> {
  const result: ContentClassificationResult = {
    sets: [],
    topics: [],
    types: [],
    termsCreated: 0,
    symlinksCreated: 0,
  };

  // Get content
  const content = await contentStorage.get(options.contentId);
  if (!content) {
    throw new Error(`Content not found: ${options.contentId}`);
  }

  // Get RSES config
  let configId = options.configId;
  if (!configId) {
    // Try to find default config
    const configs = await storage.getConfigs();
    if (configs.length === 0) {
      throw new Error("No RSES config available");
    }
    configId = configs[0].id;
  }

  const config = await storage.getConfig(configId);
  if (!config) {
    throw new Error(`RSES config not found: ${configId}`);
  }

  // Parse RSES config
  const parseResult = RsesParser.parse(config.content);
  if (!parseResult.valid || !parseResult.parsed) {
    throw new Error("Invalid RSES configuration");
  }

  // Derive attributes from content
  // In a real implementation, this would extract attributes from field values
  const attributes = await deriveContentAttributes(content);

  // Run RSES classification
  const classification = RsesParser.test(parseResult.parsed, content.title, attributes);

  result.sets = classification.sets;
  result.topics = classification.topics;
  result.types = classification.types;

  // Update content with classification
  await contentStorage.update(content.id, {
    rsesClassification: {
      sets: classification.sets,
      topics: classification.topics,
      types: classification.types,
      lastClassified: new Date().toISOString(),
    },
  });

  // Update taxonomy if requested
  if (options.updateTaxonomy) {
    result.termsCreated = await updateTaxonomyFromClassification(content, classification);
  }

  // Create symlinks if requested
  if (options.createSymlinks && options.symlinkBaseDir) {
    result.symlinksCreated = await createSymlinksFromClassification(
      content,
      classification,
      options.symlinkBaseDir
    );
  }

  log.info(
    { contentId: content.id, ...result },
    "Content classified"
  );

  return result;
}

/**
 * Derives attributes from content for RSES classification.
 */
async function deriveContentAttributes(content: DbContent): Promise<Record<string, string>> {
  const attributes: Record<string, string> = {};

  // Get field data for the content
  const fields = await fieldDataStorage.getForEntity("content", content.id);

  // Extract attributes from specific fields
  // This would be configurable in a real implementation
  for (const [fieldName, values] of Object.entries(fields)) {
    if (values.length > 0) {
      const firstValue = values[0].value;
      if (typeof firstValue === "object" && firstValue !== null && "value" in firstValue) {
        attributes[fieldName.replace("field_", "")] = String((firstValue as { value: unknown }).value);
      }
    }
  }

  // Derive from path if alias is set
  if (content.alias) {
    const pathAttributes = deriveAttributesFromPath(content.alias);
    Object.assign(attributes, pathAttributes);
  }

  return attributes;
}

/**
 * Updates taxonomy from classification results.
 */
async function updateTaxonomyFromClassification(
  content: DbContent,
  classification: { topics: string[]; types: string[]; sets: string[] }
): Promise<number> {
  let created = 0;

  // Get RSES-enabled vocabularies
  const vocabularies = await vocabularyStorage.list({ rsesEnabled: true });

  for (const vocab of vocabularies) {
    const category = vocab.rsesIntegration?.category;
    if (!category) continue;

    let terms: string[] = [];
    switch (category) {
      case "topic":
        terms = classification.topics;
        break;
      case "type":
        terms = classification.types;
        break;
      case "set":
        terms = classification.sets;
        break;
    }

    for (const termName of terms) {
      const existing = await termStorage.getByName(vocab.id, termName);
      if (!existing && vocab.rsesIntegration?.autoCreateTerms) {
        await termStorage.create({
          vocabularyId: vocab.id,
          name: termName,
          description: `Auto-created from content classification`,
          weight: 0,
          parentIds: [],
          rsesMetadata: {
            sourceRule: category,
          },
        });
        created++;
      }
    }
  }

  return created;
}

/**
 * Creates symlinks from classification results.
 */
async function createSymlinksFromClassification(
  content: DbContent,
  classification: { topics: string[]; types: string[] },
  baseDir: string
): Promise<number> {
  const executor = getSymlinkExecutor();
  if (!executor) {
    log.warn("Symlink executor not initialized");
    return 0;
  }

  let created = 0;

  // This would need to know the actual content file path
  // For now, we'll use the alias or title as a placeholder
  const contentPath = content.alias || `/content/${content.id}`;

  for (const topic of classification.topics) {
    const result = await executor.createSymlink({
      source: contentPath,
      targetDir: `${baseDir}/by-topic/${topic}`,
      linkName: content.title.toLowerCase().replace(/\s+/g, "-"),
      category: `by-topic/${topic}`,
    });

    if (result.success) created++;
  }

  for (const type of classification.types) {
    const result = await executor.createSymlink({
      source: contentPath,
      targetDir: `${baseDir}/by-type/${type}`,
      linkName: content.title.toLowerCase().replace(/\s+/g, "-"),
      category: `by-type/${type}`,
    });

    if (result.success) created++;
  }

  return created;
}

// =============================================================================
// BULK CLASSIFICATION
// =============================================================================

export interface BulkClassificationOptions {
  contentIds: number[];
  configId?: number;
  updateTaxonomy?: boolean;
}

export interface BulkClassificationResult {
  processed: number;
  termsCreated: number;
  errors: Array<{ id: number; error: string }>;
}

/**
 * Classifies multiple content items.
 */
export async function classifyContentBulk(
  options: BulkClassificationOptions
): Promise<BulkClassificationResult> {
  const result: BulkClassificationResult = {
    processed: 0,
    termsCreated: 0,
    errors: [],
  };

  for (const contentId of options.contentIds) {
    try {
      const classification = await classifyContent({
        contentId,
        configId: options.configId,
        updateTaxonomy: options.updateTaxonomy,
        createSymlinks: false, // Bulk operations don't create symlinks
      });

      result.processed++;
      result.termsCreated += classification.termsCreated;
    } catch (err) {
      result.errors.push({
        id: contentId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info(
    { count: options.contentIds.length, ...result },
    "Bulk classification completed"
  );

  return result;
}

// =============================================================================
// VOCABULARY INITIALIZATION
// =============================================================================

/**
 * Creates default RSES-integrated vocabularies.
 */
export async function initializeRsesVocabularies(): Promise<void> {
  const defaultVocabularies = [
    {
      id: "topics",
      label: "Topics",
      description: "Topic-based classification from RSES rules",
      rsesIntegration: {
        enabled: true,
        category: "topic",
        configId: null,
        autoCreateTerms: true,
        symlinkBasePath: null,
      },
    },
    {
      id: "types",
      label: "Types",
      description: "Type-based classification from RSES rules",
      rsesIntegration: {
        enabled: true,
        category: "type",
        configId: null,
        autoCreateTerms: true,
        symlinkBasePath: null,
      },
    },
    {
      id: "sets",
      label: "Sets",
      description: "Set-based classification from RSES rules",
      rsesIntegration: {
        enabled: true,
        category: "set",
        configId: null,
        autoCreateTerms: true,
        symlinkBasePath: null,
      },
    },
    {
      id: "tags",
      label: "Tags",
      description: "Free-form tags (not RSES-managed)",
      rsesIntegration: {
        enabled: false,
        category: "",
        configId: null,
        autoCreateTerms: false,
        symlinkBasePath: null,
      },
    },
  ];

  for (const vocab of defaultVocabularies) {
    const existing = await vocabularyStorage.get(vocab.id);
    if (!existing) {
      await vocabularyStorage.create({
        ...vocab,
        hierarchy: 0,
        weight: 0,
        module: "rses_cms",
        thirdPartySettings: {},
      });
      log.info({ vocabularyId: vocab.id }, "Created default vocabulary");
    }
  }
}
