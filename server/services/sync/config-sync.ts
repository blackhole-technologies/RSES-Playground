/**
 * @file config-sync.ts
 * @description Configuration Synchronization Manager
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * Manages configuration export/import and synchronization across sites:
 * - Config export/import packages
 * - Environment-specific overrides
 * - Schema migration synchronization
 * - Module state synchronization
 */

import { EventEmitter } from "events";
import { createHash } from "crypto";
import {
  ConfigExport,
  ConfigItem,
  ConfigMigration,
  ConfigMigrationStep,
  EnvironmentOverride,
  SiteIdentity,
  SyncError,
  SyncResult,
} from "./types";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Config sync state
 */
export type ConfigSyncState =
  | "idle"
  | "exporting"
  | "importing"
  | "migrating"
  | "validating"
  | "complete"
  | "error";

/**
 * Config dependency
 */
export interface ConfigDependency {
  type: string;
  id: string;
  required: boolean;
}

/**
 * Config validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  missingDependencies: ConfigDependency[];
}

/**
 * Config sync options
 */
export interface ConfigSyncOptions {
  /** Source site */
  source?: SiteIdentity;
  /** Target site */
  target?: SiteIdentity;
  /** Config types to sync */
  configTypes?: string[];
  /** Apply environment overrides */
  applyOverrides?: boolean;
  /** Environment name */
  environment?: string;
  /** Validate before import */
  validateBeforeImport?: boolean;
  /** Run migrations */
  runMigrations?: boolean;
  /** Dry run (don't actually apply) */
  dryRun?: boolean;
}

/**
 * Config import result
 */
export interface ConfigImportResult {
  success: boolean;
  created: ConfigItem[];
  updated: ConfigItem[];
  deleted: ConfigItem[];
  skipped: ConfigItem[];
  errors: Array<{ item: ConfigItem; error: string }>;
  migrationsRun: ConfigMigration[];
}

// =============================================================================
// CONFIG STORE INTERFACE
// =============================================================================

/**
 * Configuration storage interface
 */
export interface ConfigStore {
  getConfig(type: string, id: string): Promise<Record<string, unknown> | null>;
  getAllConfigs(type?: string): Promise<ConfigItem[]>;
  setConfig(item: ConfigItem): Promise<void>;
  deleteConfig(type: string, id: string): Promise<void>;
  getSchemaVersion(): Promise<string>;
  setSchemaVersion(version: string): Promise<void>;
}

// =============================================================================
// CONFIG EXPORT SERVICE
// =============================================================================

/**
 * Configuration export service
 */
export class ConfigExportService {
  private configStore: ConfigStore;
  private siteId: string;

  constructor(siteId: string, configStore: ConfigStore) {
    this.siteId = siteId;
    this.configStore = configStore;
  }

  /**
   * Export all configuration
   */
  async exportAll(name?: string): Promise<ConfigExport> {
    const items = await this.configStore.getAllConfigs();
    return this.createExport(name || "full-export", items);
  }

  /**
   * Export specific config types
   */
  async exportByTypes(types: string[], name?: string): Promise<ConfigExport> {
    const allItems = await this.configStore.getAllConfigs();
    const filteredItems = allItems.filter((item) => types.includes(item.type));
    return this.createExport(name || `export-${types.join("-")}`, filteredItems);
  }

  /**
   * Export specific configs by ID
   */
  async exportByIds(
    configs: Array<{ type: string; id: string }>,
    name?: string
  ): Promise<ConfigExport> {
    const items: ConfigItem[] = [];

    for (const { type, id } of configs) {
      const data = await this.configStore.getConfig(type, id);
      if (data) {
        items.push({
          type,
          id,
          name: data.label as string || id,
          data,
          dependencies: this.extractDependencies(type, data),
          uuid: data.uuid as string || uuidv4(),
        });
      }
    }

    // Resolve dependencies
    await this.resolveDependencies(items);

    return this.createExport(name || "selective-export", items);
  }

  /**
   * Create export package
   */
  private async createExport(name: string, items: ConfigItem[]): Promise<ConfigExport> {
    const schemaVersion = await this.configStore.getSchemaVersion();
    const dependencies = this.calculateDependencies(items);

    const exportData: ConfigExport = {
      id: uuidv4(),
      name,
      sourceSite: this.siteId,
      exportedAt: new Date(),
      schemaVersion,
      items,
      dependencies,
      checksum: "",
    };

    // Calculate checksum
    exportData.checksum = this.calculateChecksum(exportData);

    return exportData;
  }

  /**
   * Extract dependencies from config data
   */
  private extractDependencies(
    type: string,
    data: Record<string, unknown>
  ): string[] {
    const deps: string[] = [];

    switch (type) {
      case "field_instance":
        // Field instance depends on field storage
        const fieldName = data.fieldName as string;
        const entityType = data.entityType as string;
        if (fieldName && entityType) {
          deps.push(`field_storage:${entityType}.${fieldName}`);
        }
        // And on content type
        const bundle = data.bundle as string;
        if (bundle) {
          deps.push(`content_type:${bundle}`);
        }
        break;

      case "field_storage":
        // No dependencies
        break;

      case "view_display":
      case "form_display":
        // Depends on content type
        const displayBundle = data.bundle as string;
        if (displayBundle) {
          deps.push(`content_type:${displayBundle}`);
        }
        break;

      case "vocabulary":
        // May depend on RSES config
        const rsesConfig = (data.rsesIntegration as Record<string, unknown>)?.configId;
        if (rsesConfig) {
          deps.push(`rses_config:${rsesConfig}`);
        }
        break;
    }

    return deps;
  }

  /**
   * Resolve and add dependencies to export
   */
  private async resolveDependencies(items: ConfigItem[]): Promise<void> {
    const seen = new Set(items.map((i) => `${i.type}:${i.id}`));
    const queue = [...items];

    while (queue.length > 0) {
      const item = queue.shift()!;

      for (const depStr of item.dependencies) {
        if (seen.has(depStr)) continue;
        seen.add(depStr);

        const [type, id] = depStr.split(":");
        const data = await this.configStore.getConfig(type, id);

        if (data) {
          const depItem: ConfigItem = {
            type,
            id,
            name: data.label as string || id,
            data,
            dependencies: this.extractDependencies(type, data),
            uuid: data.uuid as string || uuidv4(),
          };
          items.push(depItem);
          queue.push(depItem);
        }
      }
    }
  }

  /**
   * Calculate all dependencies
   */
  private calculateDependencies(items: ConfigItem[]): string[] {
    const deps = new Set<string>();
    const provided = new Set(items.map((i) => `${i.type}:${i.id}`));

    for (const item of items) {
      for (const dep of item.dependencies) {
        if (!provided.has(dep)) {
          deps.add(dep);
        }
      }
    }

    return Array.from(deps);
  }

  /**
   * Calculate checksum for export
   */
  private calculateChecksum(exportData: ConfigExport): string {
    const { checksum, ...rest } = exportData;
    return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
  }
}

// =============================================================================
// CONFIG IMPORT SERVICE
// =============================================================================

/**
 * Configuration import service
 */
export class ConfigImportService {
  private configStore: ConfigStore;
  private siteId: string;
  private overrides: Map<string, EnvironmentOverride[]>;

  constructor(siteId: string, configStore: ConfigStore) {
    this.siteId = siteId;
    this.configStore = configStore;
    this.overrides = new Map();
  }

  /**
   * Add environment override
   */
  addOverride(override: EnvironmentOverride): void {
    const key = `${override.configType}:${override.configId}`;
    const existing = this.overrides.get(key) || [];
    existing.push(override);
    existing.sort((a, b) => a.priority - b.priority);
    this.overrides.set(key, existing);
  }

  /**
   * Import configuration
   */
  async import(
    exportData: ConfigExport,
    options: ConfigSyncOptions = {}
  ): Promise<ConfigImportResult> {
    const result: ConfigImportResult = {
      success: true,
      created: [],
      updated: [],
      deleted: [],
      skipped: [],
      errors: [],
      migrationsRun: [],
    };

    // Validate checksum
    const expectedChecksum = exportData.checksum;
    const { checksum, ...rest } = exportData;
    const actualChecksum = createHash("sha256")
      .update(JSON.stringify(rest))
      .digest("hex");

    if (expectedChecksum !== actualChecksum) {
      throw new Error("Export data corrupted: checksum mismatch");
    }

    // Validate before import
    if (options.validateBeforeImport !== false) {
      const validation = await this.validate(exportData);
      if (!validation.valid) {
        throw new Error(
          `Validation failed: ${validation.errors.map((e) => e.message).join(", ")}`
        );
      }
    }

    // Run migrations if needed
    if (options.runMigrations) {
      const currentVersion = await this.configStore.getSchemaVersion();
      if (currentVersion !== exportData.schemaVersion) {
        const migrations = await this.getMigrations(
          currentVersion,
          exportData.schemaVersion
        );
        for (const migration of migrations) {
          await this.runMigration(migration);
          result.migrationsRun.push(migration);
        }
      }
    }

    // Sort items by dependency order
    const sortedItems = this.topologicalSort(exportData.items);

    // Import each item
    for (const item of sortedItems) {
      try {
        // Apply type filter
        if (options.configTypes && !options.configTypes.includes(item.type)) {
          result.skipped.push(item);
          continue;
        }

        // Apply environment overrides
        let data = { ...item.data };
        if (options.applyOverrides && options.environment) {
          data = this.applyOverrides(item.type, item.id, data, options.environment);
        }

        // Check if exists
        const existing = await this.configStore.getConfig(item.type, item.id);

        if (options.dryRun) {
          if (existing) {
            result.updated.push(item);
          } else {
            result.created.push(item);
          }
          continue;
        }

        // Import
        await this.configStore.setConfig({
          ...item,
          data,
        });

        if (existing) {
          result.updated.push(item);
        } else {
          result.created.push(item);
        }
      } catch (error) {
        result.success = false;
        result.errors.push({
          item,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Validate export before import
   */
  async validate(exportData: ConfigExport): Promise<ConfigValidationResult> {
    const result: ConfigValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      missingDependencies: [],
    };

    // Check dependencies
    const providedConfigs = new Set(
      exportData.items.map((i) => `${i.type}:${i.id}`)
    );

    for (const dep of exportData.dependencies) {
      const [type, id] = dep.split(":");
      const exists = await this.configStore.getConfig(type, id);

      if (!exists) {
        result.missingDependencies.push({ type, id, required: true });
      }
    }

    if (result.missingDependencies.length > 0) {
      result.valid = false;
      result.errors.push({
        path: "dependencies",
        message: `Missing dependencies: ${result.missingDependencies
          .map((d) => `${d.type}:${d.id}`)
          .join(", ")}`,
      });
    }

    // Validate each item
    for (const item of exportData.items) {
      const itemErrors = this.validateItem(item);
      if (itemErrors.length > 0) {
        result.valid = false;
        for (const error of itemErrors) {
          result.errors.push({
            path: `${item.type}.${item.id}`,
            message: error,
          });
        }
      }
    }

    return result;
  }

  /**
   * Validate a single config item
   */
  private validateItem(item: ConfigItem): string[] {
    const errors: string[] = [];

    // Required fields
    if (!item.type) errors.push("Missing type");
    if (!item.id) errors.push("Missing id");
    if (!item.data) errors.push("Missing data");

    // Type-specific validation
    switch (item.type) {
      case "content_type":
        if (!item.data.id) errors.push("Content type missing id");
        if (!item.data.label) errors.push("Content type missing label");
        break;

      case "field_storage":
        if (!item.data.fieldName) errors.push("Field storage missing fieldName");
        if (!item.data.type) errors.push("Field storage missing type");
        break;

      case "field_instance":
        if (!item.data.bundle) errors.push("Field instance missing bundle");
        break;
    }

    return errors;
  }

  /**
   * Apply environment overrides to config data
   */
  private applyOverrides(
    type: string,
    id: string,
    data: Record<string, unknown>,
    environment: string
  ): Record<string, unknown> {
    const key = `${type}:${id}`;
    const overrides = this.overrides.get(key) || [];

    let result = { ...data };

    for (const override of overrides) {
      if (override.environment === environment && override.active) {
        result = this.deepMerge(result, override.overrides);
      }
    }

    return result;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value === null) {
        delete result[key];
      } else if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.deepMerge(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Topological sort of config items by dependencies
   */
  private topologicalSort(items: ConfigItem[]): ConfigItem[] {
    const result: ConfigItem[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    const itemMap = new Map(items.map((i) => [`${i.type}:${i.id}`, i]));

    const visit = (key: string) => {
      if (visited.has(key)) return;
      if (temp.has(key)) {
        // Circular dependency - just add it
        return;
      }

      const item = itemMap.get(key);
      if (!item) return;

      temp.add(key);

      for (const dep of item.dependencies) {
        visit(dep);
      }

      temp.delete(key);
      visited.add(key);
      result.push(item);
    };

    for (const item of items) {
      visit(`${item.type}:${item.id}`);
    }

    return result;
  }

  /**
   * Get migrations between versions
   */
  private async getMigrations(
    from: string,
    to: string
  ): Promise<ConfigMigration[]> {
    // In production, fetch from migration registry
    return [];
  }

  /**
   * Run a migration
   */
  private async runMigration(migration: ConfigMigration): Promise<void> {
    for (const step of migration.steps) {
      await this.runMigrationStep(step);
    }
    await this.configStore.setSchemaVersion(migration.targetVersion);
  }

  /**
   * Run a single migration step
   */
  private async runMigrationStep(step: ConfigMigrationStep): Promise<void> {
    // Migration step execution
    switch (step.type) {
      case "add":
        // Add new field/config
        break;
      case "remove":
        // Remove field/config
        break;
      case "rename":
        // Rename field/config
        break;
      case "transform":
        // Transform data
        break;
      case "move":
        // Move data
        break;
    }
  }
}

// =============================================================================
// CONFIG SYNC MANAGER
// =============================================================================

/**
 * Events emitted by config sync manager
 */
export interface ConfigSyncEvents {
  state_changed: (state: ConfigSyncState) => void;
  export_complete: (exportData: ConfigExport) => void;
  import_complete: (result: ConfigImportResult) => void;
  validation_complete: (result: ConfigValidationResult) => void;
  migration_started: (migration: ConfigMigration) => void;
  migration_complete: (migration: ConfigMigration) => void;
  error: (error: SyncError) => void;
}

/**
 * Configuration synchronization manager
 */
export class ConfigSyncManager extends EventEmitter {
  private state: ConfigSyncState;
  private exportService: ConfigExportService;
  private importService: ConfigImportService;
  private configStore: ConfigStore;
  private siteId: string;
  private moduleStates: Map<string, ModuleState>;

  constructor(siteId: string, configStore: ConfigStore) {
    super();

    this.siteId = siteId;
    this.configStore = configStore;
    this.state = "idle";
    this.exportService = new ConfigExportService(siteId, configStore);
    this.importService = new ConfigImportService(siteId, configStore);
    this.moduleStates = new Map();
  }

  /**
   * Export configuration
   */
  async export(options: {
    name?: string;
    types?: string[];
    items?: Array<{ type: string; id: string }>;
  } = {}): Promise<ConfigExport> {
    this.setState("exporting");

    try {
      let exportData: ConfigExport;

      if (options.items) {
        exportData = await this.exportService.exportByIds(options.items, options.name);
      } else if (options.types) {
        exportData = await this.exportService.exportByTypes(options.types, options.name);
      } else {
        exportData = await this.exportService.exportAll(options.name);
      }

      this.emit("export_complete", exportData);
      this.setState("complete");

      return exportData;
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  /**
   * Import configuration
   */
  async import(
    exportData: ConfigExport,
    options: ConfigSyncOptions = {}
  ): Promise<ConfigImportResult> {
    this.setState("validating");

    try {
      // Validate first
      const validation = await this.importService.validate(exportData);
      this.emit("validation_complete", validation);

      if (!validation.valid && options.validateBeforeImport !== false) {
        throw new Error("Validation failed");
      }

      this.setState("importing");

      const result = await this.importService.import(exportData, options);

      this.emit("import_complete", result);
      this.setState("complete");

      return result;
    } catch (error) {
      this.setState("error");
      throw error;
    }
  }

  /**
   * Sync configuration between sites
   */
  async syncFromSite(
    sourceSite: SiteIdentity,
    options: ConfigSyncOptions = {}
  ): Promise<ConfigImportResult> {
    // Fetch export from source site
    const exportData = await this.fetchRemoteExport(sourceSite, options);

    // Import locally
    return this.import(exportData, {
      ...options,
      source: sourceSite,
    });
  }

  /**
   * Add environment override
   */
  addEnvironmentOverride(override: EnvironmentOverride): void {
    this.importService.addOverride(override);
  }

  /**
   * Register module state
   */
  registerModule(moduleId: string, state: ModuleState): void {
    this.moduleStates.set(moduleId, state);
  }

  /**
   * Get module state
   */
  getModuleState(moduleId: string): ModuleState | undefined {
    return this.moduleStates.get(moduleId);
  }

  /**
   * Sync module states
   */
  async syncModuleStates(
    remoteSite: SiteIdentity
  ): Promise<Map<string, ModuleSyncResult>> {
    const results = new Map<string, ModuleSyncResult>();

    // Fetch remote module states
    const remoteStates = await this.fetchRemoteModuleStates(remoteSite);

    for (const [moduleId, localState] of this.moduleStates) {
      const remoteState = remoteStates.get(moduleId);

      if (!remoteState) {
        results.set(moduleId, { status: "local_only", action: "none" });
        continue;
      }

      if (localState.version !== remoteState.version) {
        results.set(moduleId, {
          status: "version_mismatch",
          action: "update_required",
          localVersion: localState.version,
          remoteVersion: remoteState.version,
        });
      } else if (localState.enabled !== remoteState.enabled) {
        results.set(moduleId, {
          status: "state_mismatch",
          action: "toggle_required",
          localEnabled: localState.enabled,
          remoteEnabled: remoteState.enabled,
        });
      } else {
        results.set(moduleId, { status: "in_sync", action: "none" });
      }
    }

    return results;
  }

  /**
   * Get current state
   */
  getState(): ConfigSyncState {
    return this.state;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private setState(state: ConfigSyncState): void {
    this.state = state;
    this.emit("state_changed", state);
  }

  private async fetchRemoteExport(
    site: SiteIdentity,
    options: ConfigSyncOptions
  ): Promise<ConfigExport> {
    // In production, fetch from remote site API
    // For now, return empty export
    return {
      id: uuidv4(),
      name: "remote-export",
      sourceSite: site.id,
      exportedAt: new Date(),
      schemaVersion: "1.0.0",
      items: [],
      dependencies: [],
      checksum: "",
    };
  }

  private async fetchRemoteModuleStates(
    site: SiteIdentity
  ): Promise<Map<string, ModuleState>> {
    // In production, fetch from remote site API
    return new Map();
  }
}

// =============================================================================
// MODULE STATE TYPES
// =============================================================================

/**
 * Module state
 */
export interface ModuleState {
  moduleId: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
  dependencies: string[];
  installedAt: Date;
  updatedAt: Date;
}

/**
 * Module sync result
 */
export interface ModuleSyncResult {
  status: "in_sync" | "version_mismatch" | "state_mismatch" | "local_only" | "remote_only";
  action: "none" | "update_required" | "toggle_required" | "install_required";
  localVersion?: string;
  remoteVersion?: string;
  localEnabled?: boolean;
  remoteEnabled?: boolean;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  ConfigExportService,
  ConfigImportService,
  ConfigSyncManager,
  ConfigSyncState,
  ConfigValidationResult,
  ConfigImportResult,
};
