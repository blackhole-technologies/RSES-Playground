/**
 * RSES CMS Asset Loader
 *
 * Manages dynamic loading of CSS and JavaScript assets for themes.
 */

import type {
  AssetLoader,
  LoadedAsset,
  LibraryCSSAsset,
  LibraryJSAsset,
  ThemeLibrary,
} from '../types';

// ============================================================================
// ASSET LOADER IMPLEMENTATION
// ============================================================================

export function createAssetLoader(): AssetLoader {
  const loadedAssets = new Map<string, LoadedAsset>();
  const pendingLoads = new Map<string, Promise<LoadedAsset>>();

  /**
   * Generate a unique ID for an asset
   */
  function getAssetId(type: 'css' | 'js', path: string): string {
    return `${type}:${path}`;
  }

  /**
   * Load a CSS file
   */
  async function loadCSS(asset: LibraryCSSAsset): Promise<LoadedAsset> {
    const id = getAssetId('css', asset.path);

    // Already loaded
    if (loadedAssets.has(id)) {
      return loadedAssets.get(id)!;
    }

    // Loading in progress
    if (pendingLoads.has(id)) {
      return pendingLoads.get(id)!;
    }

    const loadPromise = new Promise<LoadedAsset>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = asset.path;
      link.id = `rses-theme-${id.replace(/[^a-z0-9]/gi, '-')}`;

      if (asset.media) {
        link.media = asset.media;
      }

      if (asset.attributes) {
        for (const [key, value] of Object.entries(asset.attributes)) {
          link.setAttribute(key, value);
        }
      }

      const loadedAsset: LoadedAsset = {
        id,
        type: 'css',
        src: asset.path,
        state: 'loading',
        element: link,
      };

      link.onload = () => {
        loadedAsset.state = 'loaded';
        loadedAsset.loadedAt = Date.now();
        loadedAssets.set(id, loadedAsset);
        pendingLoads.delete(id);
        resolve(loadedAsset);
      };

      link.onerror = () => {
        loadedAsset.state = 'error';
        loadedAsset.error = `Failed to load CSS: ${asset.path}`;
        pendingLoads.delete(id);
        reject(new Error(loadedAsset.error));
      };

      document.head.appendChild(link);
    });

    pendingLoads.set(id, loadPromise);
    return loadPromise;
  }

  /**
   * Load a JavaScript file
   */
  async function loadJS(asset: LibraryJSAsset): Promise<LoadedAsset> {
    const id = getAssetId('js', asset.path);

    // Already loaded
    if (loadedAssets.has(id)) {
      return loadedAssets.get(id)!;
    }

    // Loading in progress
    if (pendingLoads.has(id)) {
      return pendingLoads.get(id)!;
    }

    const loadPromise = new Promise<LoadedAsset>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = asset.path;
      script.id = `rses-theme-${id.replace(/[^a-z0-9]/gi, '-')}`;

      if (asset.module) {
        script.type = 'module';
      }

      if (asset.defer) {
        script.defer = true;
      }

      if (asset.async) {
        script.async = true;
      }

      if (asset.attributes) {
        for (const [key, value] of Object.entries(asset.attributes)) {
          script.setAttribute(key, value);
        }
      }

      const loadedAsset: LoadedAsset = {
        id,
        type: 'js',
        src: asset.path,
        state: 'loading',
        element: script as unknown as HTMLLinkElement, // Type hack
      };

      script.onload = () => {
        loadedAsset.state = 'loaded';
        loadedAsset.loadedAt = Date.now();
        loadedAssets.set(id, loadedAsset);
        pendingLoads.delete(id);
        resolve(loadedAsset);
      };

      script.onerror = () => {
        loadedAsset.state = 'error';
        loadedAsset.error = `Failed to load JS: ${asset.path}`;
        pendingLoads.delete(id);
        reject(new Error(loadedAsset.error));
      };

      document.body.appendChild(script);
    });

    pendingLoads.set(id, loadPromise);
    return loadPromise;
  }

  /**
   * Load all assets from a library
   */
  async function loadLibrary(library: ThemeLibrary): Promise<LoadedAsset[]> {
    const results: LoadedAsset[] = [];

    // Load CSS files in order by weight
    if (library.css) {
      const sortedCSS = [...library.css].sort(
        (a, b) => (a.weight ?? 0) - (b.weight ?? 0)
      );

      for (const cssAsset of sortedCSS) {
        try {
          const result = await loadCSS(cssAsset);
          results.push(result);
        } catch (error) {
          console.error(`Failed to load CSS from library ${library.id}:`, error);
        }
      }
    }

    // Load JS files in order by weight
    if (library.js) {
      const sortedJS = [...library.js].sort(
        (a, b) => (a.weight ?? 0) - (b.weight ?? 0)
      );

      for (const jsAsset of sortedJS) {
        try {
          const result = await loadJS(jsAsset);
          results.push(result);
        } catch (error) {
          console.error(`Failed to load JS from library ${library.id}:`, error);
        }
      }
    }

    return results;
  }

  /**
   * Unload all assets from a library
   */
  function unloadLibrary(libraryId: string): void {
    const assetsToRemove: string[] = [];

    for (const [id, asset] of loadedAssets) {
      if (asset.element) {
        asset.element.remove();
        assetsToRemove.push(id);
      }
    }

    for (const id of assetsToRemove) {
      loadedAssets.delete(id);
    }
  }

  /**
   * Check if an asset is loaded
   */
  function isLoaded(assetId: string): boolean {
    const asset = loadedAssets.get(assetId);
    return asset?.state === 'loaded';
  }

  /**
   * Get all loaded assets
   */
  function getLoadedAssets(): LoadedAsset[] {
    return Array.from(loadedAssets.values());
  }

  /**
   * Preload assets
   */
  function preload(assets: (LibraryCSSAsset | LibraryJSAsset)[]): void {
    for (const asset of assets) {
      const isCSS = 'media' in asset || !('module' in asset);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = asset.path;
      link.as = isCSS ? 'style' : 'script';

      if (!isCSS && (asset as LibraryJSAsset).module) {
        link.rel = 'modulepreload';
      }

      document.head.appendChild(link);
    }
  }

  return {
    loadCSS,
    loadJS,
    loadLibrary,
    unloadLibrary,
    isLoaded,
    getLoadedAssets,
    preload,
  };
}

// ============================================================================
// CSS VARIABLE INJECTOR
// ============================================================================

export function createCSSVariableInjector() {
  /**
   * Set a CSS variable
   */
  function set(name: string, value: string, scope: Element = document.documentElement): void {
    (scope as HTMLElement).style.setProperty(`--${name}`, value);
  }

  /**
   * Remove a CSS variable
   */
  function remove(name: string, scope: Element = document.documentElement): void {
    (scope as HTMLElement).style.removeProperty(`--${name}`);
  }

  /**
   * Get a CSS variable value
   */
  function get(name: string, scope: Element = document.documentElement): string {
    return getComputedStyle(scope).getPropertyValue(`--${name}`).trim();
  }

  /**
   * Set multiple variables
   */
  function setMany(variables: Record<string, string>, scope: Element = document.documentElement): void {
    for (const [name, value] of Object.entries(variables)) {
      set(name, value, scope);
    }
  }

  /**
   * Clear all custom variables
   */
  function clear(scope: Element = document.documentElement): void {
    const style = (scope as HTMLElement).style;
    const propsToRemove: string[] = [];

    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (prop.startsWith('--')) {
        propsToRemove.push(prop);
      }
    }

    for (const prop of propsToRemove) {
      style.removeProperty(prop);
    }
  }

  /**
   * Get all custom variables
   */
  function getAll(scope: Element = document.documentElement): Record<string, string> {
    const result: Record<string, string> = {};
    const computed = getComputedStyle(scope);

    // This is a simplification - in practice, you'd need to
    // iterate through stylesheets to find all custom properties
    // For now, we return properties from inline style
    const style = (scope as HTMLElement).style;

    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (prop.startsWith('--')) {
        result[prop.slice(2)] = computed.getPropertyValue(prop).trim();
      }
    }

    return result;
  }

  return {
    set,
    remove,
    get,
    setMany,
    clear,
    getAll,
  };
}

// ============================================================================
// DYNAMIC STYLESHEET MANAGER
// ============================================================================

export function createStyleSheetManager() {
  const sheets = new Map<string, CSSStyleSheet>();

  /**
   * Create a new stylesheet
   */
  function create(id: string): CSSStyleSheet {
    if (sheets.has(id)) {
      return sheets.get(id)!;
    }

    const style = document.createElement('style');
    style.id = `rses-theme-sheet-${id}`;
    document.head.appendChild(style);

    const sheet = style.sheet!;
    sheets.set(id, sheet);

    return sheet;
  }

  /**
   * Get a stylesheet by ID
   */
  function get(id: string): CSSStyleSheet | undefined {
    return sheets.get(id);
  }

  /**
   * Delete a stylesheet
   */
  function deleteSheet(id: string): void {
    const sheet = sheets.get(id);
    if (sheet?.ownerNode) {
      sheet.ownerNode.remove();
    }
    sheets.delete(id);
  }

  /**
   * Add a rule to a stylesheet
   */
  function addRule(sheetId: string, rule: string, index?: number): number {
    const sheet = sheets.get(sheetId);
    if (!sheet) {
      throw new Error(`Stylesheet "${sheetId}" not found`);
    }

    const insertIndex = index ?? sheet.cssRules.length;
    return sheet.insertRule(rule, insertIndex);
  }

  /**
   * Remove a rule from a stylesheet
   */
  function removeRule(sheetId: string, index: number): void {
    const sheet = sheets.get(sheetId);
    if (!sheet) {
      throw new Error(`Stylesheet "${sheetId}" not found`);
    }

    sheet.deleteRule(index);
  }

  /**
   * Replace all rules in a stylesheet
   */
  function replaceRules(sheetId: string, css: string): void {
    const sheet = sheets.get(sheetId);
    if (!sheet) {
      throw new Error(`Stylesheet "${sheetId}" not found`);
    }

    // Remove all existing rules
    while (sheet.cssRules.length > 0) {
      sheet.deleteRule(0);
    }

    // Parse and add new rules
    // This is a simplified implementation - for production,
    // use a proper CSS parser
    const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
    for (const rule of rules) {
      try {
        sheet.insertRule(rule, sheet.cssRules.length);
      } catch (e) {
        console.warn('Failed to insert rule:', rule, e);
      }
    }
  }

  /**
   * Enable/disable a stylesheet
   */
  function setEnabled(sheetId: string, enabled: boolean): void {
    const sheet = sheets.get(sheetId);
    if (!sheet) {
      throw new Error(`Stylesheet "${sheetId}" not found`);
    }

    sheet.disabled = !enabled;
  }

  return {
    create,
    get,
    delete: deleteSheet,
    addRule,
    removeRule,
    replaceRules,
    setEnabled,
  };
}
