/**
 * @file storage.ts
 * @description CMS Storage Layer - Database operations for content types, fields, and content
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Implements Drupal-style entity/field storage with:
 * - Content type CRUD
 * - Field storage and instance management
 * - Display configuration persistence
 * - Taxonomy vocabulary and term storage
 * - Content entity storage with field data
 */

import { db } from "../db";
import { eq, and, desc, asc, count, like, inArray, sql, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { safeLikePattern } from "../lib/sql-utils";
import {
  contentTypes,
  fieldStorages,
  fieldInstances,
  viewDisplays,
  formDisplays,
  taxonomyVocabularies,
  taxonomyTerms,
  contents,
  contentRevisions,
  fieldData,
  viewModes,
  formModes,
  type DbContentType,
  type DbInsertContentType,
  type DbFieldStorage,
  type DbInsertFieldStorage,
  type DbFieldInstance,
  type DbInsertFieldInstance,
  type DbViewDisplay,
  type DbInsertViewDisplay,
  type DbFormDisplay,
  type DbInsertFormDisplay,
  type DbTaxonomyVocabulary,
  type DbInsertTaxonomyVocabulary,
  type DbTaxonomyTerm,
  type DbInsertTaxonomyTerm,
  type DbContent,
  type DbInsertContent,
  type DbContentRevision,
  type DbInsertContentRevision,
  type DbFieldData,
  type DbInsertFieldData,
} from "@shared/cms/schema";
import type { PaginationOptions, PaginatedResponse } from "../storage";

// =============================================================================
// CONTENT TYPE STORAGE
// =============================================================================

export interface ContentTypeStorage {
  list(options?: { includeSystem?: boolean }): Promise<DbContentType[]>;
  get(id: string): Promise<DbContentType | undefined>;
  create(data: DbInsertContentType): Promise<DbContentType>;
  update(id: string, data: Partial<DbInsertContentType>): Promise<DbContentType | undefined>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  hasContent(id: string): Promise<boolean>;
}

export class DatabaseContentTypeStorage implements ContentTypeStorage {
  async list(options?: { includeSystem?: boolean }): Promise<DbContentType[]> {
    if (options?.includeSystem === false) {
      return db.select().from(contentTypes).where(eq(contentTypes.isSystem, false));
    }
    return db.select().from(contentTypes);
  }

  async get(id: string): Promise<DbContentType | undefined> {
    const [result] = await db.select().from(contentTypes).where(eq(contentTypes.id, id));
    return result;
  }

  async create(data: DbInsertContentType): Promise<DbContentType> {
    // The public DbInsertContentType is a Zod-inferred type with `string |
    // null | undefined` for nullable columns. Drizzle's $inferInsert is
    // narrower (`string | undefined`). The runtime accepts both; the cast
    // here only smooths the type-level mismatch.
    const [result] = await db
      .insert(contentTypes)
      .values(data as typeof contentTypes.$inferInsert)
      .returning();
    return result;
  }

  async update(id: string, data: Partial<DbInsertContentType>): Promise<DbContentType | undefined> {
    const [result] = await db
      .update(contentTypes)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof contentTypes.$inferInsert>)
      .where(eq(contentTypes.id, id))
      .returning();
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(contentTypes).where(eq(contentTypes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(contentTypes)
      .where(eq(contentTypes.id, id));
    return Number(result?.count || 0) > 0;
  }

  async hasContent(id: string): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(contents)
      .where(eq(contents.type, id));
    return Number(result?.count || 0) > 0;
  }
}

export const contentTypeStorage = new DatabaseContentTypeStorage();

// =============================================================================
// FIELD STORAGE
// =============================================================================

export interface FieldStorageRepo {
  list(options?: { entityType?: string; type?: string }): Promise<DbFieldStorage[]>;
  get(id: string): Promise<DbFieldStorage | undefined>;
  getByName(entityType: string, fieldName: string): Promise<DbFieldStorage | undefined>;
  create(data: DbInsertFieldStorage): Promise<DbFieldStorage>;
  update(id: string, data: Partial<DbInsertFieldStorage>): Promise<DbFieldStorage | undefined>;
  delete(id: string): Promise<boolean>;
  getInstances(id: string): Promise<DbFieldInstance[]>;
}

export class DatabaseFieldStorageRepo implements FieldStorageRepo {
  async list(options?: { entityType?: string; type?: string }): Promise<DbFieldStorage[]> {
    let query = db.select().from(fieldStorages);

    if (options?.entityType) {
      query = query.where(eq(fieldStorages.entityType, options.entityType)) as typeof query;
    }
    if (options?.type) {
      query = query.where(eq(fieldStorages.type, options.type)) as typeof query;
    }

    return query;
  }

  async get(id: string): Promise<DbFieldStorage | undefined> {
    const [result] = await db.select().from(fieldStorages).where(eq(fieldStorages.id, id));
    return result;
  }

  async getByName(entityType: string, fieldName: string): Promise<DbFieldStorage | undefined> {
    const [result] = await db
      .select()
      .from(fieldStorages)
      .where(and(eq(fieldStorages.entityType, entityType), eq(fieldStorages.fieldName, fieldName)));
    return result;
  }

  async create(data: DbInsertFieldStorage): Promise<DbFieldStorage> {
    // Generate ID if not provided
    const id = data.id || `${data.entityType}.${data.fieldName}`;
    const [result] = await db.insert(fieldStorages).values({ ...data, id }).returning();
    return result;
  }

  async update(id: string, data: Partial<DbInsertFieldStorage>): Promise<DbFieldStorage | undefined> {
    const [result] = await db
      .update(fieldStorages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(fieldStorages.id, id))
      .returning();
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(fieldStorages).where(eq(fieldStorages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getInstances(id: string): Promise<DbFieldInstance[]> {
    const storage = await this.get(id);
    if (!storage) return [];

    return db
      .select()
      .from(fieldInstances)
      .where(
        and(
          eq(fieldInstances.entityType, storage.entityType),
          eq(fieldInstances.fieldName, storage.fieldName)
        )
      );
  }
}

export const fieldStorageRepo = new DatabaseFieldStorageRepo();

// =============================================================================
// FIELD INSTANCE STORAGE
// =============================================================================

export interface FieldInstanceRepo {
  list(options?: { entityType?: string; bundle?: string }): Promise<DbFieldInstance[]>;
  get(id: string): Promise<DbFieldInstance | undefined>;
  getForBundle(entityType: string, bundle: string): Promise<DbFieldInstance[]>;
  create(data: DbInsertFieldInstance): Promise<DbFieldInstance>;
  update(id: string, data: Partial<DbInsertFieldInstance>): Promise<DbFieldInstance | undefined>;
  delete(id: string): Promise<boolean>;
}

export class DatabaseFieldInstanceRepo implements FieldInstanceRepo {
  async list(options?: { entityType?: string; bundle?: string }): Promise<DbFieldInstance[]> {
    const conditions = [];

    if (options?.entityType) {
      conditions.push(eq(fieldInstances.entityType, options.entityType));
    }
    if (options?.bundle) {
      conditions.push(eq(fieldInstances.bundle, options.bundle));
    }

    if (conditions.length > 0) {
      return db.select().from(fieldInstances).where(and(...conditions));
    }

    return db.select().from(fieldInstances);
  }

  async get(id: string): Promise<DbFieldInstance | undefined> {
    const [result] = await db.select().from(fieldInstances).where(eq(fieldInstances.id, id));
    return result;
  }

  async getForBundle(entityType: string, bundle: string): Promise<DbFieldInstance[]> {
    return db
      .select()
      .from(fieldInstances)
      .where(and(eq(fieldInstances.entityType, entityType), eq(fieldInstances.bundle, bundle)));
  }

  async create(data: DbInsertFieldInstance): Promise<DbFieldInstance> {
    const id = data.id || `${data.entityType}.${data.bundle}.${data.fieldName}`;
    const [result] = await db.insert(fieldInstances).values({ ...data, id }).returning();
    return result;
  }

  async update(id: string, data: Partial<DbInsertFieldInstance>): Promise<DbFieldInstance | undefined> {
    const [result] = await db
      .update(fieldInstances)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(fieldInstances.id, id))
      .returning();
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(fieldInstances).where(eq(fieldInstances.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const fieldInstanceRepo = new DatabaseFieldInstanceRepo();

// =============================================================================
// DISPLAY STORAGE (VIEW & FORM)
// =============================================================================

export interface DisplayStorage {
  getViewDisplay(entityType: string, bundle: string, mode: string): Promise<DbViewDisplay | undefined>;
  saveViewDisplay(data: DbInsertViewDisplay): Promise<DbViewDisplay>;
  deleteViewDisplay(entityType: string, bundle: string, mode: string): Promise<boolean>;
  getViewDisplaysForBundle(entityType: string, bundle: string): Promise<DbViewDisplay[]>;

  getFormDisplay(entityType: string, bundle: string, mode: string): Promise<DbFormDisplay | undefined>;
  saveFormDisplay(data: DbInsertFormDisplay): Promise<DbFormDisplay>;
  deleteFormDisplay(entityType: string, bundle: string, mode: string): Promise<boolean>;
  getFormDisplaysForBundle(entityType: string, bundle: string): Promise<DbFormDisplay[]>;
}

export class DatabaseDisplayStorage implements DisplayStorage {
  // View displays
  async getViewDisplay(entityType: string, bundle: string, mode: string): Promise<DbViewDisplay | undefined> {
    const id = `${entityType}.${bundle}.${mode}`;
    const [result] = await db.select().from(viewDisplays).where(eq(viewDisplays.id, id));
    return result;
  }

  async saveViewDisplay(data: DbInsertViewDisplay): Promise<DbViewDisplay> {
    const id = data.id || `${data.entityType}.${data.bundle}.${data.mode}`;
    const existing = await this.getViewDisplay(data.entityType, data.bundle, data.mode);

    if (existing) {
      const [result] = await db
        .update(viewDisplays)
        .set({ ...data, id, updatedAt: new Date() })
        .where(eq(viewDisplays.id, id))
        .returning();
      return result;
    }

    const [result] = await db.insert(viewDisplays).values({ ...data, id }).returning();
    return result;
  }

  async deleteViewDisplay(entityType: string, bundle: string, mode: string): Promise<boolean> {
    const id = `${entityType}.${bundle}.${mode}`;
    const result = await db.delete(viewDisplays).where(eq(viewDisplays.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getViewDisplaysForBundle(entityType: string, bundle: string): Promise<DbViewDisplay[]> {
    return db
      .select()
      .from(viewDisplays)
      .where(and(eq(viewDisplays.entityType, entityType), eq(viewDisplays.bundle, bundle)));
  }

  // Form displays
  async getFormDisplay(entityType: string, bundle: string, mode: string): Promise<DbFormDisplay | undefined> {
    const id = `${entityType}.${bundle}.${mode}`;
    const [result] = await db.select().from(formDisplays).where(eq(formDisplays.id, id));
    return result;
  }

  async saveFormDisplay(data: DbInsertFormDisplay): Promise<DbFormDisplay> {
    const id = data.id || `${data.entityType}.${data.bundle}.${data.mode}`;
    const existing = await this.getFormDisplay(data.entityType, data.bundle, data.mode);

    if (existing) {
      const [result] = await db
        .update(formDisplays)
        .set({ ...data, id, updatedAt: new Date() })
        .where(eq(formDisplays.id, id))
        .returning();
      return result;
    }

    const [result] = await db.insert(formDisplays).values({ ...data, id }).returning();
    return result;
  }

  async deleteFormDisplay(entityType: string, bundle: string, mode: string): Promise<boolean> {
    const id = `${entityType}.${bundle}.${mode}`;
    const result = await db.delete(formDisplays).where(eq(formDisplays.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getFormDisplaysForBundle(entityType: string, bundle: string): Promise<DbFormDisplay[]> {
    return db
      .select()
      .from(formDisplays)
      .where(and(eq(formDisplays.entityType, entityType), eq(formDisplays.bundle, bundle)));
  }
}

export const displayStorage = new DatabaseDisplayStorage();

// =============================================================================
// TAXONOMY VOCABULARY STORAGE
// =============================================================================

export interface VocabularyStorage {
  list(options?: { rsesEnabled?: boolean }): Promise<DbTaxonomyVocabulary[]>;
  get(id: string): Promise<DbTaxonomyVocabulary | undefined>;
  create(data: DbInsertTaxonomyVocabulary): Promise<DbTaxonomyVocabulary>;
  update(id: string, data: Partial<DbInsertTaxonomyVocabulary>): Promise<DbTaxonomyVocabulary | undefined>;
  delete(id: string): Promise<boolean>;
  getTermCount(id: string): Promise<number>;
}

export class DatabaseVocabularyStorage implements VocabularyStorage {
  async list(options?: { rsesEnabled?: boolean }): Promise<DbTaxonomyVocabulary[]> {
    const all = await db.select().from(taxonomyVocabularies).orderBy(asc(taxonomyVocabularies.weight));

    if (options?.rsesEnabled !== undefined) {
      return all.filter((v) => v.rsesIntegration?.enabled === options.rsesEnabled);
    }

    return all;
  }

  async get(id: string): Promise<DbTaxonomyVocabulary | undefined> {
    const [result] = await db.select().from(taxonomyVocabularies).where(eq(taxonomyVocabularies.id, id));
    return result;
  }

  async create(data: DbInsertTaxonomyVocabulary): Promise<DbTaxonomyVocabulary> {
    // Same Zod/Drizzle nullability cast as DatabaseContentTypeStorage.create.
    const [result] = await db
      .insert(taxonomyVocabularies)
      .values(data as typeof taxonomyVocabularies.$inferInsert)
      .returning();
    return result;
  }

  async update(id: string, data: Partial<DbInsertTaxonomyVocabulary>): Promise<DbTaxonomyVocabulary | undefined> {
    const [result] = await db
      .update(taxonomyVocabularies)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof taxonomyVocabularies.$inferInsert>)
      .where(eq(taxonomyVocabularies.id, id))
      .returning();
    return result;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(taxonomyVocabularies).where(eq(taxonomyVocabularies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getTermCount(id: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabularyId, id));
    return Number(result?.count || 0);
  }
}

export const vocabularyStorage = new DatabaseVocabularyStorage();

// =============================================================================
// TAXONOMY TERM STORAGE
// =============================================================================

export interface TermStorage {
  list(
    vocabularyId: string,
    options?: PaginationOptions & { parentId?: number | null; name?: string }
  ): Promise<PaginatedResponse<DbTaxonomyTerm>>;
  get(id: number): Promise<DbTaxonomyTerm | undefined>;
  getByName(vocabularyId: string, name: string): Promise<DbTaxonomyTerm | undefined>;
  create(data: DbInsertTaxonomyTerm): Promise<DbTaxonomyTerm>;
  update(id: number, data: Partial<DbInsertTaxonomyTerm>): Promise<DbTaxonomyTerm | undefined>;
  delete(id: number): Promise<boolean>;
  getChildren(id: number): Promise<DbTaxonomyTerm[]>;
  bulkUpdateWeights(updates: Array<{ id: number; weight: number; parentIds?: number[] }>): Promise<number>;
  getTree(vocabularyId: string, maxDepth?: number): Promise<DbTaxonomyTerm[]>;
}

export class DatabaseTermStorage implements TermStorage {
  async list(
    vocabularyId: string,
    options?: PaginationOptions & { parentId?: number | null; name?: string }
  ): Promise<PaginatedResponse<DbTaxonomyTerm>> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = (page - 1) * limit;

    const conditions = [eq(taxonomyTerms.vocabularyId, vocabularyId)];

    if (options?.name) {
      conditions.push(like(taxonomyTerms.name, safeLikePattern(options.name)));
    }

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(taxonomyTerms)
      .where(and(...conditions));
    const total = Number(countResult?.count || 0);

    // Get data
    const data = await db
      .select()
      .from(taxonomyTerms)
      .where(and(...conditions))
      .orderBy(asc(taxonomyTerms.weight), asc(taxonomyTerms.name))
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async get(id: number): Promise<DbTaxonomyTerm | undefined> {
    const [result] = await db.select().from(taxonomyTerms).where(eq(taxonomyTerms.id, id));
    return result;
  }

  async getByName(vocabularyId: string, name: string): Promise<DbTaxonomyTerm | undefined> {
    const [result] = await db
      .select()
      .from(taxonomyTerms)
      .where(and(eq(taxonomyTerms.vocabularyId, vocabularyId), eq(taxonomyTerms.name, name)));
    return result;
  }

  async create(data: DbInsertTaxonomyTerm): Promise<DbTaxonomyTerm> {
    const [result] = await db
      .insert(taxonomyTerms)
      .values({ ...data, uuid: uuidv4() } as typeof taxonomyTerms.$inferInsert)
      .returning();
    return result;
  }

  async update(id: number, data: Partial<DbInsertTaxonomyTerm>): Promise<DbTaxonomyTerm | undefined> {
    const [result] = await db
      .update(taxonomyTerms)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof taxonomyTerms.$inferInsert>)
      .where(eq(taxonomyTerms.id, id))
      .returning();
    return result;
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(taxonomyTerms).where(eq(taxonomyTerms.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getChildren(id: number): Promise<DbTaxonomyTerm[]> {
    // PostgreSQL JSONB contains check
    return db
      .select()
      .from(taxonomyTerms)
      .where(sql`${taxonomyTerms.parentIds} @> ${JSON.stringify([id])}::jsonb`);
  }

  async bulkUpdateWeights(
    updates: Array<{ id: number; weight: number; parentIds?: number[] }>
  ): Promise<number> {
    let updated = 0;
    for (const update of updates) {
      const data: Partial<DbInsertTaxonomyTerm> = { weight: update.weight };
      if (update.parentIds !== undefined) {
        data.parentIds = update.parentIds;
      }
      const result = await db
        .update(taxonomyTerms)
        .set({ ...data, updatedAt: new Date() } as Partial<typeof taxonomyTerms.$inferInsert>)
        .where(eq(taxonomyTerms.id, update.id));
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  async getTree(vocabularyId: string, maxDepth: number = 5): Promise<DbTaxonomyTerm[]> {
    // Get all terms ordered by weight
    return db
      .select()
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabularyId, vocabularyId))
      .orderBy(asc(taxonomyTerms.weight), asc(taxonomyTerms.name));
  }
}

export const termStorage = new DatabaseTermStorage();

// =============================================================================
// CONTENT STORAGE
// =============================================================================

export interface ContentStorage {
  list(
    options?: PaginationOptions & {
      type?: string;
      published?: boolean;
      promoted?: boolean;
      sticky?: boolean;
      search?: string;
      sort?: "created" | "updated" | "title";
      order?: "asc" | "desc";
    }
  ): Promise<PaginatedResponse<DbContent>>;
  get(id: number): Promise<DbContent | undefined>;
  getByUuid(uuid: string): Promise<DbContent | undefined>;
  create(data: DbInsertContent): Promise<DbContent>;
  update(id: number, data: Partial<DbInsertContent>): Promise<DbContent | undefined>;
  delete(id: number): Promise<boolean>;
  setPublished(id: number, published: boolean): Promise<DbContent | undefined>;
  bulkUpdate(ids: number[], data: Partial<DbInsertContent>): Promise<number>;
  bulkDelete(ids: number[]): Promise<number>;
}

export class DatabaseContentStorage implements ContentStorage {
  async list(
    options?: PaginationOptions & {
      type?: string;
      published?: boolean;
      promoted?: boolean;
      sticky?: boolean;
      search?: string;
      sort?: "created" | "updated" | "title";
      order?: "asc" | "desc";
    }
  ): Promise<PaginatedResponse<DbContent>> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (options?.type) {
      conditions.push(eq(contents.type, options.type));
    }
    if (options?.published !== undefined) {
      conditions.push(eq(contents.published, options.published));
    }
    if (options?.promoted !== undefined) {
      conditions.push(eq(contents.promoted, options.promoted));
    }
    if (options?.sticky !== undefined) {
      conditions.push(eq(contents.sticky, options.sticky));
    }
    if (options?.search) {
      conditions.push(like(contents.title, safeLikePattern(options.search)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countQuery = db.select({ count: count() }).from(contents);
    if (whereClause) {
      countQuery.where(whereClause);
    }
    const [countResult] = await countQuery;
    const total = Number(countResult?.count || 0);

    // Determine sort order
    let orderBy;
    const sortField = options?.sort || "created";
    const sortOrder = options?.order || "desc";

    switch (sortField) {
      case "title":
        orderBy = sortOrder === "asc" ? asc(contents.title) : desc(contents.title);
        break;
      case "updated":
        orderBy = sortOrder === "asc" ? asc(contents.updatedAt) : desc(contents.updatedAt);
        break;
      default:
        orderBy = sortOrder === "asc" ? asc(contents.createdAt) : desc(contents.createdAt);
    }

    // Get data
    let dataQuery = db.select().from(contents).orderBy(orderBy).limit(limit).offset(offset);
    if (whereClause) {
      dataQuery = dataQuery.where(whereClause) as typeof dataQuery;
    }
    const data = await dataQuery;

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async get(id: number): Promise<DbContent | undefined> {
    const [result] = await db.select().from(contents).where(eq(contents.id, id));
    return result;
  }

  async getByUuid(uuid: string): Promise<DbContent | undefined> {
    const [result] = await db.select().from(contents).where(eq(contents.uuid, uuid));
    return result;
  }

  async create(data: DbInsertContent): Promise<DbContent> {
    const [result] = await db
      .insert(contents)
      .values({ ...data, uuid: uuidv4() } as typeof contents.$inferInsert)
      .returning();
    return result;
  }

  async update(id: number, data: Partial<DbInsertContent>): Promise<DbContent | undefined> {
    const [result] = await db
      .update(contents)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof contents.$inferInsert>)
      .where(eq(contents.id, id))
      .returning();
    return result;
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(contents).where(eq(contents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async setPublished(id: number, published: boolean): Promise<DbContent | undefined> {
    return this.update(id, { published });
  }

  async bulkUpdate(ids: number[], data: Partial<DbInsertContent>): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db
      .update(contents)
      .set({ ...data, updatedAt: new Date() } as Partial<typeof contents.$inferInsert>)
      .where(inArray(contents.id, ids));
    return result.rowCount ?? 0;
  }

  async bulkDelete(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.delete(contents).where(inArray(contents.id, ids));
    return result.rowCount ?? 0;
  }
}

export const contentStorage = new DatabaseContentStorage();

// =============================================================================
// CONTENT REVISION STORAGE
// =============================================================================

export interface RevisionStorage {
  list(contentId: number, options?: PaginationOptions): Promise<PaginatedResponse<DbContentRevision>>;
  get(contentId: number, revisionNumber: number): Promise<DbContentRevision | undefined>;
  create(data: DbInsertContentRevision): Promise<DbContentRevision>;
  getLatest(contentId: number): Promise<DbContentRevision | undefined>;
}

export class DatabaseRevisionStorage implements RevisionStorage {
  async list(contentId: number, options?: PaginationOptions): Promise<PaginatedResponse<DbContentRevision>> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = (page - 1) * limit;

    const [countResult] = await db
      .select({ count: count() })
      .from(contentRevisions)
      .where(eq(contentRevisions.contentId, contentId));
    const total = Number(countResult?.count || 0);

    const data = await db
      .select()
      .from(contentRevisions)
      .where(eq(contentRevisions.contentId, contentId))
      .orderBy(desc(contentRevisions.revisionNumber))
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async get(contentId: number, revisionNumber: number): Promise<DbContentRevision | undefined> {
    const [result] = await db
      .select()
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.contentId, contentId),
          eq(contentRevisions.revisionNumber, revisionNumber)
        )
      );
    return result;
  }

  async create(data: DbInsertContentRevision): Promise<DbContentRevision> {
    const [result] = await db.insert(contentRevisions).values(data).returning();
    return result;
  }

  async getLatest(contentId: number): Promise<DbContentRevision | undefined> {
    const [result] = await db
      .select()
      .from(contentRevisions)
      .where(eq(contentRevisions.contentId, contentId))
      .orderBy(desc(contentRevisions.revisionNumber))
      .limit(1);
    return result;
  }
}

export const revisionStorage = new DatabaseRevisionStorage();

// =============================================================================
// FIELD DATA STORAGE
// =============================================================================

export interface FieldDataStorage {
  getForEntity(
    entityType: string,
    entityId: number,
    revisionId?: number
  ): Promise<Record<string, DbFieldData[]>>;
  getField(
    entityType: string,
    entityId: number,
    fieldName: string,
    revisionId?: number
  ): Promise<DbFieldData[]>;
  setField(
    entityType: string,
    entityId: number,
    fieldName: string,
    values: Array<Record<string, unknown>>,
    revisionId?: number
  ): Promise<void>;
  deleteForEntity(entityType: string, entityId: number): Promise<void>;
  deleteField(entityType: string, entityId: number, fieldName: string): Promise<void>;
}

export class DatabaseFieldDataStorage implements FieldDataStorage {
  async getForEntity(
    entityType: string,
    entityId: number,
    revisionId?: number
  ): Promise<Record<string, DbFieldData[]>> {
    const conditions = [
      eq(fieldData.entityType, entityType),
      eq(fieldData.entityId, entityId),
    ];

    if (revisionId !== undefined) {
      conditions.push(eq(fieldData.revisionId, revisionId));
    } else {
      conditions.push(isNull(fieldData.revisionId));
    }

    const data = await db
      .select()
      .from(fieldData)
      .where(and(...conditions))
      .orderBy(asc(fieldData.delta));

    // Group by field name
    const result: Record<string, DbFieldData[]> = {};
    for (const row of data) {
      if (!result[row.fieldName]) {
        result[row.fieldName] = [];
      }
      result[row.fieldName].push(row);
    }

    return result;
  }

  async getField(
    entityType: string,
    entityId: number,
    fieldName: string,
    revisionId?: number
  ): Promise<DbFieldData[]> {
    const conditions = [
      eq(fieldData.entityType, entityType),
      eq(fieldData.entityId, entityId),
      eq(fieldData.fieldName, fieldName),
    ];

    if (revisionId !== undefined) {
      conditions.push(eq(fieldData.revisionId, revisionId));
    } else {
      conditions.push(isNull(fieldData.revisionId));
    }

    return db
      .select()
      .from(fieldData)
      .where(and(...conditions))
      .orderBy(asc(fieldData.delta));
  }

  async setField(
    entityType: string,
    entityId: number,
    fieldName: string,
    values: Array<Record<string, unknown>>,
    revisionId?: number
  ): Promise<void> {
    // Delete existing values
    await this.deleteField(entityType, entityId, fieldName);

    // Insert new values
    if (values.length > 0) {
      const rows = values.map((value, delta) => ({
        entityType,
        entityId,
        fieldName,
        revisionId: revisionId ?? null,
        delta,
        value,
      }));

      await db.insert(fieldData).values(rows);
    }
  }

  async deleteForEntity(entityType: string, entityId: number): Promise<void> {
    await db
      .delete(fieldData)
      .where(and(eq(fieldData.entityType, entityType), eq(fieldData.entityId, entityId)));
  }

  async deleteField(entityType: string, entityId: number, fieldName: string): Promise<void> {
    await db
      .delete(fieldData)
      .where(
        and(
          eq(fieldData.entityType, entityType),
          eq(fieldData.entityId, entityId),
          eq(fieldData.fieldName, fieldName)
        )
      );
  }
}

export const fieldDataStorage = new DatabaseFieldDataStorage();
