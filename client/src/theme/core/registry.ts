/**
 * RSES CMS Theme Registry
 *
 * Manages theme registration, resolution, and inheritance.
 */

import type {
  ThemeManifest,
  ThemeRegistry,
  ResolvedTheme,
  DesignTokens,
  RegionDefinition,
  ComponentOverride,
} from '../types';

// ============================================================================
// REGISTRY IMPLEMENTATION
// ============================================================================

export function createThemeRegistry(): ThemeRegistry {
  const themes = new Map<string, ThemeManifest>();
  const resolvedCache = new Map<string, ResolvedTheme>();
  let activeTheme: string | null = null;

  /**
   * Deep merge two objects, with source overriding target
   */
  function deepMerge<T extends Record<string, unknown>>(
    target: T,
    source: Partial<T>
  ): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }

    return result;
  }

  /**
   * Get the inheritance chain for a theme
   */
  function getInheritanceChain(themeName: string): string[] {
    const chain: string[] = [];
    let current = themeName;

    while (current) {
      const theme = themes.get(current);
      if (!theme) break;

      chain.push(current);

      if (theme.extends && themes.has(theme.extends)) {
        current = theme.extends;
      } else {
        break;
      }
    }

    return chain.reverse(); // Base first, most specific last
  }

  /**
   * Resolve tokens with inheritance
   */
  function resolveTokens(chain: string[]): DesignTokens {
    let tokens: DesignTokens | null = null;

    for (const themeName of chain) {
      const theme = themes.get(themeName);
      if (!theme?.tokens) continue;

      if (tokens === null) {
        tokens = structuredClone(theme.tokens);
      } else {
        tokens = deepMerge(
          tokens as unknown as Record<string, unknown>,
          theme.tokens as unknown as Partial<Record<string, unknown>>
        ) as unknown as DesignTokens;
      }
    }

    if (!tokens) {
      throw new Error('No tokens found in inheritance chain');
    }

    return tokens;
  }

  /**
   * Resolve token references like "{colors.primary.500}"
   */
  function resolveTokenReferences(tokens: DesignTokens): DesignTokens {
    const resolvedTokens = structuredClone(tokens);

    function resolve(obj: Record<string, unknown>, root: Record<string, unknown>): void {
      for (const key in obj) {
        const value = obj[key];

        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
          // Token reference
          const path = value.slice(1, -1);
          const resolved = getValueByPath(root, path);
          if (resolved !== undefined) {
            obj[key] = resolved;
          }
        } else if (typeof value === 'object' && value !== null) {
          resolve(value as Record<string, unknown>, root);
        }
      }
    }

    resolve(resolvedTokens as unknown as Record<string, unknown>, resolvedTokens as unknown as Record<string, unknown>);
    return resolvedTokens;
  }

  /**
   * Get a value from an object by dot-notation path
   */
  function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Resolve regions with inheritance
   */
  function resolveRegions(chain: string[]): Record<string, RegionDefinition> {
    let regions: Record<string, RegionDefinition> = {};

    for (const themeName of chain) {
      const theme = themes.get(themeName);
      if (!theme?.regions) continue;

      regions = { ...regions, ...theme.regions };
    }

    return regions;
  }

  /**
   * Resolve components with inheritance
   */
  function resolveComponents(chain: string[]): Record<string, ComponentOverride> {
    const components: Record<string, ComponentOverride> = {};

    for (const themeName of chain) {
      const theme = themes.get(themeName);
      if (!theme?.components) continue;

      for (const [name, override] of Object.entries(theme.components)) {
        if (components[name]) {
          // Merge overrides
          components[name] = {
            ...components[name],
            ...override,
            priority: override.priority ?? (components[name].priority ?? 0) + 1,
          };
        } else {
          components[name] = { ...override };
        }
      }
    }

    return components;
  }

  /**
   * Resolve a theme with full inheritance
   */
  function resolveTheme(themeName: string): ResolvedTheme {
    // Check cache
    const cached = resolvedCache.get(themeName);
    if (cached) return cached;

    const manifest = themes.get(themeName);
    if (!manifest) {
      throw new Error(`Theme "${themeName}" not found in registry`);
    }

    const inheritanceChain = getInheritanceChain(themeName);
    const resolvedTokens = resolveTokenReferences(resolveTokens(inheritanceChain));
    const resolvedRegions = resolveRegions(inheritanceChain);
    const resolvedComponents = resolveComponents(inheritanceChain);

    const resolved: ResolvedTheme = {
      manifest,
      resolvedTokens,
      resolvedComponents,
      resolvedRegions,
      inheritanceChain,
      currentSettings: { ...manifest.settings.defaults },
      activeColorScheme: manifest.colorSchemes.default,
      currentBreakpoint: manifest.breakpoints.default,
    };

    resolvedCache.set(themeName, resolved);
    return resolved;
  }

  return {
    themes,
    activeTheme,
    resolvedCache,

    register(manifest: ThemeManifest): void {
      themes.set(manifest.name, manifest);
      // Invalidate cache for this theme and any that extend it
      resolvedCache.delete(manifest.name);
      for (const [name, theme] of themes) {
        if (theme.extends === manifest.name) {
          resolvedCache.delete(name);
        }
      }
    },

    unregister(name: string): void {
      themes.delete(name);
      resolvedCache.delete(name);
      if (activeTheme === name) {
        activeTheme = null;
      }
    },

    async activate(name: string): Promise<ResolvedTheme> {
      if (!themes.has(name)) {
        throw new Error(`Theme "${name}" not found in registry`);
      }

      const resolved = resolveTheme(name);
      activeTheme = name;
      return resolved;
    },

    resolve(name: string): ResolvedTheme {
      return resolveTheme(name);
    },

    list(): ThemeManifest[] {
      return Array.from(themes.values());
    },

    has(name: string): boolean {
      return themes.has(name);
    },
  };
}

// ============================================================================
// DEFAULT REGISTRY WITH BUILT-IN THEMES
// ============================================================================

let defaultRegistry: ThemeRegistry | null = null;

export function getDefaultRegistry(): ThemeRegistry {
  if (!defaultRegistry) {
    defaultRegistry = createThemeRegistry();

    // Register built-in themes lazily
    import('../themes/base/manifest').then(({ baseThemeManifest }) => {
      defaultRegistry!.register(baseThemeManifest);
    });

    import('../themes/quantum-os/manifest').then(({ quantumOsThemeManifest }) => {
      defaultRegistry!.register(quantumOsThemeManifest);
    });
  }

  return defaultRegistry;
}
