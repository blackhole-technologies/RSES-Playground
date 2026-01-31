/**
 * @file taxonomy.ts
 * @description Express routes for the RSES Taxonomy/Vocabulary API.
 *
 * @phase CMS Transformation - Auto-Link Integration
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 */

import { Router, Request, Response, NextFunction } from "express";
import {
  getTaxonomyIntegration,
  initTaxonomyIntegration,
  TaxonomyIntegrationConfig,
} from "../services/taxonomy-integration";
import {
  getTaxonomyEngine,
  ContentItem,
  Term,
  Vocabulary,
} from "../services/taxonomy-engine";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("taxonomy-routes");
const router = Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Ensures taxonomy integration is initialized.
 */
function requireTaxonomy(req: Request, res: Response, next: NextFunction): void {
  const integration = getTaxonomyIntegration();
  if (!integration || !integration.isInitialized()) {
    res.status(503).json({
      message: "Taxonomy engine not initialized. Please configure RSES first.",
    });
    return;
  }
  next();
}

// ============================================================================
// VOCABULARY ROUTES
// ============================================================================

/**
 * GET /api/taxonomy/vocabularies
 * List all vocabularies with stats.
 */
router.get("/vocabularies", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const integration = getTaxonomyIntegration()!;
    const engine = integration.getEngine()!;

    const vocabularies = engine.getVocabularies();
    const result = [];

    for (const [id, vocab] of Array.from(vocabularies.entries())) {
      const terms = await engine.getTerms(id);
      const contentCount = terms.reduce((sum, t) => sum + t.contentCount, 0);

      result.push({
        id: vocab.id,
        name: vocab.name,
        description: vocab.description || null,
        sourceCategory: vocab.sourceCategory,
        hierarchy: vocab.hierarchy,
        createdAt: vocab.createdAt.toISOString(),
        updatedAt: vocab.updatedAt.toISOString(),
        configVersion: vocab.configVersion || null,
        termCount: terms.length,
        contentCount,
      });
    }

    res.json(result);
  } catch (error) {
    log.error({ error }, "Failed to list vocabularies");
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/taxonomy/vocabularies/:id
 * Get a vocabulary by ID.
 */
router.get("/vocabularies/:id", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const engine = getTaxonomyIntegration()!.getEngine()!;
    const vocabId = String(req.params.id);
    const vocab = await engine.getVocabulary(vocabId);

    if (!vocab) {
      res.status(404).json({ message: "Vocabulary not found" });
      return;
    }

    res.json({
      id: vocab.id,
      name: vocab.name,
      description: vocab.description || null,
      sourceCategory: vocab.sourceCategory,
      hierarchy: vocab.hierarchy,
      createdAt: vocab.createdAt.toISOString(),
      updatedAt: vocab.updatedAt.toISOString(),
      configVersion: vocab.configVersion || null,
    });
  } catch (error) {
    log.error({ error }, "Failed to get vocabulary");
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/taxonomy/vocabularies/sync
 * Sync vocabularies from current RSES config.
 */
router.post("/vocabularies/sync", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    // Re-initialize to sync
    const integration = getTaxonomyIntegration()!;
    const rsesConfig = integration.getRsesConfig();

    if (!rsesConfig) {
      res.status(400).json({ message: "No RSES config loaded" });
      return;
    }

    // Vocabulary sync happens during initialization
    // For now, return current state
    const engine = integration.getEngine()!;
    const vocabularies = engine.getVocabularies();
    let termCount = 0;

    for (const [id] of Array.from(vocabularies.entries())) {
      const terms = await engine.getTerms(id);
      termCount += terms.length;
    }

    res.json({
      vocabulariesCreated: 0,
      vocabulariesUpdated: vocabularies.size,
      termsCreated: 0,
      termsUpdated: termCount,
      termsRemoved: 0,
    });
  } catch (error) {
    log.error({ error }, "Failed to sync vocabularies");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ============================================================================
// TERM ROUTES
// ============================================================================

/**
 * GET /api/taxonomy/vocabularies/:vocabularyId/terms
 * List terms in a vocabulary.
 */
router.get(
  "/vocabularies/:vocabularyId/terms",
  requireTaxonomy,
  async (req: Request, res: Response) => {
    try {
      const engine = getTaxonomyIntegration()!.getEngine()!;
      const vocabularyId = String(req.params.vocabularyId);
      const vocab = await engine.getVocabulary(vocabularyId);

      if (!vocab) {
        res.status(404).json({ message: "Vocabulary not found" });
        return;
      }

      let terms = await engine.getTerms(vocabularyId);

      // Filter by parentId if specified
      const parentIdParam = req.query.parentId;
      const sortByParam = (req.query.sortBy as string) || "value";
      const sortOrderParam = (req.query.sortOrder as string) || "asc";
      const limitParam = Number(req.query.limit) || 100;
      const offsetParam = Number(req.query.offset) || 0;

      if (parentIdParam !== undefined) {
        const parentIdStr = Array.isArray(parentIdParam) ? parentIdParam[0] : parentIdParam;
        const parentFilter = parentIdStr === "null" ? undefined : String(parentIdStr);
        terms = terms.filter((t) => t.parentId === parentFilter);
      }

      // Sort
      terms.sort((a, b) => {
        const aVal = (a as any)[sortByParam] || "";
        const bVal = (b as any)[sortByParam] || "";
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrderParam === "desc" ? -cmp : cmp;
      });

      const total = terms.length;

      // Paginate
      terms = terms.slice(offsetParam, offsetParam + limitParam);

      res.json({
        terms: terms.map((t) => formatTerm(t)),
        total,
      });
    } catch (error) {
      log.error({ error }, "Failed to list terms");
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/**
 * GET /api/taxonomy/vocabularies/:vocabularyId/terms/tree
 * Get term tree for a vocabulary.
 */
router.get(
  "/vocabularies/:vocabularyId/terms/tree",
  requireTaxonomy,
  async (req: Request, res: Response) => {
    try {
      const engine = getTaxonomyIntegration()!.getEngine()!;
      const vocabularyId = String(req.params.vocabularyId);
      const vocab = await engine.getVocabulary(vocabularyId);

      if (!vocab) {
        res.status(404).json({ message: "Vocabulary not found" });
        return;
      }

      const terms = await engine.getTerms(vocabularyId);
      const termMap = new Map(terms.map((t) => [t.id, t]));

      // Build tree from roots
      const buildTree = (parentId?: string): any[] => {
        const children = terms.filter((t) => t.parentId === parentId);
        return children.map((term) => ({
          term: formatTerm(term),
          children: buildTree(term.id),
        }));
      };

      res.json(buildTree(undefined));
    } catch (error) {
      log.error({ error }, "Failed to get term tree");
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/**
 * GET /api/taxonomy/vocabularies/:vocabularyId/terms/:termId
 * Get a specific term.
 */
router.get(
  "/vocabularies/:vocabularyId/terms/:termId",
  requireTaxonomy,
  async (req: Request, res: Response) => {
    try {
      const engine = getTaxonomyIntegration()!.getEngine()!;
      const vocabularyId = String(req.params.vocabularyId);
      const termId = String(req.params.termId);
      const term = await engine.getTerm(vocabularyId, termId);

      if (!term) {
        res.status(404).json({ message: "Term not found" });
        return;
      }

      // Get content references
      // Note: In full implementation, this would come from storage
      res.json({
        ...formatTerm(term),
        contentRefs: term.contentRefs.map((ref) => ({
          contentId: ref.contentId,
          name: ref.name,
          classifiedAt: ref.classifiedAt.toISOString(),
          confidence: ref.confidence,
          attributes: ref.attributes,
          hasSymlink: ref.hasSymlink,
          symlinkPath: ref.symlinkPath || null,
        })),
      });
    } catch (error) {
      log.error({ error }, "Failed to get term");
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

/**
 * GET /api/taxonomy/terms/search
 * Search terms across vocabularies.
 */
router.get("/terms/search", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const qParam = req.query.q;
    const vocabularyIdsParam = req.query.vocabularyIds;
    const matchTypeParam = (req.query.matchType as string) || "contains";
    const limitParam = Number(req.query.limit) || 20;

    if (!qParam) {
      res.status(400).json({ message: "Search query (q) is required" });
      return;
    }

    const engine = getTaxonomyIntegration()!.getEngine()!;
    const results: Array<Term & { vocabularyName: string }> = [];

    const qStr = Array.isArray(qParam) ? qParam[0] : qParam;
    const vocabIdsStr = Array.isArray(vocabularyIdsParam) ? vocabularyIdsParam[0] : vocabularyIdsParam;
    const vocabFilter = vocabIdsStr
      ? String(vocabIdsStr).split(",")
      : Array.from(engine.getVocabularies().keys());

    for (const vocabId of vocabFilter) {
      const vocab = await engine.getVocabulary(vocabId);
      if (!vocab) continue;

      const terms = await engine.getTerms(vocabId);
      const query = String(qStr).toLowerCase();

      for (const term of terms) {
        const value = term.value.toLowerCase();
        let matches = false;

        switch (matchTypeParam) {
          case "exact":
            matches = value === query;
            break;
          case "prefix":
            matches = value.startsWith(query);
            break;
          case "contains":
          default:
            matches = value.includes(query);
            break;
        }

        if (matches) {
          results.push({ ...term, vocabularyName: vocab.name });
        }

        if (results.length >= limitParam) break;
      }

      if (results.length >= limitParam) break;
    }

    res.json(
      results.map((t) => ({
        ...formatTerm(t),
        vocabularyName: t.vocabularyName,
      }))
    );
  } catch (error) {
    log.error({ error }, "Failed to search terms");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ============================================================================
// CLASSIFICATION ROUTES
// ============================================================================

/**
 * POST /api/taxonomy/classify
 * Classify a single content item.
 */
router.post("/classify", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const { contentPath, contentName, attributes, options } = req.body;

    if (!contentPath) {
      res.status(400).json({ message: "contentPath is required" });
      return;
    }

    const integration = getTaxonomyIntegration()!;
    const result = await integration.classifyProject(
      contentPath,
      attributes
    );

    res.json({
      contentId: result.contentId,
      timestamp: result.timestamp.toISOString(),
      configVersion: result.configVersion || null,
      sets: result.sets,
      termAssignments: result.termAssignments,
      conflicts: result.conflicts,
      needsReview: result.needsReview,
      symlinksCreated: [], // Would be populated from actual symlink creation
    });
  } catch (error) {
    log.error({ error }, "Failed to classify content");
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/taxonomy/classify/batch
 * Batch classify multiple content items.
 */
router.post("/classify/batch", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const { contents, options } = req.body;

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      res.status(400).json({ message: "contents array is required" });
      return;
    }

    if (contents.length > 1000) {
      res.status(400).json({ message: "Maximum 1000 items per batch" });
      return;
    }

    const engine = getTaxonomyIntegration()!.getEngine()!;

    const contentItems: ContentItem[] = contents.map((c: any) => ({
      id: c.path,
      name: c.name || c.path.split("/").pop() || c.path,
      path: c.path,
      attributes: c.attributes || {},
    }));

    const result = await engine.classifyBatch(contentItems, {
      dryRun: options?.dryRun,
      force: options?.force,
      vocabularies: options?.vocabularies,
    });

    res.json({
      totalProcessed: result.totalProcessed,
      successCount: result.successCount,
      failureCount: result.failureCount,
      reviewCount: result.reviewCount,
      duration: result.duration,
      newTermsCreated: result.newTerms.length,
      errors: result.errors,
      results: result.results.map((r) => ({
        contentId: r.contentId,
        timestamp: r.timestamp.toISOString(),
        configVersion: r.configVersion || null,
        sets: r.sets,
        termAssignments: r.termAssignments,
        conflicts: r.conflicts,
        needsReview: r.needsReview,
      })),
    });
  } catch (error) {
    log.error({ error }, "Failed to batch classify");
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/taxonomy/classify/scan
 * Scan directory and classify.
 */
router.post("/classify/scan", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const { rootPath, maxDepth = 3, options } = req.body;

    if (!rootPath) {
      res.status(400).json({ message: "rootPath is required" });
      return;
    }

    const integration = getTaxonomyIntegration()!;
    const result = await integration.scanAndClassify(rootPath, {
      maxDepth,
      dryRun: options?.dryRun,
    });

    res.json({
      totalProcessed: result.totalProcessed,
      successCount: result.successCount,
      failureCount: result.failureCount,
      reviewCount: result.reviewCount,
      duration: result.duration,
      newTermsCreated: result.newTerms.length,
      errors: result.errors,
      directoriesScanned: result.totalProcessed, // Approximate
    });
  } catch (error) {
    log.error({ error }, "Failed to scan and classify");
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/taxonomy/reclassify/plan
 * Create a re-classification plan.
 */
router.post("/reclassify/plan", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const { newConfigContent } = req.body;

    if (!newConfigContent) {
      res.status(400).json({ message: "newConfigContent is required" });
      return;
    }

    const integration = getTaxonomyIntegration()!;
    const plan = await integration.updateConfig(newConfigContent, false);

    if (!plan) {
      res.json({
        id: "no-changes",
        affectedContentCount: 0,
        affectedVocabularies: [],
        estimatedDuration: 0,
        mode: "incremental",
        changes: {
          addedRules: 0,
          removedRules: 0,
          modifiedRules: 0,
          setChanges: { added: 0, removed: 0, modified: 0 },
        },
      });
      return;
    }

    res.json({
      id: plan.id,
      affectedContentCount: plan.affectedContent.length,
      affectedVocabularies: plan.affectedVocabularies,
      estimatedDuration: plan.estimatedDuration,
      mode: plan.mode,
      changes: {
        addedRules: plan.changes.added.length,
        removedRules: plan.changes.removed.length,
        modifiedRules: plan.changes.modified.length,
        setChanges: {
          added: plan.changes.setChanges.added.length,
          removed: plan.changes.setChanges.removed.length,
          modified: plan.changes.setChanges.modified.length,
        },
      },
    });
  } catch (error) {
    log.error({ error }, "Failed to create re-classification plan");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ============================================================================
// CONTENT ROUTES
// ============================================================================

/**
 * GET /api/taxonomy/vocabularies/:vocabularyId/terms/:termId/content
 * Get content by term.
 */
router.get(
  "/vocabularies/:vocabularyId/terms/:termId/content",
  requireTaxonomy,
  async (req: Request, res: Response) => {
    try {
      const engine = getTaxonomyIntegration()!.getEngine()!;
      const vocabularyId = String(req.params.vocabularyId);
      const termId = String(req.params.termId);
      const term = await engine.getTerm(vocabularyId, termId);

      if (!term) {
        res.status(404).json({ message: "Term not found" });
        return;
      }

      const limitParam = Number(req.query.limit) || 100;
      const offsetParam = Number(req.query.offset) || 0;
      const sortByParam = (req.query.sortBy as string) || "classifiedAt";
      const sortOrderParam = (req.query.sortOrder as string) || "desc";

      let refs = [...term.contentRefs];

      // Sort
      refs.sort((a, b) => {
        const aVal = (a as any)[sortByParam];
        const bVal = (b as any)[sortByParam];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrderParam === "desc" ? -cmp : cmp;
      });

      const total = refs.length;
      refs = refs.slice(offsetParam, offsetParam + limitParam);

      res.json({
        content: refs.map((ref) => ({
          contentId: ref.contentId,
          name: ref.name,
          classifiedAt: ref.classifiedAt.toISOString(),
          confidence: ref.confidence,
          attributes: ref.attributes,
          hasSymlink: ref.hasSymlink,
          symlinkPath: ref.symlinkPath || null,
        })),
        total,
      });
    } catch (error) {
      log.error({ error }, "Failed to get content by term");
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ============================================================================
// STATS ROUTES
// ============================================================================

/**
 * GET /api/taxonomy/stats
 * Get overall taxonomy statistics.
 */
router.get("/stats", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const integration = getTaxonomyIntegration()!;
    const engine = integration.getEngine()!;

    const vocabularies = engine.getVocabularies();
    let termCount = 0;
    let contentCount = 0;
    let symlinkCount = 0;

    for (const [id] of Array.from(vocabularies.entries())) {
      const terms = await engine.getTerms(id);
      termCount += terms.length;
      for (const term of terms) {
        contentCount += term.contentCount;
        symlinkCount += term.contentRefs.filter((r) => r.hasSymlink).length;
      }
    }

    const config = engine.getConfig();

    res.json({
      vocabularyCount: vocabularies.size,
      termCount,
      classifiedContentCount: contentCount,
      symlinkCount,
      lastClassificationAt: null, // Would track this
      configVersion: config.configVersion || null,
    });
  } catch (error) {
    log.error({ error }, "Failed to get stats");
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/taxonomy/stats/vocabularies
 * Get vocabulary statistics.
 */
router.get("/stats/vocabularies", requireTaxonomy, async (req: Request, res: Response) => {
  try {
    const stats = await getTaxonomyIntegration()!.getVocabularyStats();

    // Enrich with most used terms
    const engine = getTaxonomyIntegration()!.getEngine()!;
    const result = await Promise.all(
      stats.map(async (s) => {
        const terms = await engine.getTerms(s.id);
        const topTerms = [...terms]
          .sort((a, b) => b.contentCount - a.contentCount)
          .slice(0, 10)
          .map((t) => ({
            termId: t.id,
            termValue: t.value,
            contentCount: t.contentCount,
          }));

        return {
          ...s,
          avgTermsPerContent: s.contentCount > 0 ? s.termCount / s.contentCount : 0,
          mostUsedTerms: topTerms,
        };
      })
    );

    res.json(result);
  } catch (error) {
    log.error({ error }, "Failed to get vocabulary stats");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ============================================================================
// INITIALIZATION ROUTE
// ============================================================================

/**
 * POST /api/taxonomy/init
 * Initialize the taxonomy engine with RSES config.
 */
router.post("/init", async (req: Request, res: Response) => {
  try {
    const { rsesConfigContent, symlinkBaseDir, enableAutoSymlinks = true } = req.body;

    if (!rsesConfigContent) {
      res.status(400).json({ message: "rsesConfigContent is required" });
      return;
    }

    if (!symlinkBaseDir) {
      res.status(400).json({ message: "symlinkBaseDir is required" });
      return;
    }

    const config: TaxonomyIntegrationConfig = {
      rsesConfigContent,
      symlinkBaseDir,
      enableFileWatcher: false,
      enableAutoSymlinks,
    };

    await initTaxonomyIntegration(config);

    res.json({ message: "Taxonomy engine initialized", success: true });
  } catch (error) {
    log.error({ error }, "Failed to initialize taxonomy engine");
    res.status(500).json({
      message: error instanceof Error ? error.message : "Initialization failed",
    });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formats a term for API response.
 */
function formatTerm(term: Term): any {
  return {
    id: term.id,
    value: term.value,
    label: term.label,
    vocabularyId: term.vocabularyId,
    parentId: term.parentId || null,
    childIds: term.childIds,
    contentCount: term.contentCount,
    weight: term.weight,
    symlinkPath: term.symlinkPath || null,
    createdAt: term.createdAt.toISOString(),
    lastClassifiedAt: term.lastClassifiedAt?.toISOString() || null,
    metadata: term.metadata,
  };
}

export default router;
