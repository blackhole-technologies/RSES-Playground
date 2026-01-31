/**
 * @file media-registry.ts
 * @description Media Module, Processor, and Storage Registry Implementation
 * @phase Phase 10 - Plug-and-Play Media System
 * @author Media Integration Specialist
 * @created 2026-02-01
 *
 * This module implements the registries for the modular media system:
 * - MediaModuleRegistry: Manages media modules (core, processing, AI, CDN)
 * - MediaProcessorRegistry: Manages pluggable processors
 * - StorageAdapterRegistry: Manages storage backends (S3, R2, local, etc.)
 *
 * Key Features:
 * - Dynamic module discovery and registration
 * - Dependency resolution and validation
 * - Runtime enable/disable of modules
 * - Health monitoring and metrics
 */

import type {
  MediaModule,
  MediaModuleRegistry,
  MediaProcessor,
  MediaProcessorRegistry,
  StorageAdapter,
  StorageAdapterRegistry,
  ModuleId,
  ProcessorId,
  StorageProviderId,
  ModuleTier,
  MediaCapability,
  ModuleInitResult,
  ModuleHealthStatus,
  DependencyGraph,
  DependencyValidationResult,
  MODULE_TIERS,
} from "@shared/cms/media-module-types";

// =============================================================================
// EVENT EMITTER FOR REGISTRY EVENTS
// =============================================================================

type RegistryEventType =
  | 'module:registered'
  | 'module:unregistered'
  | 'module:enabled'
  | 'module:disabled'
  | 'module:error'
  | 'processor:registered'
  | 'processor:unregistered'
  | 'storage:registered'
  | 'storage:unregistered'
  | 'storage:default-changed';

interface RegistryEvent {
  type: RegistryEventType;
  id: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

type RegistryEventHandler = (event: RegistryEvent) => void;

class RegistryEventEmitter {
  private handlers: Map<RegistryEventType, Set<RegistryEventHandler>> = new Map();

  on(event: RegistryEventType, handler: RegistryEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: RegistryEvent): void {
    this.handlers.get(event.type)?.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in registry event handler for ${event.type}:`, error);
      }
    });
  }
}

// =============================================================================
// MEDIA MODULE REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * Implementation of the MediaModuleRegistry interface.
 * Manages registration, initialization, and lifecycle of media modules.
 */
export class MediaModuleRegistryImpl implements MediaModuleRegistry {
  private modules: Map<ModuleId, MediaModule> = new Map();
  private enabledModules: Set<ModuleId> = new Set();
  private initializedModules: Set<ModuleId> = new Set();
  private moduleConfigs: Map<ModuleId, Record<string, unknown>> = new Map();
  private events: RegistryEventEmitter = new RegistryEventEmitter();

  /**
   * Register a new module in the registry.
   */
  register(module: MediaModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module '${module.id}' is already registered`);
    }

    // Validate module structure
    this.validateModule(module);

    this.modules.set(module.id, module);
    this.moduleConfigs.set(module.id, { ...module.defaultConfig });

    this.events.emit({
      type: 'module:registered',
      id: module.id,
      timestamp: new Date(),
      data: {
        name: module.name,
        tier: module.tier,
        capabilities: module.capabilities,
      },
    });

    console.log(`[MediaRegistry] Module registered: ${module.id} (${module.tier})`);
  }

  /**
   * Unregister a module from the registry.
   */
  unregister(moduleId: ModuleId): void {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module '${moduleId}' is not registered`);
    }

    // Check if any other modules depend on this one
    const dependents = this.getDependentModules(moduleId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unregister '${moduleId}': other modules depend on it: ${dependents.join(', ')}`
      );
    }

    // Disable and shutdown if necessary
    if (this.enabledModules.has(moduleId)) {
      this.disable(moduleId);
    }

    this.modules.delete(moduleId);
    this.moduleConfigs.delete(moduleId);

    this.events.emit({
      type: 'module:unregistered',
      id: moduleId,
      timestamp: new Date(),
    });

    console.log(`[MediaRegistry] Module unregistered: ${moduleId}`);
  }

  /**
   * Get a module by ID.
   */
  get(moduleId: ModuleId): MediaModule | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get all registered modules.
   */
  getAll(): MediaModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get modules by tier.
   */
  getByTier(tier: ModuleTier): MediaModule[] {
    return Array.from(this.modules.values()).filter(m => m.tier === tier);
  }

  /**
   * Get modules by capability.
   */
  getByCapability(capability: MediaCapability): MediaModule[] {
    return Array.from(this.modules.values()).filter(m =>
      m.capabilities.includes(capability)
    );
  }

  /**
   * Check if a module is registered.
   */
  has(moduleId: ModuleId): boolean {
    return this.modules.has(moduleId);
  }

  /**
   * Get all enabled modules.
   */
  getEnabled(): MediaModule[] {
    return Array.from(this.modules.values()).filter(m =>
      this.enabledModules.has(m.id)
    );
  }

  /**
   * Enable a module.
   */
  async enable(moduleId: ModuleId): Promise<ModuleInitResult> {
    const module = this.modules.get(moduleId);
    if (!module) {
      return {
        success: false,
        message: `Module '${moduleId}' is not registered`,
      };
    }

    // Already enabled
    if (this.enabledModules.has(moduleId)) {
      return {
        success: true,
        message: 'Module is already enabled',
      };
    }

    // Validate dependencies
    const depValidation = this.validateDependencies(moduleId);
    if (!depValidation.valid) {
      return {
        success: false,
        message: `Missing dependencies: ${depValidation.missingDependencies.join(', ')}`,
      };
    }

    // Enable required dependencies first
    for (const depId of module.dependencies) {
      if (!this.enabledModules.has(depId)) {
        const depResult = await this.enable(depId);
        if (!depResult.success) {
          return {
            success: false,
            message: `Failed to enable dependency '${depId}': ${depResult.message}`,
          };
        }
      }
    }

    try {
      // Initialize the module
      const config = this.moduleConfigs.get(moduleId) || module.defaultConfig;
      const result = await module.initialize(config);

      if (result.success) {
        this.enabledModules.add(moduleId);
        this.initializedModules.add(moduleId);

        this.events.emit({
          type: 'module:enabled',
          id: moduleId,
          timestamp: new Date(),
          data: result,
        });

        console.log(`[MediaRegistry] Module enabled: ${moduleId}`);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.events.emit({
        type: 'module:error',
        id: moduleId,
        timestamp: new Date(),
        data: { error: message },
      });

      return {
        success: false,
        message: `Failed to initialize module: ${message}`,
      };
    }
  }

  /**
   * Disable a module.
   */
  async disable(moduleId: ModuleId): Promise<void> {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module '${moduleId}' is not registered`);
    }

    if (!this.enabledModules.has(moduleId)) {
      return; // Already disabled
    }

    // Check if any enabled modules depend on this one
    const dependents = this.getDependentModules(moduleId).filter(id =>
      this.enabledModules.has(id)
    );
    if (dependents.length > 0) {
      throw new Error(
        `Cannot disable '${moduleId}': enabled modules depend on it: ${dependents.join(', ')}`
      );
    }

    try {
      // Shutdown the module
      if (this.initializedModules.has(moduleId)) {
        await module.shutdown();
        this.initializedModules.delete(moduleId);
      }

      this.enabledModules.delete(moduleId);

      this.events.emit({
        type: 'module:disabled',
        id: moduleId,
        timestamp: new Date(),
      });

      console.log(`[MediaRegistry] Module disabled: ${moduleId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.events.emit({
        type: 'module:error',
        id: moduleId,
        timestamp: new Date(),
        data: { error: message },
      });

      throw new Error(`Failed to disable module: ${message}`);
    }
  }

  /**
   * Get the dependency graph for all modules.
   */
  getDependencyGraph(): DependencyGraph {
    const nodes = Array.from(this.modules.values()).map(m => ({
      moduleId: m.id,
      tier: m.tier,
      enabled: this.enabledModules.has(m.id),
    }));

    const edges: DependencyGraph['edges'] = [];

    for (const module of this.modules.values()) {
      for (const dep of module.dependencies) {
        edges.push({
          from: module.id,
          to: dep,
          type: 'required',
        });
      }
      for (const dep of module.optionalDependencies || []) {
        edges.push({
          from: module.id,
          to: dep,
          type: 'optional',
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Validate module dependencies.
   */
  validateDependencies(moduleId: ModuleId): DependencyValidationResult {
    const module = this.modules.get(moduleId);
    if (!module) {
      return {
        valid: false,
        missingDependencies: [],
        warnings: [`Module '${moduleId}' is not registered`],
      };
    }

    const missingDependencies: ModuleId[] = [];
    const warnings: string[] = [];

    // Check required dependencies
    for (const depId of module.dependencies) {
      if (!this.modules.has(depId)) {
        missingDependencies.push(depId);
      } else if (!this.enabledModules.has(depId)) {
        // Dependency exists but not enabled - will be auto-enabled
      }
    }

    // Check optional dependencies
    for (const depId of module.optionalDependencies || []) {
      if (!this.modules.has(depId)) {
        warnings.push(`Optional dependency '${depId}' is not registered`);
      }
    }

    // Check for circular dependencies
    const circularDependencies = this.detectCircularDependencies(moduleId);

    return {
      valid: missingDependencies.length === 0 && circularDependencies.length === 0,
      missingDependencies,
      circularDependencies: circularDependencies.length > 0 ? circularDependencies : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Update module configuration.
   */
  updateConfig(moduleId: ModuleId, config: Record<string, unknown>): void {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module '${moduleId}' is not registered`);
    }

    // Validate config against schema
    const result = module.configSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`);
    }

    this.moduleConfigs.set(moduleId, { ...config });
  }

  /**
   * Get module configuration.
   */
  getConfig(moduleId: ModuleId): Record<string, unknown> | undefined {
    return this.moduleConfigs.get(moduleId);
  }

  /**
   * Subscribe to registry events.
   */
  on(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.events.on(event, handler);
  }

  /**
   * Unsubscribe from registry events.
   */
  off(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.events.off(event, handler);
  }

  // Private helper methods

  private validateModule(module: MediaModule): void {
    if (!module.id) throw new Error('Module must have an id');
    if (!module.name) throw new Error('Module must have a name');
    if (!module.version) throw new Error('Module must have a version');
    if (!module.tier) throw new Error('Module must have a tier');
    if (!module.capabilities || module.capabilities.length === 0) {
      throw new Error('Module must have at least one capability');
    }
    if (!module.configSchema) throw new Error('Module must have a configSchema');
    if (typeof module.initialize !== 'function') {
      throw new Error('Module must have an initialize method');
    }
    if (typeof module.shutdown !== 'function') {
      throw new Error('Module must have a shutdown method');
    }
  }

  private getDependentModules(moduleId: ModuleId): ModuleId[] {
    return Array.from(this.modules.values())
      .filter(m => m.dependencies.includes(moduleId))
      .map(m => m.id);
  }

  private detectCircularDependencies(
    moduleId: ModuleId,
    visited: Set<ModuleId> = new Set(),
    path: ModuleId[] = []
  ): ModuleId[][] {
    const circular: ModuleId[][] = [];
    const module = this.modules.get(moduleId);

    if (!module) return circular;

    if (visited.has(moduleId)) {
      // Found a cycle
      const cycleStart = path.indexOf(moduleId);
      if (cycleStart !== -1) {
        circular.push([...path.slice(cycleStart), moduleId]);
      }
      return circular;
    }

    visited.add(moduleId);
    path.push(moduleId);

    for (const depId of module.dependencies) {
      circular.push(...this.detectCircularDependencies(depId, new Set(visited), [...path]));
    }

    return circular;
  }
}

// =============================================================================
// MEDIA PROCESSOR REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * Implementation of the MediaProcessorRegistry interface.
 * Manages registration and discovery of media processors.
 */
export class MediaProcessorRegistryImpl implements MediaProcessorRegistry {
  private processors: Map<ProcessorId, MediaProcessor> = new Map();
  private events: RegistryEventEmitter = new RegistryEventEmitter();

  /**
   * Register a processor.
   */
  register(processor: MediaProcessor): void {
    if (this.processors.has(processor.id)) {
      throw new Error(`Processor '${processor.id}' is already registered`);
    }

    this.validateProcessor(processor);
    this.processors.set(processor.id, processor);

    this.events.emit({
      type: 'processor:registered',
      id: processor.id,
      timestamp: new Date(),
      data: {
        name: processor.name,
        capabilities: processor.capabilities,
        inputTypes: processor.inputTypes,
        outputTypes: processor.outputTypes,
      },
    });

    console.log(`[ProcessorRegistry] Processor registered: ${processor.id}`);
  }

  /**
   * Unregister a processor.
   */
  unregister(processorId: ProcessorId): void {
    if (!this.processors.has(processorId)) {
      throw new Error(`Processor '${processorId}' is not registered`);
    }

    this.processors.delete(processorId);

    this.events.emit({
      type: 'processor:unregistered',
      id: processorId,
      timestamp: new Date(),
    });

    console.log(`[ProcessorRegistry] Processor unregistered: ${processorId}`);
  }

  /**
   * Get a processor by ID.
   */
  get(processorId: ProcessorId): MediaProcessor | undefined {
    return this.processors.get(processorId);
  }

  /**
   * Get all registered processors.
   */
  getAll(): MediaProcessor[] {
    return Array.from(this.processors.values());
  }

  /**
   * Get processors by capability.
   */
  getByCapability(capability: MediaCapability): MediaProcessor[] {
    return Array.from(this.processors.values()).filter(p =>
      p.capabilities.includes(capability)
    );
  }

  /**
   * Get processors that can handle a specific input type.
   */
  getForInputType(mimeType: string): MediaProcessor[] {
    return Array.from(this.processors.values()).filter(p =>
      p.inputTypes.some(type => this.matchesMimeType(mimeType, type))
    );
  }

  /**
   * Check if a processor is registered.
   */
  has(processorId: ProcessorId): boolean {
    return this.processors.has(processorId);
  }

  /**
   * Find the best processor for a given operation.
   */
  findBestProcessor(
    capability: MediaCapability,
    inputType: string
  ): MediaProcessor | undefined {
    const candidates = this.getByCapability(capability).filter(p =>
      p.inputTypes.some(type => this.matchesMimeType(inputType, type))
    );

    // Return the first candidate (could be extended with scoring)
    return candidates[0];
  }

  /**
   * Subscribe to registry events.
   */
  on(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.events.on(event, handler);
  }

  // Private helper methods

  private validateProcessor(processor: MediaProcessor): void {
    if (!processor.id) throw new Error('Processor must have an id');
    if (!processor.name) throw new Error('Processor must have a name');
    if (!processor.version) throw new Error('Processor must have a version');
    if (!processor.inputTypes || processor.inputTypes.length === 0) {
      throw new Error('Processor must have at least one input type');
    }
    if (!processor.outputTypes || processor.outputTypes.length === 0) {
      throw new Error('Processor must have at least one output type');
    }
    if (typeof processor.process !== 'function') {
      throw new Error('Processor must have a process method');
    }
  }

  private matchesMimeType(actual: string, pattern: string): boolean {
    if (pattern === '*/*' || pattern === actual) {
      return true;
    }

    const [actualType, actualSubtype] = actual.split('/');
    const [patternType, patternSubtype] = pattern.split('/');

    if (patternSubtype === '*' && actualType === patternType) {
      return true;
    }

    return false;
  }
}

// =============================================================================
// STORAGE ADAPTER REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * Implementation of the StorageAdapterRegistry interface.
 * Manages registration and selection of storage backends.
 */
export class StorageAdapterRegistryImpl implements StorageAdapterRegistry {
  private adapters: Map<StorageProviderId, StorageAdapter> = new Map();
  private defaultAdapterId: StorageProviderId | null = null;
  private events: RegistryEventEmitter = new RegistryEventEmitter();

  /**
   * Register a storage adapter.
   */
  register(adapter: StorageAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Storage adapter '${adapter.id}' is already registered`);
    }

    this.validateAdapter(adapter);
    this.adapters.set(adapter.id, adapter);

    // Set as default if first adapter
    if (!this.defaultAdapterId) {
      this.defaultAdapterId = adapter.id;
    }

    this.events.emit({
      type: 'storage:registered',
      id: adapter.id,
      timestamp: new Date(),
      data: {
        name: adapter.name,
        provider: adapter.provider,
        capabilities: adapter.capabilities,
      },
    });

    console.log(`[StorageRegistry] Adapter registered: ${adapter.id} (${adapter.provider})`);
  }

  /**
   * Unregister a storage adapter.
   */
  unregister(adapterId: StorageProviderId): void {
    if (!this.adapters.has(adapterId)) {
      throw new Error(`Storage adapter '${adapterId}' is not registered`);
    }

    if (this.defaultAdapterId === adapterId) {
      // Find another adapter to be the default
      const remaining = Array.from(this.adapters.keys()).filter(id => id !== adapterId);
      this.defaultAdapterId = remaining.length > 0 ? remaining[0] : null;
    }

    this.adapters.delete(adapterId);

    this.events.emit({
      type: 'storage:unregistered',
      id: adapterId,
      timestamp: new Date(),
    });

    console.log(`[StorageRegistry] Adapter unregistered: ${adapterId}`);
  }

  /**
   * Get a storage adapter by ID.
   */
  get(adapterId: StorageProviderId): StorageAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  /**
   * Get the default (active) storage adapter.
   */
  getDefault(): StorageAdapter {
    if (!this.defaultAdapterId) {
      throw new Error('No storage adapters registered');
    }

    const adapter = this.adapters.get(this.defaultAdapterId);
    if (!adapter) {
      throw new Error('Default storage adapter not found');
    }

    return adapter;
  }

  /**
   * Set the default storage adapter.
   */
  setDefault(adapterId: StorageProviderId): void {
    if (!this.adapters.has(adapterId)) {
      throw new Error(`Storage adapter '${adapterId}' is not registered`);
    }

    const previousDefault = this.defaultAdapterId;
    this.defaultAdapterId = adapterId;

    this.events.emit({
      type: 'storage:default-changed',
      id: adapterId,
      timestamp: new Date(),
      data: { previousDefault },
    });

    console.log(`[StorageRegistry] Default adapter changed to: ${adapterId}`);
  }

  /**
   * Get all registered adapters.
   */
  getAll(): StorageAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if an adapter is registered.
   */
  has(adapterId: StorageProviderId): boolean {
    return this.adapters.has(adapterId);
  }

  /**
   * Check if an adapter is the default.
   */
  isDefault(adapterId: StorageProviderId): boolean {
    return this.defaultAdapterId === adapterId;
  }

  /**
   * Get adapters by provider type.
   */
  getByProvider(provider: string): StorageAdapter[] {
    return Array.from(this.adapters.values()).filter(a => a.provider === provider);
  }

  /**
   * Subscribe to registry events.
   */
  on(event: RegistryEventType, handler: RegistryEventHandler): void {
    this.events.on(event, handler);
  }

  // Private helper methods

  private validateAdapter(adapter: StorageAdapter): void {
    if (!adapter.id) throw new Error('Adapter must have an id');
    if (!adapter.name) throw new Error('Adapter must have a name');
    if (!adapter.provider) throw new Error('Adapter must have a provider');
    if (!adapter.capabilities || adapter.capabilities.length === 0) {
      throw new Error('Adapter must have at least one capability');
    }
    if (typeof adapter.initialize !== 'function') {
      throw new Error('Adapter must have an initialize method');
    }
    if (typeof adapter.upload !== 'function') {
      throw new Error('Adapter must have an upload method');
    }
    if (typeof adapter.download !== 'function') {
      throw new Error('Adapter must have a download method');
    }
    if (typeof adapter.delete !== 'function') {
      throw new Error('Adapter must have a delete method');
    }
  }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

/**
 * Global module registry instance
 */
export const moduleRegistry = new MediaModuleRegistryImpl();

/**
 * Global processor registry instance
 */
export const processorRegistry = new MediaProcessorRegistryImpl();

/**
 * Global storage adapter registry instance
 */
export const storageRegistry = new StorageAdapterRegistryImpl();

// =============================================================================
// REGISTRY FACADE
// =============================================================================

/**
 * Facade providing unified access to all registries.
 */
export const mediaRegistries = {
  modules: moduleRegistry,
  processors: processorRegistry,
  storage: storageRegistry,

  /**
   * Get the overall system status.
   */
  getStatus() {
    return {
      modules: {
        total: moduleRegistry.getAll().length,
        enabled: moduleRegistry.getEnabled().length,
        byTier: {
          core: moduleRegistry.getByTier('core').length,
          processing: moduleRegistry.getByTier('processing').length,
          ai: moduleRegistry.getByTier('ai').length,
          optimization: moduleRegistry.getByTier('optimization').length,
        },
      },
      processors: {
        total: processorRegistry.getAll().length,
      },
      storage: {
        total: storageRegistry.getAll().length,
        default: storageRegistry.getDefault()?.id,
      },
    };
  },

  /**
   * Check if a capability is available (module providing it is enabled).
   */
  hasCapability(capability: MediaCapability): boolean {
    return moduleRegistry.getEnabled().some(m => m.capabilities.includes(capability));
  },

  /**
   * Get all available capabilities.
   */
  getAvailableCapabilities(): MediaCapability[] {
    const capabilities = new Set<MediaCapability>();
    for (const module of moduleRegistry.getEnabled()) {
      for (const cap of module.capabilities) {
        capabilities.add(cap);
      }
    }
    return Array.from(capabilities);
  },
};

export default mediaRegistries;
