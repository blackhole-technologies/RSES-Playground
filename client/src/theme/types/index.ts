/**
 * RSES CMS Theme System Types
 *
 * Central export for all theming types
 */

// Theme Manifest
export * from './manifest';

// Design Tokens
export * from './design-tokens';

// Region System
export * from './regions';

// Component System
export * from './components';

// Library/Asset System
export * from './libraries';

// ============================================================================
// CONVENIENCE TYPE ALIASES
// ============================================================================

import type { ThemeManifest, ResolvedTheme, ThemeRegistry } from './manifest';
import type { DesignTokens, ColorTokens, ColorValue } from './design-tokens';
import type { RegionDefinition, LayoutDefinition, StandardRegionName } from './regions';
import type { ComponentOverride, ComponentRegistryEntry } from './components';
import type { ThemeLibrary, AssetLoader } from './libraries';

/**
 * Complete theme configuration
 */
export interface ThemeConfig {
  manifest: ThemeManifest;
  tokens: DesignTokens;
  regions: Record<string, RegionDefinition>;
  components: Record<string, ComponentOverride>;
  libraries: Record<string, ThemeLibrary>;
}

/**
 * Theme provider props
 */
export interface ThemeProviderProps {
  /** Initial theme name */
  theme?: string;

  /** Default color scheme */
  defaultColorScheme?: 'light' | 'dark' | 'system';

  /** Storage key for theme preference */
  storageKey?: string;

  /** Theme registry */
  registry?: ThemeRegistry;

  /** Children */
  children: React.ReactNode;
}

/**
 * Theme context value
 */
export interface ThemeContextValue {
  /** Current resolved theme */
  theme: ResolvedTheme | null;

  /** Current color scheme */
  colorScheme: 'light' | 'dark';

  /** Current breakpoint */
  breakpoint: string;

  /** Set active theme */
  setTheme: (name: string) => Promise<void>;

  /** Set color scheme */
  setColorScheme: (scheme: 'light' | 'dark' | 'system') => void;

  /** Toggle color scheme */
  toggleColorScheme: () => void;

  /** Update theme settings */
  updateSettings: (settings: Record<string, unknown>) => void;

  /** Get design token value */
  getToken: (path: string) => unknown;

  /** Get CSS variable name for token */
  getTokenVar: (path: string) => string;

  /** Check if theme supports a feature */
  hasFeature: (feature: string) => boolean;

  /** Theme loading state */
  isLoading: boolean;

  /** Theme error */
  error: Error | null;

  /** Asset loader */
  assetLoader: AssetLoader;

  /** Theme registry */
  registry: ThemeRegistry;
}

/**
 * Hook return type for useTheme
 */
export type UseThemeReturn = ThemeContextValue;

/**
 * Hook return type for useDesignTokens
 */
export interface UseDesignTokensReturn {
  tokens: DesignTokens;
  getToken: (path: string) => unknown;
  getVar: (path: string) => string;
  colors: ColorTokens;
}

/**
 * Hook return type for useRegion
 */
export interface UseRegionReturn {
  definition: RegionDefinition | null;
  isVisible: boolean;
  hasContent: boolean;
  content: React.ReactNode[];
}

/**
 * Theme installation result
 */
export interface ThemeInstallResult {
  success: boolean;
  theme: ThemeManifest | null;
  errors: string[];
  warnings: string[];
}

/**
 * Theme validation result
 */
export interface ThemeValidationResult {
  valid: boolean;
  errors: ThemeValidationError[];
  warnings: ThemeValidationWarning[];
}

export interface ThemeValidationError {
  code: string;
  message: string;
  path?: string;
  severity: 'error';
}

export interface ThemeValidationWarning {
  code: string;
  message: string;
  path?: string;
  severity: 'warning';
}
