/**
 * RSES CMS Theme Library/Asset System
 *
 * Libraries define collections of CSS, JavaScript, and other assets
 * that can be loaded per-component or globally.
 * Similar to Drupal's library system.
 */

// ============================================================================
// LIBRARY DEFINITIONS
// ============================================================================

/**
 * Theme library definition
 */
export interface ThemeLibrary {
  /** Library identifier */
  id: string;

  /** Version */
  version?: string;

  /** Description */
  description?: string;

  /** CSS assets */
  css?: LibraryCSSAsset[];

  /** JavaScript assets */
  js?: LibraryJSAsset[];

  /** Dependencies on other libraries */
  dependencies?: LibraryDependency[];

  /** License information */
  license?: string;

  /** Whether this library is loaded globally */
  global?: boolean;

  /** Conditions for loading */
  loadConditions?: LibraryLoadCondition[];

  /** Header/Footer placement */
  placement?: 'header' | 'footer';

  /** Preload strategy */
  preload?: PreloadStrategy;
}

/**
 * CSS asset definition
 */
export interface LibraryCSSAsset {
  /** Path to CSS file (relative to theme or absolute URL) */
  path: string;

  /** Media query */
  media?: string;

  /** Weight for ordering */
  weight?: number;

  /** Preprocessor (for build-time processing) */
  preprocessor?: 'none' | 'sass' | 'postcss';

  /** Minify in production */
  minify?: boolean;

  /** Critical CSS (inline in head) */
  critical?: boolean;

  /** Layer for @layer CSS */
  layer?: string;

  /** Attributes to add to link tag */
  attributes?: Record<string, string>;
}

/**
 * JavaScript asset definition
 */
export interface LibraryJSAsset {
  /** Path to JS file (relative to theme or absolute URL) */
  path: string;

  /** Load as module */
  module?: boolean;

  /** Defer loading */
  defer?: boolean;

  /** Async loading */
  async?: boolean;

  /** Weight for ordering */
  weight?: number;

  /** Minify in production */
  minify?: boolean;

  /** External script (not bundled) */
  external?: boolean;

  /** Attributes to add to script tag */
  attributes?: Record<string, string>;
}

/**
 * Library dependency
 */
export interface LibraryDependency {
  /** Dependency type */
  type: 'library' | 'theme' | 'external';

  /** Dependency name */
  name: string;

  /** Version constraint */
  version?: string;

  /** Whether dependency is optional */
  optional?: boolean;
}

/**
 * Condition for loading a library
 */
export interface LibraryLoadCondition {
  /** Condition type */
  type: 'route' | 'component' | 'region' | 'breakpoint' | 'feature' | 'custom';

  /** Match criteria */
  match: string | string[] | Record<string, unknown>;

  /** Negate the condition */
  negate?: boolean;
}

/**
 * Preload strategy
 */
export interface PreloadStrategy {
  /** Preload CSS */
  css?: 'preload' | 'prefetch' | 'none';

  /** Preload JS */
  js?: 'preload' | 'prefetch' | 'modulepreload' | 'none';

  /** Preload fonts */
  fonts?: boolean;

  /** Preconnect to origins */
  preconnect?: string[];
}

// ============================================================================
// ASSET PIPELINE
// ============================================================================

/**
 * Asset pipeline configuration
 */
export interface AssetPipelineConfig {
  /** Base path for theme assets */
  basePath: string;

  /** Public URL prefix */
  publicPath: string;

  /** Hash assets for cache busting */
  hash: boolean;

  /** Minify assets in production */
  minify: boolean;

  /** Source maps in development */
  sourceMaps: boolean;

  /** Bundle assets */
  bundle: boolean;

  /** Critical CSS extraction */
  criticalCSS: CriticalCSSConfig;

  /** Font loading optimization */
  fontLoading: FontLoadingConfig;

  /** Image optimization */
  imageOptimization: ImageOptimizationConfig;
}

export interface CriticalCSSConfig {
  /** Enable critical CSS extraction */
  enabled: boolean;

  /** Viewports to test */
  viewports: { width: number; height: number }[];

  /** Pages to extract from */
  pages: string[];

  /** Inline critical CSS */
  inline: boolean;
}

export interface FontLoadingConfig {
  /** Font display strategy */
  display: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';

  /** Preload fonts */
  preload: boolean;

  /** Subset fonts */
  subset?: string;

  /** Font file formats to generate */
  formats: ('woff2' | 'woff' | 'ttf')[];
}

export interface ImageOptimizationConfig {
  /** Enable image optimization */
  enabled: boolean;

  /** Generate responsive images */
  responsive: boolean;

  /** Image formats to generate */
  formats: ('webp' | 'avif' | 'jpeg' | 'png')[];

  /** Widths to generate */
  widths: number[];

  /** Quality setting (0-100) */
  quality: number;

  /** Lazy loading */
  lazyLoad: boolean;
}

// ============================================================================
// RUNTIME ASSET MANAGEMENT
// ============================================================================

/**
 * Loaded asset state
 */
export interface LoadedAsset {
  /** Asset identifier */
  id: string;

  /** Asset type */
  type: 'css' | 'js' | 'font';

  /** Source URL */
  src: string;

  /** Load state */
  state: 'loading' | 'loaded' | 'error';

  /** Error message if failed */
  error?: string;

  /** DOM element */
  element?: HTMLLinkElement | HTMLScriptElement;

  /** Load timestamp */
  loadedAt?: number;
}

/**
 * Asset loader interface
 */
export interface AssetLoader {
  /** Load a CSS file */
  loadCSS(asset: LibraryCSSAsset): Promise<LoadedAsset>;

  /** Load a JS file */
  loadJS(asset: LibraryJSAsset): Promise<LoadedAsset>;

  /** Load a library */
  loadLibrary(library: ThemeLibrary): Promise<LoadedAsset[]>;

  /** Unload a library */
  unloadLibrary(libraryId: string): void;

  /** Check if asset is loaded */
  isLoaded(assetId: string): boolean;

  /** Get all loaded assets */
  getLoadedAssets(): LoadedAsset[];

  /** Preload assets */
  preload(assets: (LibraryCSSAsset | LibraryJSAsset)[]): void;
}

// ============================================================================
// CSS CUSTOM PROPERTY INJECTION
// ============================================================================

/**
 * CSS variable injection system
 */
export interface CSSVariableInjector {
  /** Set a CSS variable */
  set(name: string, value: string, scope?: Element): void;

  /** Remove a CSS variable */
  remove(name: string, scope?: Element): void;

  /** Get a CSS variable value */
  get(name: string, scope?: Element): string;

  /** Set multiple variables */
  setMany(variables: Record<string, string>, scope?: Element): void;

  /** Clear all custom variables */
  clear(scope?: Element): void;

  /** Get all custom variables */
  getAll(scope?: Element): Record<string, string>;
}

// ============================================================================
// STYLE SHEET MANAGEMENT
// ============================================================================

/**
 * Dynamic stylesheet manager
 */
export interface StyleSheetManager {
  /** Create a new stylesheet */
  create(id: string): CSSStyleSheet;

  /** Get a stylesheet by ID */
  get(id: string): CSSStyleSheet | undefined;

  /** Delete a stylesheet */
  delete(id: string): void;

  /** Add a rule to a stylesheet */
  addRule(sheetId: string, rule: string, index?: number): number;

  /** Remove a rule from a stylesheet */
  removeRule(sheetId: string, index: number): void;

  /** Replace all rules in a stylesheet */
  replaceRules(sheetId: string, css: string): void;

  /** Enable/disable a stylesheet */
  setEnabled(sheetId: string, enabled: boolean): void;
}

// ============================================================================
// TAILWIND CSS INTEGRATION
// ============================================================================

/**
 * Tailwind CSS configuration for theme
 */
export interface TailwindThemeConfig {
  /** Extend Tailwind's default config */
  extend?: {
    colors?: Record<string, string | Record<string, string>>;
    spacing?: Record<string, string>;
    fontFamily?: Record<string, string[]>;
    fontSize?: Record<string, [string, { lineHeight?: string; letterSpacing?: string }]>;
    borderRadius?: Record<string, string>;
    boxShadow?: Record<string, string>;
    animation?: Record<string, string>;
    keyframes?: Record<string, Record<string, Record<string, string>>>;
  };

  /** Override Tailwind's default config */
  theme?: Record<string, unknown>;

  /** Plugin configurations */
  plugins?: TailwindPlugin[];

  /** Safelist classes */
  safelist?: (string | { pattern: RegExp; variants?: string[] })[];

  /** Content paths for purge */
  content?: string[];
}

export interface TailwindPlugin {
  /** Plugin name */
  name: string;

  /** Plugin options */
  options?: Record<string, unknown>;
}

// ============================================================================
// SHADCN/UI INTEGRATION
// ============================================================================

/**
 * shadcn/ui component configuration
 */
export interface ShadcnConfig {
  /** Style mode */
  style: 'default' | 'new-york';

  /** Base color */
  baseColor: 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone';

  /** CSS variables mode */
  cssVariables: boolean;

  /** Border radius */
  radius: number;

  /** Component aliases */
  aliases?: Record<string, string>;

  /** Icon library */
  iconLibrary?: 'lucide' | 'radix';
}

// ============================================================================
// HOT RELOAD
// ============================================================================

/**
 * Hot reload configuration
 */
export interface HotReloadConfig {
  /** Enable hot reload */
  enabled: boolean;

  /** Watch paths */
  watchPaths: string[];

  /** Debounce delay (ms) */
  debounce: number;

  /** Full page reload on error */
  reloadOnError: boolean;

  /** Preserve component state */
  preserveState: boolean;

  /** Notification style */
  notification: 'toast' | 'overlay' | 'none';
}

/**
 * Hot reload event
 */
export interface HotReloadEvent {
  /** Event type */
  type: 'css' | 'js' | 'component' | 'token' | 'full';

  /** Changed file path */
  path: string;

  /** Timestamp */
  timestamp: number;

  /** Modules affected */
  modules?: string[];
}

/**
 * Hot reload handler
 */
export type HotReloadHandler = (event: HotReloadEvent) => void | Promise<void>;
