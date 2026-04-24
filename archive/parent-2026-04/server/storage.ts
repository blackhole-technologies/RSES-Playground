import { db } from "./db";
import {
  configs,
  projects,
  configVersions,
  activityLog,
  moduleConfigs,
  type InsertConfig,
  type Config,
  type InsertProject,
  type Project,
  type InsertConfigVersion,
  type ConfigVersion,
  type InsertActivityLogEntry,
  type ActivityLogEntry,
  type InsertModuleConfig,
  type ModuleConfig,
} from "@shared/schema";
import { eq, desc, sql, count, and, gte, lte, inArray, asc } from "drizzle-orm";

/**
 * Pagination options for list queries.
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * Paginated response structure.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface IStorage {
  getConfigs(options?: PaginationOptions): Promise<Config[]>;
  getConfigsPaginated(options?: PaginationOptions): Promise<PaginatedResponse<Config>>;
  getConfig(id: number): Promise<Config | undefined>;
  createConfig(config: InsertConfig): Promise<Config>;
  updateConfig(id: number, updates: Partial<InsertConfig>): Promise<Config>;
  deleteConfig(id: number): Promise<void>;
  countConfigs(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  /**
   * Get all configs (legacy method for backward compatibility).
   */
  async getConfigs(options?: PaginationOptions): Promise<Config[]> {
    if (options?.page || options?.limit) {
      const result = await this.getConfigsPaginated(options);
      return result.data;
    }
    return await db.select().from(configs).orderBy(desc(configs.createdAt));
  }

  /**
   * Get configs with pagination support.
   * Default: page 1, limit 50
   */
  async getConfigsPaginated(options?: PaginationOptions): Promise<PaginatedResponse<Config>> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await db.select({ count: count() }).from(configs);
    const total = Number(countResult?.count || 0);

    // Get paginated data
    const data = await db
      .select()
      .from(configs)
      .orderBy(desc(configs.createdAt))
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

  async getConfig(id: number): Promise<Config | undefined> {
    const [config] = await db.select().from(configs).where(eq(configs.id, id));
    return config;
  }

  async createConfig(insertConfig: InsertConfig): Promise<Config> {
    const [config] = await db.insert(configs).values(insertConfig).returning();
    return config;
  }

  async updateConfig(id: number, updates: Partial<InsertConfig>): Promise<Config> {
    const [config] = await db
      .update(configs)
      .set(updates)
      .where(eq(configs.id, id))
      .returning();
    return config;
  }

  async deleteConfig(id: number): Promise<void> {
    await db.delete(configs).where(eq(configs.id, id));
  }

  /**
   * Count total configs (useful for pagination without fetching all data).
   */
  async countConfigs(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(configs);
    return Number(result?.count || 0);
  }
}

export const storage = new DatabaseStorage();

// === Project Storage (Phase 6 - CMS Features) ===

export interface ProjectStorage {
  getProjects(options?: PaginationOptions): Promise<PaginatedResponse<Project>>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectByPath(path: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  upsertProjects(projectsData: InsertProject[]): Promise<Project[]>;
  bulkUpdateStatus(ids: number[], status: Project["status"]): Promise<void>;
}

export class DatabaseProjectStorage implements ProjectStorage {
  async getProjects(options?: PaginationOptions): Promise<PaginatedResponse<Project>> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = (page - 1) * limit;

    const [countResult] = await db.select({ count: count() }).from(projects);
    const total = Number(countResult?.count || 0);

    const data = await db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt))
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

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectByPath(path: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.path, path));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project> {
    const [updated] = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async upsertProjects(projectsData: InsertProject[]): Promise<Project[]> {
    if (projectsData.length === 0) return [];

    const results: Project[] = [];

    for (const project of projectsData) {
      const existing = await this.getProjectByPath(project.path);
      if (existing) {
        const updated = await this.updateProject(existing.id, {
          ...project,
          lastScannedAt: new Date(),
        });
        results.push(updated);
      } else {
        const created = await this.createProject({
          ...project,
          lastScannedAt: new Date(),
        });
        results.push(created);
      }
    }

    return results;
  }

  async bulkUpdateStatus(ids: number[], status: Project["status"]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(projects)
      .set({ status, updatedAt: new Date() })
      .where(inArray(projects.id, ids));
  }
}

export const projectStorage = new DatabaseProjectStorage();

// === Config Version Storage (Phase 6 - CMS Features) ===

export interface VersionStorage {
  getVersions(configId: number): Promise<ConfigVersion[]>;
  getVersion(configId: number, version: number): Promise<ConfigVersion | undefined>;
  getLatestVersion(configId: number): Promise<ConfigVersion | undefined>;
  createVersion(version: InsertConfigVersion): Promise<ConfigVersion>;
  getVersionCount(configId: number): Promise<number>;
}

export class DatabaseVersionStorage implements VersionStorage {
  async getVersions(configId: number): Promise<ConfigVersion[]> {
    return db
      .select()
      .from(configVersions)
      .where(eq(configVersions.configId, configId))
      .orderBy(desc(configVersions.version));
  }

  async getVersion(configId: number, version: number): Promise<ConfigVersion | undefined> {
    const [result] = await db
      .select()
      .from(configVersions)
      .where(and(eq(configVersions.configId, configId), eq(configVersions.version, version)));
    return result;
  }

  async getLatestVersion(configId: number): Promise<ConfigVersion | undefined> {
    const [result] = await db
      .select()
      .from(configVersions)
      .where(eq(configVersions.configId, configId))
      .orderBy(desc(configVersions.version))
      .limit(1);
    return result;
  }

  async createVersion(version: InsertConfigVersion): Promise<ConfigVersion> {
    // Get the next version number
    const latest = await this.getLatestVersion(version.configId);
    const nextVersion = (latest?.version || 0) + 1;

    const [created] = await db
      .insert(configVersions)
      .values({ ...version, version: nextVersion })
      .returning();
    return created;
  }

  async getVersionCount(configId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(configVersions)
      .where(eq(configVersions.configId, configId));
    return Number(result?.count || 0);
  }
}

export const versionStorage = new DatabaseVersionStorage();

// === Activity Log Storage (Phase 6 - CMS Features) ===

export interface ActivityFilter {
  entityType?: string;
  entityId?: number;
  action?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface ActivityStorage {
  getActivity(filter?: ActivityFilter, options?: PaginationOptions): Promise<PaginatedResponse<ActivityLogEntry>>;
  logActivity(entry: InsertActivityLogEntry): Promise<ActivityLogEntry>;
  getRecentActivity(limit?: number): Promise<ActivityLogEntry[]>;
}

export class DatabaseActivityStorage implements ActivityStorage {
  async getActivity(
    filter?: ActivityFilter,
    options?: PaginationOptions
  ): Promise<PaginatedResponse<ActivityLogEntry>> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filter?.entityType) {
      conditions.push(eq(activityLog.entityType, filter.entityType));
    }
    if (filter?.entityId) {
      conditions.push(eq(activityLog.entityId, filter.entityId));
    }
    if (filter?.action) {
      conditions.push(eq(activityLog.action, filter.action));
    }
    if (filter?.userId) {
      conditions.push(eq(activityLog.userId, filter.userId));
    }
    if (filter?.startDate) {
      conditions.push(gte(activityLog.createdAt, filter.startDate));
    }
    if (filter?.endDate) {
      conditions.push(lte(activityLog.createdAt, filter.endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(activityLog)
      .where(whereClause);
    const total = Number(countResult?.count || 0);

    const data = await db
      .select()
      .from(activityLog)
      .where(whereClause)
      .orderBy(desc(activityLog.createdAt))
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

  async logActivity(entry: InsertActivityLogEntry): Promise<ActivityLogEntry> {
    const [created] = await db.insert(activityLog).values(entry).returning();
    return created;
  }

  async getRecentActivity(limit: number = 20): Promise<ActivityLogEntry[]> {
    return db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);
  }
}

export const activityStorage = new DatabaseActivityStorage();

// === Module Config Storage (Phase 6 - Kernel Config Persistence) ===

export interface ModuleConfigStorage {
  getModuleConfig(moduleId: string): Promise<ModuleConfig | undefined>;
  getAllModuleConfigs(): Promise<ModuleConfig[]>;
  saveModuleConfig(moduleId: string, config: Record<string, unknown>): Promise<ModuleConfig>;
  deleteModuleConfig(moduleId: string): Promise<void>;
}

export class DatabaseModuleConfigStorage implements ModuleConfigStorage {
  async getModuleConfig(moduleId: string): Promise<ModuleConfig | undefined> {
    const [result] = await db
      .select()
      .from(moduleConfigs)
      .where(eq(moduleConfigs.moduleId, moduleId));
    return result;
  }

  async getAllModuleConfigs(): Promise<ModuleConfig[]> {
    return db.select().from(moduleConfigs).orderBy(asc(moduleConfigs.moduleId));
  }

  async saveModuleConfig(
    moduleId: string,
    config: Record<string, unknown>
  ): Promise<ModuleConfig> {
    const existing = await this.getModuleConfig(moduleId);

    if (existing) {
      const [updated] = await db
        .update(moduleConfigs)
        .set({ config, updatedAt: new Date() })
        .where(eq(moduleConfigs.moduleId, moduleId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(moduleConfigs)
      .values({ moduleId, config })
      .returning();
    return created;
  }

  async deleteModuleConfig(moduleId: string): Promise<void> {
    await db.delete(moduleConfigs).where(eq(moduleConfigs.moduleId, moduleId));
  }
}

export const moduleConfigStorage = new DatabaseModuleConfigStorage();
