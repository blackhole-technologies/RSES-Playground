/**
 * RSES CMS Theme Manifest Types
 *
 * Inspired by Drupal's .info.yml theme system but adapted for TypeScript/React.
 * Each theme provides a manifest that describes its configuration, dependencies,
 * and capabilities.
 */

import type { DesignTokens } from './design-tokens';
import type { RegionDefinition } from './regions';
import type { ComponentOverride } from './components';
import type { ThemeLibrary } from './libraries';

// ============================================================================
// THEME MANIFEST
// ============================================================================

/**
 * Core theme manifest - equivalent to Drupal's .info.yml
 */
export interface ThemeManifest {
  /** Unique machine name (e.g., 'quantum_os', 'corporate', 'minimal') */
  name: string;

  /** Human-readable display name */
  displayName: string;

  /** Theme description for admin UI */
  description: string;

  /** Theme version */
  version: string;

  /** Theme author information */
  author: ThemeAuthor;

  /** Screenshot path for admin UI preview */
  screenshot?: string;

  /** Parent theme to extend (null for base themes) */
  extends?: string;

  /** Core API version compatibility */
  coreVersion: string;

  /** Theme capabilities */
  features: ThemeFeatures;

  /** Region definitions */
  regions: Record<string, RegionDefinition>;

  /** Design tokens (CSS custom properties) */
  tokens: DesignTokens;

  /** Component overrides */
  components?: Record<string, ComponentOverride>;

  /** Asset libraries */
  libraries: Record<string, ThemeLibrary>;

  /** Theme settings schema */
  settings: ThemeSettingsSchema;

  /** Template suggestions */
  templateSuggestions?: TemplateSuggestions;

  /** Breakpoint definitions */
  breakpoints: BreakpointDefinitions;

  /** Color scheme support */
  colorSchemes: ColorSchemeSupport;

  /** Dependencies on other themes or libraries */
  dependencies?: ThemeDependency[];

  /** Lifecycle hooks */
  hooks?: ThemeHooks;
}

// ============================================================================
// AUTHOR & METADATA
// ============================================================================

export interface ThemeAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface ThemeDependency {
  type: 'theme' | 'library' | 'plugin';
  name: string;
  version?: string;
  optional?: boolean;
}

// ============================================================================
// THEME FEATURES
// ============================================================================

export interface ThemeFeatures {
  /** Supports dark/light mode switching */
  colorModes: boolean;

  /** Supports responsive layouts */
  responsive: boolean;

  /** Supports RTL languages */
  rtl: boolean;

  /** Supports high contrast mode */
  highContrast: boolean;

  /** Supports reduced motion */
  reducedMotion: boolean;

  /** Supports custom fonts */
  customFonts: boolean;

  /** Supports theme settings UI */
  settingsUI: boolean;

  /** Supports hot reload during development */
  hotReload: boolean;

  /** Custom feature flags */
  custom?: Record<string, boolean>;
}

// ============================================================================
// BREAKPOINTS
// ============================================================================

export interface BreakpointDefinitions {
  /** Named breakpoints with min-width values */
  values: Record<string, BreakpointValue>;

  /** Default breakpoint (for mobile-first) */
  default: string;

  /** Container queries support */
  containerQueries?: boolean;
}

export interface BreakpointValue {
  /** Min-width in pixels */
  minWidth: number;

  /** Optional max-width for ranged queries */
  maxWidth?: number;

  /** Human-readable label */
  label: string;

  /** CSS media query (auto-generated if not provided) */
  query?: string;
}

// ============================================================================
// COLOR SCHEMES
// ============================================================================

export interface ColorSchemeSupport {
  /** Available color schemes */
  schemes: ColorScheme[];

  /** Default scheme */
  default: string;

  /** Follow system preference */
  followSystem: boolean;

  /** Allow user override */
  userSelectable: boolean;

  /** Storage key for user preference */
  storageKey?: string;
}

export interface ColorScheme {
  /** Scheme identifier */
  id: string;

  /** Display name */
  name: string;

  /** CSS class applied to root */
  className: string;

  /** Icon for UI (Lucide icon name) */
  icon?: string;

  /** Media query to auto-detect */
  mediaQuery?: string;

  /** Token overrides for this scheme */
  tokens?: Partial<DesignTokens>;
}

// ============================================================================
// THEME SETTINGS SCHEMA
// ============================================================================

export interface ThemeSettingsSchema {
  /** Settings groups for organization in UI */
  groups: ThemeSettingsGroup[];

  /** Default values */
  defaults: Record<string, unknown>;

  /** Validation rules */
  validation?: Record<string, SettingValidation>;
}

export interface ThemeSettingsGroup {
  /** Group identifier */
  id: string;

  /** Display name */
  label: string;

  /** Group description */
  description?: string;

  /** Icon for UI */
  icon?: string;

  /** Settings in this group */
  settings: ThemeSetting[];

  /** Collapsed by default */
  collapsed?: boolean;
}

export interface ThemeSetting {
  /** Setting key */
  key: string;

  /** Display label */
  label: string;

  /** Help text */
  description?: string;

  /** Input type */
  type: SettingType;

  /** Default value */
  default: unknown;

  /** Type-specific options */
  options?: SettingOptions;

  /** Visibility condition */
  visibleWhen?: SettingCondition;

  /** Maps to CSS custom property */
  cssProperty?: string;

  /** Maps to design token */
  token?: string;
}

export type SettingType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'color'
  | 'select'
  | 'multiselect'
  | 'font'
  | 'spacing'
  | 'image'
  | 'code'
  | 'json';

export interface SettingOptions {
  /** For select/multiselect */
  choices?: Array<{ value: string; label: string }>;

  /** For number */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;

  /** For text */
  placeholder?: string;
  pattern?: string;

  /** For image */
  allowedTypes?: string[];
  maxSize?: number;

  /** For font */
  fontOptions?: FontOption[];

  /** For code */
  language?: string;
}

export interface FontOption {
  family: string;
  weights: number[];
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting';
  source: 'system' | 'google' | 'custom';
  url?: string;
}

export interface SettingCondition {
  setting: string;
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt';
  value: unknown;
}

export interface SettingValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  custom?: (value: unknown) => string | null;
}

// ============================================================================
// TEMPLATE SUGGESTIONS
// ============================================================================

/**
 * Template suggestions allow themes to provide alternative templates
 * based on context, similar to Drupal's hook_theme_suggestions_alter.
 */
export interface TemplateSuggestions {
  /** Component-level suggestions */
  components?: Record<string, TemplateSuggestionRule[]>;

  /** Page-level suggestions */
  pages?: Record<string, TemplateSuggestionRule[]>;

  /** Region-level suggestions */
  regions?: Record<string, TemplateSuggestionRule[]>;
}

export interface TemplateSuggestionRule {
  /** Suggestion identifier */
  id: string;

  /** Condition to apply this suggestion */
  condition: TemplateSuggestionCondition;

  /** Template to use (component path or name) */
  template: string;

  /** Priority (higher = more specific) */
  priority: number;
}

export interface TemplateSuggestionCondition {
  /** Context type to check */
  type: 'route' | 'entity' | 'user' | 'viewport' | 'custom';

  /** Match criteria */
  match: Record<string, unknown>;
}

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

export interface ThemeHooks {
  /** Called when theme is activated */
  onActivate?: () => void | Promise<void>;

  /** Called when theme is deactivated */
  onDeactivate?: () => void | Promise<void>;

  /** Called when settings change */
  onSettingsChange?: (settings: Record<string, unknown>) => void;

  /** Called before render */
  onBeforeRender?: (context: ThemeRenderContext) => void;

  /** Called after render */
  onAfterRender?: (context: ThemeRenderContext) => void;

  /** Called on color scheme change */
  onColorSchemeChange?: (scheme: string) => void;

  /** Called on breakpoint change */
  onBreakpointChange?: (breakpoint: string) => void;
}

export interface ThemeRenderContext {
  route: string;
  colorScheme: string;
  breakpoint: string;
  settings: Record<string, unknown>;
  tokens: DesignTokens;
}

// ============================================================================
// THEME INSTANCE
// ============================================================================

/**
 * Runtime theme instance with resolved inheritance
 */
export interface ResolvedTheme {
  /** Original manifest */
  manifest: ThemeManifest;

  /** Fully resolved tokens (with inheritance) */
  resolvedTokens: DesignTokens;

  /** Fully resolved components (with inheritance) */
  resolvedComponents: Record<string, ComponentOverride>;

  /** Fully resolved regions (with inheritance) */
  resolvedRegions: Record<string, RegionDefinition>;

  /** Inheritance chain (closest ancestor first) */
  inheritanceChain: string[];

  /** Current settings values */
  currentSettings: Record<string, unknown>;

  /** Active color scheme */
  activeColorScheme: string;

  /** Current breakpoint */
  currentBreakpoint: string;
}

// ============================================================================
// THEME REGISTRY
// ============================================================================

export interface ThemeRegistry {
  /** All registered themes */
  themes: Map<string, ThemeManifest>;

  /** Currently active theme */
  activeTheme: string | null;

  /** Theme resolution cache */
  resolvedCache: Map<string, ResolvedTheme>;

  /** Register a theme */
  register(manifest: ThemeManifest): void;

  /** Unregister a theme */
  unregister(name: string): void;

  /** Activate a theme */
  activate(name: string): Promise<ResolvedTheme>;

  /** Get a resolved theme */
  resolve(name: string): ResolvedTheme;

  /** List available themes */
  list(): ThemeManifest[];

  /** Check if a theme exists */
  has(name: string): boolean;
}
