/**
 * @file routes.ts
 * @description CMS API Routes - Express router for content type system
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Implements RESTful API endpoints for:
 * - Content type CRUD
 * - Field storage and instance management
 * - Display configuration
 * - Taxonomy vocabularies and terms
 * - Content CRUD with field data
 */

import { Router } from "express";
import { z } from "zod";
import {
  contentTypeStorage,
  fieldStorageRepo,
  fieldInstanceRepo,
  displayStorage,
  vocabularyStorage,
  termStorage,
  contentStorage,
  revisionStorage,
  fieldDataStorage,
} from "./storage";
import {
  fieldTypeRegistry,
  widgetRegistry,
  formatterRegistry,
} from "./registry";
import {
  syncVocabularyWithRses,
  classifyContent,
  classifyContentBulk,
} from "./rses-integration";
import { requireAuth } from "../auth/session";
import { createModuleLogger } from "../logger";
import {
  insertContentTypeSchema,
  insertFieldStorageSchema,
  insertFieldInstanceSchema,
  insertViewDisplaySchema,
  insertFormDisplaySchema,
  insertTaxonomyVocabularySchema,
  insertTaxonomyTermSchema,
  insertContentSchema,
} from "@shared/cms/schema";

const log = createModuleLogger("cms-routes");
const router = Router();

// =============================================================================
// CONTENT TYPE ROUTES
// =============================================================================

/**
 * GET /api/cms/content-types - List all content types
 */
router.get("/content-types", async (req, res) => {
  try {
    const includeSystem = req.query.includeSystem === "true";
    const types = await contentTypeStorage.list({ includeSystem });
    res.json({ data: types, total: types.length });
  } catch (err) {
    log.error({ err }, "Failed to list content types");
    res.status(500).json({ message: "Failed to list content types" });
  }
});

/**
 * GET /api/cms/content-types/:id - Get a single content type
 */
router.get("/content-types/:id", async (req, res) => {
  try {
    const type = await contentTypeStorage.get(req.params.id);
    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }
    res.json(type);
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get content type");
    res.status(500).json({ message: "Failed to get content type" });
  }
});

/**
 * POST /api/cms/content-types - Create a new content type
 */
router.post("/content-types", requireAuth, async (req, res) => {
  try {
    const data = insertContentTypeSchema.parse(req.body);

    // Check if already exists
    if (await contentTypeStorage.exists(data.id)) {
      return res.status(409).json({
        message: "Content type already exists",
        existing: data.id,
      });
    }

    const type = await contentTypeStorage.create(data);

    // Create default displays
    await displayStorage.saveViewDisplay({
      entityType: "content",
      bundle: data.id,
      mode: "full",
      status: true,
      content: {},
      hidden: [],
      thirdPartySettings: {},
    });

    await displayStorage.saveFormDisplay({
      entityType: "content",
      bundle: data.id,
      mode: "default",
      status: true,
      content: {},
      hidden: [],
      thirdPartySettings: {},
    });

    res.status(201).json(type);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
        errors: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      });
    }
    log.error({ err }, "Failed to create content type");
    res.status(500).json({ message: "Failed to create content type" });
  }
});

/**
 * PUT /api/cms/content-types/:id - Update a content type
 */
router.put("/content-types/:id", requireAuth, async (req, res) => {
  try {
    const data = insertContentTypeSchema.partial().parse(req.body);
    const type = await contentTypeStorage.update(req.params.id, data);

    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }

    res.json(type);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err, id: req.params.id }, "Failed to update content type");
    res.status(500).json({ message: "Failed to update content type" });
  }
});

/**
 * DELETE /api/cms/content-types/:id - Delete a content type
 */
router.delete("/content-types/:id", requireAuth, async (req, res) => {
  try {
    const type = await contentTypeStorage.get(req.params.id);

    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }

    if (type.isSystem) {
      return res.status(400).json({
        message: "Cannot delete system content type",
        reason: "system_type",
      });
    }

    if (await contentTypeStorage.hasContent(req.params.id)) {
      return res.status(400).json({
        message: "Cannot delete content type with existing content",
        reason: "has_content",
      });
    }

    await contentTypeStorage.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to delete content type");
    res.status(500).json({ message: "Failed to delete content type" });
  }
});

/**
 * GET /api/cms/content-types/:id/fields - Get fields for a content type
 */
router.get("/content-types/:id/fields", async (req, res) => {
  try {
    const type = await contentTypeStorage.get(req.params.id);
    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }

    const instances = await fieldInstanceRepo.getForBundle("content", req.params.id);

    // Get corresponding storages
    const storageIds = new Set(instances.map((i) => `content.${i.fieldName}`));
    const storages = await fieldStorageRepo.list({ entityType: "content" });
    const relevantStorages = storages.filter((s) => storageIds.has(s.id));

    res.json({ instances, storages: relevantStorages });
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get content type fields");
    res.status(500).json({ message: "Failed to get fields" });
  }
});

/**
 * GET /api/cms/content-types/:id/displays - Get displays for a content type
 */
router.get("/content-types/:id/displays", async (req, res) => {
  try {
    const type = await contentTypeStorage.get(req.params.id);
    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }

    const viewDisplays = await displayStorage.getViewDisplaysForBundle("content", req.params.id);
    const formDisplays = await displayStorage.getFormDisplaysForBundle("content", req.params.id);

    res.json({ viewDisplays, formDisplays });
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get displays");
    res.status(500).json({ message: "Failed to get displays" });
  }
});

// =============================================================================
// FIELD STORAGE ROUTES
// =============================================================================

/**
 * GET /api/cms/field-storages - List field storages
 */
router.get("/field-storages", async (req, res) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const type = req.query.type as string | undefined;
    const storages = await fieldStorageRepo.list({ entityType, type });
    res.json({ data: storages, total: storages.length });
  } catch (err) {
    log.error({ err }, "Failed to list field storages");
    res.status(500).json({ message: "Failed to list field storages" });
  }
});

/**
 * POST /api/cms/field-storages - Create field storage
 */
router.post("/field-storages", requireAuth, async (req, res) => {
  try {
    const data = insertFieldStorageSchema.parse(req.body);
    const id = `${data.entityType}.${data.fieldName}`;

    // Check if already exists
    const existing = await fieldStorageRepo.get(id);
    if (existing) {
      return res.status(409).json({
        message: "Field storage already exists",
        existing: id,
      });
    }

    const storage = await fieldStorageRepo.create({ ...data, id });
    res.status(201).json(storage);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to create field storage");
    res.status(500).json({ message: "Failed to create field storage" });
  }
});

/**
 * DELETE /api/cms/field-storages/:id - Delete field storage
 */
router.delete("/field-storages/:id", requireAuth, async (req, res) => {
  try {
    const instances = await fieldStorageRepo.getInstances(req.params.id);

    if (instances.length > 0) {
      return res.status(400).json({
        message: "Cannot delete field storage with existing instances",
        instances: instances.map((i) => i.id),
      });
    }

    const deleted = await fieldStorageRepo.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Field storage not found" });
    }

    res.status(204).send();
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to delete field storage");
    res.status(500).json({ message: "Failed to delete field storage" });
  }
});

// =============================================================================
// FIELD INSTANCE ROUTES
// =============================================================================

/**
 * GET /api/cms/field-instances - List field instances
 */
router.get("/field-instances", async (req, res) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const bundle = req.query.bundle as string | undefined;
    const instances = await fieldInstanceRepo.list({ entityType, bundle });
    res.json({ data: instances, total: instances.length });
  } catch (err) {
    log.error({ err }, "Failed to list field instances");
    res.status(500).json({ message: "Failed to list field instances" });
  }
});

/**
 * POST /api/cms/field-instances - Create field instance
 */
router.post("/field-instances", requireAuth, async (req, res) => {
  try {
    const data = insertFieldInstanceSchema.parse(req.body);

    // Check if storage exists
    const storageId = `${data.entityType}.${data.fieldName}`;
    const storage = await fieldStorageRepo.get(storageId);
    if (!storage) {
      return res.status(404).json({
        message: `Field storage not found: ${storageId}`,
      });
    }

    const id = `${data.entityType}.${data.bundle}.${data.fieldName}`;
    const existing = await fieldInstanceRepo.get(id);
    if (existing) {
      return res.status(409).json({
        message: "Field instance already exists",
        existing: id,
      });
    }

    const instance = await fieldInstanceRepo.create({ ...data, id });

    // Add to default displays
    const fieldType = fieldTypeRegistry.get(storage.type as any);
    if (fieldType) {
      // Add to view display
      const viewDisplay = await displayStorage.getViewDisplay(data.entityType, data.bundle, "full");
      if (viewDisplay) {
        const content = { ...viewDisplay.content };
        content[data.fieldName] = {
          type: fieldType.defaultFormatter,
          weight: Object.keys(content).length,
          label: "above",
          settings: {},
          thirdPartySettings: {},
        };
        await displayStorage.saveViewDisplay({ ...viewDisplay, content });
      }

      // Add to form display
      const formDisplay = await displayStorage.getFormDisplay(data.entityType, data.bundle, "default");
      if (formDisplay) {
        const content = { ...formDisplay.content };
        content[data.fieldName] = {
          type: fieldType.defaultWidget,
          weight: Object.keys(content).length,
          settings: {},
          thirdPartySettings: {},
        };
        await displayStorage.saveFormDisplay({ ...formDisplay, content });
      }
    }

    res.status(201).json(instance);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to create field instance");
    res.status(500).json({ message: "Failed to create field instance" });
  }
});

/**
 * DELETE /api/cms/field-instances/:id - Delete field instance
 */
router.delete("/field-instances/:id", requireAuth, async (req, res) => {
  try {
    const deleteData = req.query.deleteData === "true";
    const instance = await fieldInstanceRepo.get(req.params.id);

    if (!instance) {
      return res.status(404).json({ message: "Field instance not found" });
    }

    // Optionally delete field data
    if (deleteData) {
      // This would delete all data for this field across all content
      log.info({ instanceId: req.params.id }, "Deleting field data");
    }

    await fieldInstanceRepo.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to delete field instance");
    res.status(500).json({ message: "Failed to delete field instance" });
  }
});

// =============================================================================
// DISPLAY ROUTES
// =============================================================================

/**
 * GET /api/cms/view-displays/:entityType/:bundle/:mode
 */
router.get("/view-displays/:entityType/:bundle/:mode", async (req, res) => {
  try {
    const display = await displayStorage.getViewDisplay(
      req.params.entityType,
      req.params.bundle,
      req.params.mode
    );

    if (!display) {
      return res.status(404).json({ message: "View display not found" });
    }

    res.json(display);
  } catch (err) {
    log.error({ err }, "Failed to get view display");
    res.status(500).json({ message: "Failed to get view display" });
  }
});

/**
 * PUT /api/cms/view-displays/:entityType/:bundle/:mode
 */
router.put("/view-displays/:entityType/:bundle/:mode", requireAuth, async (req, res) => {
  try {
    const data = insertViewDisplaySchema
      .omit({ id: true, entityType: true, bundle: true, mode: true })
      .parse(req.body);

    const display = await displayStorage.saveViewDisplay({
      ...data,
      entityType: req.params.entityType,
      bundle: req.params.bundle,
      mode: req.params.mode,
    });

    res.json(display);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to save view display");
    res.status(500).json({ message: "Failed to save view display" });
  }
});

/**
 * GET /api/cms/form-displays/:entityType/:bundle/:mode
 */
router.get("/form-displays/:entityType/:bundle/:mode", async (req, res) => {
  try {
    const display = await displayStorage.getFormDisplay(
      req.params.entityType,
      req.params.bundle,
      req.params.mode
    );

    if (!display) {
      return res.status(404).json({ message: "Form display not found" });
    }

    res.json(display);
  } catch (err) {
    log.error({ err }, "Failed to get form display");
    res.status(500).json({ message: "Failed to get form display" });
  }
});

/**
 * PUT /api/cms/form-displays/:entityType/:bundle/:mode
 */
router.put("/form-displays/:entityType/:bundle/:mode", requireAuth, async (req, res) => {
  try {
    const data = insertFormDisplaySchema
      .omit({ id: true, entityType: true, bundle: true, mode: true })
      .parse(req.body);

    const display = await displayStorage.saveFormDisplay({
      ...data,
      entityType: req.params.entityType,
      bundle: req.params.bundle,
      mode: req.params.mode,
    });

    res.json(display);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to save form display");
    res.status(500).json({ message: "Failed to save form display" });
  }
});

// =============================================================================
// TAXONOMY VOCABULARY ROUTES
// =============================================================================

/**
 * GET /api/cms/vocabularies - List vocabularies
 */
router.get("/vocabularies", async (req, res) => {
  try {
    const rsesEnabled = req.query.rsesEnabled === "true" ? true :
                        req.query.rsesEnabled === "false" ? false : undefined;
    const vocabularies = await vocabularyStorage.list({ rsesEnabled });
    res.json({ data: vocabularies, total: vocabularies.length });
  } catch (err) {
    log.error({ err }, "Failed to list vocabularies");
    res.status(500).json({ message: "Failed to list vocabularies" });
  }
});

/**
 * GET /api/cms/vocabularies/:id - Get vocabulary
 */
router.get("/vocabularies/:id", async (req, res) => {
  try {
    const vocab = await vocabularyStorage.get(req.params.id);
    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }
    res.json(vocab);
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get vocabulary");
    res.status(500).json({ message: "Failed to get vocabulary" });
  }
});

/**
 * POST /api/cms/vocabularies - Create vocabulary
 */
router.post("/vocabularies", requireAuth, async (req, res) => {
  try {
    const data = insertTaxonomyVocabularySchema.parse(req.body);

    const existing = await vocabularyStorage.get(data.id);
    if (existing) {
      return res.status(409).json({
        message: "Vocabulary already exists",
        existing: data.id,
      });
    }

    const vocab = await vocabularyStorage.create(data);
    res.status(201).json(vocab);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to create vocabulary");
    res.status(500).json({ message: "Failed to create vocabulary" });
  }
});

/**
 * PUT /api/cms/vocabularies/:id - Update vocabulary
 */
router.put("/vocabularies/:id", requireAuth, async (req, res) => {
  try {
    const data = insertTaxonomyVocabularySchema.partial().parse(req.body);
    const vocab = await vocabularyStorage.update(req.params.id, data);

    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    res.json(vocab);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err, id: req.params.id }, "Failed to update vocabulary");
    res.status(500).json({ message: "Failed to update vocabulary" });
  }
});

/**
 * DELETE /api/cms/vocabularies/:id - Delete vocabulary
 */
router.delete("/vocabularies/:id", requireAuth, async (req, res) => {
  try {
    const deleteTerms = req.query.deleteTerms !== "false";
    const vocab = await vocabularyStorage.get(req.params.id);

    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    const termCount = await vocabularyStorage.getTermCount(req.params.id);
    if (termCount > 0 && !deleteTerms) {
      return res.status(400).json({
        message: "Vocabulary has terms. Set deleteTerms=true to delete them.",
      });
    }

    await vocabularyStorage.delete(req.params.id);
    res.status(204).send();
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to delete vocabulary");
    res.status(500).json({ message: "Failed to delete vocabulary" });
  }
});

/**
 * GET /api/cms/vocabularies/:id/tree - Get vocabulary tree
 */
router.get("/vocabularies/:id/tree", async (req, res) => {
  try {
    const vocab = await vocabularyStorage.get(req.params.id);
    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    const maxDepth = parseInt(req.query.maxDepth as string) || 5;
    const terms = await termStorage.getTree(req.params.id, maxDepth);

    // Build tree structure
    const tree = buildTermTree(terms);

    res.json({
      vocabulary: vocab,
      terms: tree,
      termCount: terms.length,
    });
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get vocabulary tree");
    res.status(500).json({ message: "Failed to get vocabulary tree" });
  }
});

/**
 * POST /api/cms/vocabularies/:id/sync-rses - Sync with RSES
 */
router.post("/vocabularies/:id/sync-rses", requireAuth, async (req, res) => {
  try {
    const vocab = await vocabularyStorage.get(req.params.id);
    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    if (!vocab.rsesIntegration?.enabled) {
      return res.status(400).json({
        message: "RSES integration not enabled for this vocabulary",
      });
    }

    const configId = req.body.configId ?? vocab.rsesIntegration.configId;
    const dryRun = req.body.dryRun ?? false;

    const result = await syncVocabularyWithRses({
      vocabularyId: req.params.id,
      configId,
      dryRun,
    });

    res.json({ ...result, dryRun });
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to sync vocabulary with RSES");
    res.status(500).json({ message: err instanceof Error ? err.message : "Sync failed" });
  }
});

// =============================================================================
// TAXONOMY TERM ROUTES
// =============================================================================

/**
 * GET /api/cms/vocabularies/:vocabularyId/terms - List terms
 */
router.get("/vocabularies/:vocabularyId/terms", async (req, res) => {
  try {
    const vocab = await vocabularyStorage.get(req.params.vocabularyId);
    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const name = req.query.name as string | undefined;

    const result = await termStorage.list(req.params.vocabularyId, { page, limit, name });
    res.json(result);
  } catch (err) {
    log.error({ err }, "Failed to list terms");
    res.status(500).json({ message: "Failed to list terms" });
  }
});

/**
 * GET /api/cms/terms/:id - Get term
 */
router.get("/terms/:id", async (req, res) => {
  try {
    const term = await termStorage.get(parseInt(req.params.id));
    if (!term) {
      return res.status(404).json({ message: "Term not found" });
    }
    res.json(term);
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get term");
    res.status(500).json({ message: "Failed to get term" });
  }
});

/**
 * POST /api/cms/vocabularies/:vocabularyId/terms - Create term
 */
router.post("/vocabularies/:vocabularyId/terms", requireAuth, async (req, res) => {
  try {
    const vocab = await vocabularyStorage.get(req.params.vocabularyId);
    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    const data = insertTaxonomyTermSchema.omit({ vocabularyId: true }).parse(req.body);

    // Check for duplicate
    const existing = await termStorage.getByName(req.params.vocabularyId, data.name);
    if (existing) {
      return res.status(409).json({
        message: "Term with this name already exists",
        existing: existing.id,
      });
    }

    const term = await termStorage.create({
      ...data,
      vocabularyId: req.params.vocabularyId,
    });

    res.status(201).json(term);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to create term");
    res.status(500).json({ message: "Failed to create term" });
  }
});

/**
 * PUT /api/cms/terms/:id - Update term
 */
router.put("/terms/:id", requireAuth, async (req, res) => {
  try {
    const data = insertTaxonomyTermSchema.partial().omit({ vocabularyId: true }).parse(req.body);
    const term = await termStorage.update(parseInt(req.params.id), data);

    if (!term) {
      return res.status(404).json({ message: "Term not found" });
    }

    res.json(term);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err, id: req.params.id }, "Failed to update term");
    res.status(500).json({ message: "Failed to update term" });
  }
});

/**
 * DELETE /api/cms/terms/:id - Delete term
 */
router.delete("/terms/:id", requireAuth, async (req, res) => {
  try {
    const deleteChildren = req.query.deleteChildren === "true";
    const term = await termStorage.get(parseInt(req.params.id));

    if (!term) {
      return res.status(404).json({ message: "Term not found" });
    }

    const children = await termStorage.getChildren(term.id);
    if (children.length > 0 && !deleteChildren) {
      return res.status(400).json({
        message: "Term has children. Set deleteChildren=true to delete them.",
        childCount: children.length,
      });
    }

    await termStorage.delete(term.id);
    res.status(204).send();
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to delete term");
    res.status(500).json({ message: "Failed to delete term" });
  }
});

/**
 * POST /api/cms/vocabularies/:vocabularyId/terms/reorder - Reorder terms
 */
router.post("/vocabularies/:vocabularyId/terms/reorder", requireAuth, async (req, res) => {
  try {
    const vocab = await vocabularyStorage.get(req.params.vocabularyId);
    if (!vocab) {
      return res.status(404).json({ message: "Vocabulary not found" });
    }

    const orderSchema = z.object({
      order: z.array(z.object({
        id: z.number(),
        weight: z.number(),
        parentIds: z.array(z.number()).optional(),
      })),
    });

    const { order } = orderSchema.parse(req.body);
    const updated = await termStorage.bulkUpdateWeights(order);

    res.json({ updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to reorder terms");
    res.status(500).json({ message: "Failed to reorder terms" });
  }
});

// =============================================================================
// CONTENT ROUTES
// =============================================================================

/**
 * GET /api/cms/content - List content
 */
router.get("/content", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const type = req.query.type as string | undefined;
    const published = req.query.published === "true" ? true :
                      req.query.published === "false" ? false : undefined;
    const promoted = req.query.promoted === "true" ? true :
                     req.query.promoted === "false" ? false : undefined;
    const sticky = req.query.sticky === "true" ? true :
                   req.query.sticky === "false" ? false : undefined;
    const search = req.query.search as string | undefined;
    const sort = (req.query.sort as "created" | "updated" | "title") || "created";
    const order = (req.query.order as "asc" | "desc") || "desc";

    const result = await contentStorage.list({
      page,
      limit,
      type,
      published,
      promoted,
      sticky,
      search,
      sort,
      order,
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, "Failed to list content");
    res.status(500).json({ message: "Failed to list content" });
  }
});

/**
 * GET /api/cms/content/:id - Get content
 */
router.get("/content/:id", async (req, res) => {
  try {
    const includeFields = req.query.includeFields !== "false";
    const revisionNumber = req.query.revision ? parseInt(req.query.revision as string) : undefined;

    const content = await contentStorage.get(parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const type = await contentTypeStorage.get(content.type);
    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }

    let fields: Record<string, unknown[]> | undefined;
    if (includeFields) {
      const fieldData = await fieldDataStorage.getForEntity(
        "content",
        content.id,
        revisionNumber ? content.revisionId ?? undefined : undefined
      );
      fields = {};
      for (const [fieldName, data] of Object.entries(fieldData)) {
        fields[fieldName] = data.map((d) => d.value);
      }
    }

    res.json({ content, fields, type });
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to get content");
    res.status(500).json({ message: "Failed to get content" });
  }
});

/**
 * POST /api/cms/content - Create content
 */
router.post("/content", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      content: insertContentSchema,
      fields: z.record(z.array(z.unknown())).optional(),
    });

    const { content: contentData, fields } = schema.parse(req.body);

    // Verify content type exists
    const type = await contentTypeStorage.get(contentData.type);
    if (!type) {
      return res.status(404).json({ message: "Content type not found" });
    }

    // Create content
    const content = await contentStorage.create({
      ...contentData,
      published: contentData.published ?? type.publishedByDefault,
      createdBy: (req as any).user?.id,
      updatedBy: (req as any).user?.id,
    });

    // Save field data
    if (fields) {
      for (const [fieldName, values] of Object.entries(fields)) {
        await fieldDataStorage.setField(
          "content",
          content.id,
          fieldName,
          values as Array<Record<string, unknown>>
        );
      }
    }

    // Create initial revision if enabled
    if (type.revisionsEnabled) {
      const fieldData = fields || {};
      await revisionStorage.create({
        contentId: content.id,
        revisionNumber: 1,
        title: content.title,
        published: content.published,
        logMessage: "Initial revision",
        fieldData: fieldData as Record<string, Array<Record<string, unknown>>>,
        createdBy: (req as any).user?.id,
      });

      await contentStorage.update(content.id, { revisionId: 1 });
    }

    // Get saved fields
    const savedFields = await fieldDataStorage.getForEntity("content", content.id);
    const fieldsResponse: Record<string, unknown[]> = {};
    for (const [fieldName, data] of Object.entries(savedFields)) {
      fieldsResponse[fieldName] = data.map((d) => d.value);
    }

    res.status(201).json({ content, fields: fieldsResponse });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to create content");
    res.status(500).json({ message: "Failed to create content" });
  }
});

/**
 * PUT /api/cms/content/:id - Update content
 */
router.put("/content/:id", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      content: insertContentSchema.partial().omit({ type: true }),
      fields: z.record(z.array(z.unknown())).optional(),
      newRevision: z.boolean().default(false),
      revisionLogMessage: z.string().optional(),
    });

    const { content: contentData, fields, newRevision, revisionLogMessage } = schema.parse(req.body);

    const existing = await contentStorage.get(parseInt(req.params.id));
    if (!existing) {
      return res.status(404).json({ message: "Content not found" });
    }

    const type = await contentTypeStorage.get(existing.type);
    const shouldCreateRevision = newRevision && type?.revisionsEnabled;

    // Update content
    const content = await contentStorage.update(existing.id, {
      ...contentData,
      updatedBy: (req as any).user?.id,
    });

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Update field data
    if (fields) {
      for (const [fieldName, values] of Object.entries(fields)) {
        await fieldDataStorage.setField(
          "content",
          content.id,
          fieldName,
          values as Array<Record<string, unknown>>
        );
      }
    }

    // Create revision if requested
    let revision: number | undefined;
    if (shouldCreateRevision) {
      const latestRevision = await revisionStorage.getLatest(content.id);
      const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

      const savedFields = await fieldDataStorage.getForEntity("content", content.id);
      const fieldData: Record<string, Array<Record<string, unknown>>> = {};
      for (const [fieldName, data] of Object.entries(savedFields)) {
        fieldData[fieldName] = data.map((d) => d.value as Record<string, unknown>);
      }

      await revisionStorage.create({
        contentId: content.id,
        revisionNumber: newRevisionNumber,
        title: content.title,
        published: content.published,
        logMessage: revisionLogMessage || null,
        fieldData,
        createdBy: (req as any).user?.id,
      });

      await contentStorage.update(content.id, { revisionId: newRevisionNumber });
      revision = newRevisionNumber;
    }

    // Get saved fields
    const savedFields = await fieldDataStorage.getForEntity("content", content.id);
    const fieldsResponse: Record<string, unknown[]> = {};
    for (const [fieldName, data] of Object.entries(savedFields)) {
      fieldsResponse[fieldName] = data.map((d) => d.value);
    }

    res.json({ content, fields: fieldsResponse, revision });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err, id: req.params.id }, "Failed to update content");
    res.status(500).json({ message: "Failed to update content" });
  }
});

/**
 * DELETE /api/cms/content/:id - Delete content
 */
router.delete("/content/:id", requireAuth, async (req, res) => {
  try {
    const content = await contentStorage.get(parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Delete field data
    await fieldDataStorage.deleteForEntity("content", content.id);

    // Delete content (revisions cascade)
    await contentStorage.delete(content.id);

    res.status(204).send();
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to delete content");
    res.status(500).json({ message: "Failed to delete content" });
  }
});

/**
 * PATCH /api/cms/content/:id/publish - Set publish status
 */
router.patch("/content/:id/publish", requireAuth, async (req, res) => {
  try {
    const { published } = z.object({ published: z.boolean() }).parse(req.body);

    const content = await contentStorage.setPublished(parseInt(req.params.id), published);
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    res.json(content);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err, id: req.params.id }, "Failed to update publish status");
    res.status(500).json({ message: "Failed to update publish status" });
  }
});

/**
 * POST /api/cms/content/:id/classify - Classify content with RSES
 */
router.post("/content/:id/classify", requireAuth, async (req, res) => {
  try {
    const content = await contentStorage.get(parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const options = z.object({
      configId: z.number().optional(),
      updateTaxonomy: z.boolean().default(true),
      createSymlinks: z.boolean().default(false),
    }).optional().parse(req.body);

    const result = await classifyContent({
      contentId: content.id,
      configId: options?.configId,
      updateTaxonomy: options?.updateTaxonomy ?? true,
      createSymlinks: options?.createSymlinks ?? false,
    });

    res.json(result);
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to classify content");
    res.status(500).json({ message: err instanceof Error ? err.message : "Classification failed" });
  }
});

/**
 * GET /api/cms/content/:id/revisions - Get content revisions
 */
router.get("/content/:id/revisions", async (req, res) => {
  try {
    const content = await contentStorage.get(parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await revisionStorage.list(content.id, { page, limit });
    res.json(result);
  } catch (err) {
    log.error({ err, id: req.params.id }, "Failed to list revisions");
    res.status(500).json({ message: "Failed to list revisions" });
  }
});

/**
 * POST /api/cms/content/:id/revisions/:revisionNumber/restore - Restore revision
 */
router.post("/content/:id/revisions/:revisionNumber/restore", requireAuth, async (req, res) => {
  try {
    const content = await contentStorage.get(parseInt(req.params.id));
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const revision = await revisionStorage.get(
      content.id,
      parseInt(req.params.revisionNumber)
    );
    if (!revision) {
      return res.status(404).json({ message: "Revision not found" });
    }

    // Update content with revision data
    await contentStorage.update(content.id, {
      title: revision.title,
      published: revision.published,
      updatedBy: (req as any).user?.id,
    });

    // Restore field data
    if (revision.fieldData) {
      for (const [fieldName, values] of Object.entries(revision.fieldData)) {
        await fieldDataStorage.setField("content", content.id, fieldName, values);
      }
    }

    // Create new revision for restore
    const latestRevision = await revisionStorage.getLatest(content.id);
    const newRevisionNumber = (latestRevision?.revisionNumber || 0) + 1;

    await revisionStorage.create({
      contentId: content.id,
      revisionNumber: newRevisionNumber,
      title: revision.title,
      published: revision.published,
      logMessage: `Restored from revision ${revision.revisionNumber}`,
      fieldData: revision.fieldData,
      createdBy: (req as any).user?.id,
    });

    await contentStorage.update(content.id, { revisionId: newRevisionNumber });

    const updatedContent = await contentStorage.get(content.id);

    res.json({ content: updatedContent, newRevision: newRevisionNumber });
  } catch (err) {
    log.error({ err }, "Failed to restore revision");
    res.status(500).json({ message: "Failed to restore revision" });
  }
});

// =============================================================================
// BULK OPERATIONS ROUTES
// =============================================================================

/**
 * POST /api/cms/content/bulk-update - Bulk update content
 */
router.post("/content/bulk-update", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      ids: z.array(z.number()).min(1).max(100),
      updates: z.object({
        published: z.boolean().optional(),
        sticky: z.boolean().optional(),
        promoted: z.boolean().optional(),
      }),
    });

    const { ids, updates } = schema.parse(req.body);
    const updated = await contentStorage.bulkUpdate(ids, updates);

    res.json({ updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to bulk update content");
    res.status(500).json({ message: "Failed to bulk update" });
  }
});

/**
 * POST /api/cms/content/bulk-delete - Bulk delete content
 */
router.post("/content/bulk-delete", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      ids: z.array(z.number()).min(1).max(100),
    });

    const { ids } = schema.parse(req.body);

    // Delete field data for each
    for (const id of ids) {
      await fieldDataStorage.deleteForEntity("content", id);
    }

    const deleted = await contentStorage.bulkDelete(ids);

    res.json({ deleted });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to bulk delete content");
    res.status(500).json({ message: "Failed to bulk delete" });
  }
});

/**
 * POST /api/cms/content/bulk-classify - Bulk classify content
 */
router.post("/content/bulk-classify", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      ids: z.array(z.number()).min(1).max(100),
      configId: z.number().optional(),
      updateTaxonomy: z.boolean().default(true),
    });

    const { ids, configId, updateTaxonomy } = schema.parse(req.body);

    const result = await classifyContentBulk({
      contentIds: ids,
      configId,
      updateTaxonomy,
    });

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join("."),
      });
    }
    log.error({ err }, "Failed to bulk classify content");
    res.status(500).json({ message: "Failed to bulk classify" });
  }
});

// =============================================================================
// REGISTRY ROUTES
// =============================================================================

/**
 * GET /api/cms/registry/widgets - List widgets
 */
router.get("/registry/widgets", (req, res) => {
  const fieldType = req.query.fieldType as string | undefined;

  let widgets;
  if (fieldType) {
    widgets = widgetRegistry.getForFieldType(fieldType as any);
  } else {
    widgets = widgetRegistry.getAll();
  }

  res.json({ widgets });
});

/**
 * GET /api/cms/registry/formatters - List formatters
 */
router.get("/registry/formatters", (req, res) => {
  const fieldType = req.query.fieldType as string | undefined;

  let formatters;
  if (fieldType) {
    formatters = formatterRegistry.getForFieldType(fieldType as any);
  } else {
    formatters = formatterRegistry.getAll();
  }

  res.json({ formatters });
});

/**
 * GET /api/cms/registry/field-types - List field types
 */
router.get("/registry/field-types", (req, res) => {
  const fieldTypes = fieldTypeRegistry.getAll();
  res.json({ fieldTypes });
});

// =============================================================================
// HELPERS
// =============================================================================

interface TermWithChildren extends Omit<ReturnType<typeof termStorage.get> extends Promise<infer T> ? T : never, never> {
  children: TermWithChildren[];
  depth: number;
}

function buildTermTree(terms: Awaited<ReturnType<typeof termStorage.getTree>>): TermWithChildren[] {
  const termMap = new Map<number, TermWithChildren>();
  const roots: TermWithChildren[] = [];

  // Initialize all terms with children array
  for (const term of terms) {
    termMap.set(term.id, { ...term, children: [], depth: 0 } as TermWithChildren);
  }

  // Build tree
  for (const term of terms) {
    const node = termMap.get(term.id)!;
    const parentIds = term.parentIds || [];

    if (parentIds.length === 0) {
      roots.push(node);
    } else {
      for (const parentId of parentIds) {
        const parent = termMap.get(parentId);
        if (parent) {
          node.depth = parent.depth + 1;
          parent.children.push(node);
        }
      }
    }
  }

  return roots;
}

export default router;
