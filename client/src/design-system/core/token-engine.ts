/**
 * Design Token Engine
 *
 * Core engine for processing, resolving, and applying design tokens.
 * Supports W3C Design Tokens specification with extensions.
 */

import type {
  DesignTokenFile,
  TokenDefinition,
  TokenGroup,
  TokenAlias,
  TokenValue,
  TokenResolverConfig,
  ResolvedToken,
  TokenTransform,
  TokenTransformContext,
  TokenExportConfig,
  TokenExportResult,
  ResponsiveToken,
  InteractionTokenDefinition,
  ContextualToken,
  ContentContext,
} from '../types/w3c-tokens';

// ============================================================================
// TOKEN ENGINE CLASS
// ============================================================================

export class TokenEngine {
  private tokens: Map<string, TokenDefinition> = new Map();
  private resolvedCache: Map<string, ResolvedToken> = new Map();
  private transforms: Map<string, TokenTransform> = new Map();
  private config: TokenResolverConfig;

  constructor(config: Partial<TokenResolverConfig> = {}) {
    this.config = {
      files: [],
      colorScheme: 'light',
      breakpoint: 'md',
      context: undefined,
      reducedMotion: false,
      highContrast: false,
      ...config,
    };

    this.registerBuiltInTransforms();
  }

  // ==========================================================================
  // TOKEN LOADING
  // ==========================================================================

  /**
   * Load tokens from a token file
   */
  loadTokens(file: DesignTokenFile): void {
    this.flattenTokens(file, '');
    this.resolvedCache.clear();
  }

  /**
   * Load multiple token files with merging
   */
  loadMultipleTokens(files: DesignTokenFile[]): void {
    for (const file of files) {
      this.loadTokens(file);
    }
  }

  /**
   * Flatten nested tokens to dot-notation paths
   */
  private flattenTokens(obj: DesignTokenFile | TokenGroup, prefix: string): void {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$')) continue; // Skip metadata

      const path = prefix ? `${prefix}.${key}` : key;

      if (this.isTokenDefinition(value)) {
        this.tokens.set(path, value as TokenDefinition);
      } else if (typeof value === 'object' && value !== null) {
        this.flattenTokens(value as TokenGroup, path);
      }
    }
  }

  /**
   * Check if value is a token definition
   */
  private isTokenDefinition(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    return '$value' in value;
  }

  // ==========================================================================
  // TOKEN RESOLUTION
  // ==========================================================================

  /**
   * Resolve a token by path
   */
  resolve<T = unknown>(path: string): ResolvedToken<T> | undefined {
    // Check cache
    const cached = this.resolvedCache.get(path);
    if (cached) return cached as ResolvedToken<T>;

    const token = this.tokens.get(path);
    if (!token) return undefined;

    const resolved = this.resolveToken(token, path);
    this.resolvedCache.set(path, resolved);

    return resolved as ResolvedToken<T>;
  }

  /**
   * Resolve a token value
   */
  private resolveToken(token: TokenDefinition, path: string): ResolvedToken {
    let value = token.$value;

    // Resolve alias references
    if (this.isAlias(value)) {
      const refPath = this.extractAliasPath(value as string);
      const refToken = this.resolve(refPath);
      if (refToken) {
        value = refToken.value as TokenValue;
      }
    }

    // Handle responsive tokens
    if (this.isResponsiveToken(token)) {
      value = this.resolveResponsiveValue(token as unknown as ResponsiveToken);
    }

    // Handle contextual tokens
    if (this.isContextualToken(token)) {
      value = this.resolveContextualValue(token as unknown as ContextualToken);
    }

    // Handle interaction tokens
    if (this.isInteractionToken(token)) {
      value = this.resolveInteractionValue(token as unknown as InteractionTokenDefinition);
    }

    return {
      value,
      source: path,
      path,
      metadata: token.$extensions,
    };
  }

  /**
   * Check if value is an alias reference
   */
  private isAlias(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return value.startsWith('{') && value.endsWith('}');
  }

  /**
   * Extract path from alias reference
   */
  private extractAliasPath(alias: string): string {
    return alias.slice(1, -1);
  }

  /**
   * Check if token is responsive
   */
  private isResponsiveToken(token: TokenDefinition): boolean {
    return token.$type === 'responsive';
  }

  /**
   * Resolve responsive token value based on current breakpoint
   */
  private resolveResponsiveValue(token: ResponsiveToken): unknown {
    const breakpointOrder = ['base', 'sm', 'md', 'lg', 'xl', '2xl'];
    const currentIndex = breakpointOrder.indexOf(this.config.breakpoint);

    // Find the closest defined breakpoint value
    for (let i = currentIndex; i >= 0; i--) {
      const bp = breakpointOrder[i] as keyof ResponsiveToken['$value'];
      if (token.$value[bp] !== undefined) {
        let value = token.$value[bp];
        if (this.isAlias(value)) {
          const resolved = this.resolve(this.extractAliasPath(value as string));
          return resolved?.value;
        }
        return value;
      }
    }

    return token.$value.base;
  }

  /**
   * Check if token is contextual
   */
  private isContextualToken(token: TokenDefinition): boolean {
    return token.$type === 'contextual';
  }

  /**
   * Resolve contextual token value based on current context
   */
  private resolveContextualValue(token: ContextualToken): unknown {
    if (this.config.context && token.$value.contexts[this.config.context]) {
      return token.$value.contexts[this.config.context];
    }
    return token.$value.default;
  }

  /**
   * Check if token is interaction-based
   */
  private isInteractionToken(token: TokenDefinition): boolean {
    return token.$type === 'interaction';
  }

  /**
   * Resolve interaction token (returns default state value)
   */
  private resolveInteractionValue(token: InteractionTokenDefinition): unknown {
    return token.$value.default;
  }

  // ==========================================================================
  // TOKEN TRANSFORMS
  // ==========================================================================

  /**
   * Register a custom transform
   */
  registerTransform(name: string, transform: TokenTransform): void {
    this.transforms.set(name, transform);
  }

  /**
   * Apply transforms to all tokens
   */
  applyTransforms(transformNames: string[]): void {
    const context: TokenTransformContext = {
      allTokens: this.toTokenFile(),
      colorScheme: this.config.colorScheme as 'light' | 'dark',
      platform: 'web',
    };

    for (const [path, token] of this.tokens) {
      let transformed = token;
      for (const name of transformNames) {
        const transform = this.transforms.get(name);
        if (transform) {
          transformed = transform(transformed, path, context);
        }
      }
      this.tokens.set(path, transformed);
    }

    this.resolvedCache.clear();
  }

  /**
   * Register built-in transforms
   */
  private registerBuiltInTransforms(): void {
    // Color to hex
    this.registerTransform('color/hex', (token, path, ctx) => {
      if (token.$type === 'color' && typeof token.$value === 'object') {
        // Convert color object to hex string
        return { ...token, $value: this.colorToHex(token.$value as unknown as Record<string, unknown>) };
      }
      return token;
    });

    // Color to RGB
    this.registerTransform('color/rgb', (token, path, ctx) => {
      if (token.$type === 'color') {
        return { ...token, $value: this.colorToRgb(token.$value as string) };
      }
      return token;
    });

    // Dimension to px
    this.registerTransform('dimension/px', (token, path, ctx) => {
      if (token.$type === 'dimension' && typeof token.$value === 'object') {
        const dim = token.$value as { $value: number; unit: string };
        if (dim.unit === 'rem') {
          return { ...token, $value: `${dim.$value * 16}px` };
        }
      }
      return token;
    });

    // Dimension to rem
    this.registerTransform('dimension/rem', (token, path, ctx) => {
      if (token.$type === 'dimension' && typeof token.$value === 'object') {
        const dim = token.$value as { $value: number; unit: string };
        if (dim.unit === 'px') {
          return { ...token, $value: `${dim.$value / 16}rem` };
        }
      }
      return token;
    });

    // Shadow to CSS
    this.registerTransform('shadow/css', (token, path, ctx) => {
      if (token.$type === 'shadow') {
        return { ...token, $value: this.shadowToCSS(token.$value as unknown) };
      }
      return token;
    });

    // Typography to CSS
    this.registerTransform('typography/css', (token, path, ctx) => {
      if (token.$type === 'typography') {
        return { ...token, $value: this.typographyToCSS(token.$value as unknown) };
      }
      return token;
    });
  }

  private colorToHex(color: Record<string, unknown>): string {
    // Simplified - would need proper conversion
    return String(color.$value || '#000000');
  }

  private colorToRgb(hex: string): string {
    if (!hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private shadowToCSS(shadow: unknown): string {
    if (Array.isArray(shadow)) {
      return shadow.map(s => this.singleShadowToCSS(s)).join(', ');
    }
    return this.singleShadowToCSS(shadow);
  }

  private singleShadowToCSS(shadow: unknown): string {
    const s = shadow as Record<string, unknown>;
    const inset = s.inset ? 'inset ' : '';
    return `${inset}${s.offsetX} ${s.offsetY} ${s.blur} ${s.spread || '0'} ${s.color}`;
  }

  private typographyToCSS(typography: unknown): Record<string, string> {
    const t = typography as Record<string, unknown>;
    return {
      fontFamily: String(t.fontFamily || 'inherit'),
      fontSize: String(t.fontSize || '1rem'),
      fontWeight: String(t.fontWeight || '400'),
      lineHeight: String(t.lineHeight || '1.5'),
      letterSpacing: String(t.letterSpacing || 'normal'),
    };
  }

  // ==========================================================================
  // TOKEN EXPORT
  // ==========================================================================

  /**
   * Export tokens to various formats
   */
  export(config: TokenExportConfig): TokenExportResult {
    let content: string;

    switch (config.format) {
      case 'css':
        content = this.exportToCSS(config);
        break;
      case 'scss':
        content = this.exportToSCSS(config);
        break;
      case 'json':
        content = this.exportToJSON(config);
        break;
      case 'ts':
        content = this.exportToTypeScript(config);
        break;
      case 'js':
        content = this.exportToJavaScript(config);
        break;
      default:
        content = this.exportToCSS(config);
    }

    return {
      format: config.format,
      content,
      tokens: this.tokens.size,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Export to CSS custom properties
   */
  private exportToCSS(config: TokenExportConfig): string {
    const prefix = config.prefix || '';
    const lines: string[] = [':root {'];

    for (const [path, token] of this.tokens) {
      if (config.filter && !config.filter(token, path)) continue;

      const resolved = this.resolve(path);
      if (!resolved) continue;

      const varName = this.pathToCSSVar(path, prefix);
      const value = this.valueToCSS(resolved.value);
      lines.push(`  ${varName}: ${value};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Export to SCSS variables
   */
  private exportToSCSS(config: TokenExportConfig): string {
    const prefix = config.prefix || '';
    const lines: string[] = [];

    for (const [path, token] of this.tokens) {
      if (config.filter && !config.filter(token, path)) continue;

      const resolved = this.resolve(path);
      if (!resolved) continue;

      const varName = this.pathToSCSSVar(path, prefix);
      const value = this.valueToCSS(resolved.value);
      lines.push(`${varName}: ${value};`);
    }

    return lines.join('\n');
  }

  /**
   * Export to JSON
   */
  private exportToJSON(config: TokenExportConfig): string {
    const result: Record<string, unknown> = {};

    for (const [path, token] of this.tokens) {
      if (config.filter && !config.filter(token, path)) continue;

      const resolved = this.resolve(path);
      if (!resolved) continue;

      this.setNestedValue(result, path.split('.'), resolved.value);
    }

    return JSON.stringify(result, null, 2);
  }

  /**
   * Export to TypeScript
   */
  private exportToTypeScript(config: TokenExportConfig): string {
    const lines: string[] = [
      '// Auto-generated design tokens',
      '// Do not edit directly',
      '',
      'export const tokens = {',
    ];

    for (const [path, token] of this.tokens) {
      if (config.filter && !config.filter(token, path)) continue;

      const resolved = this.resolve(path);
      if (!resolved) continue;

      const key = path.replace(/\./g, '_');
      const value = JSON.stringify(resolved.value);
      lines.push(`  ${key}: ${value},`);
    }

    lines.push('} as const;');
    lines.push('');
    lines.push('export type TokenKey = keyof typeof tokens;');

    return lines.join('\n');
  }

  /**
   * Export to JavaScript
   */
  private exportToJavaScript(config: TokenExportConfig): string {
    const lines: string[] = [
      '// Auto-generated design tokens',
      '// Do not edit directly',
      '',
      'export const tokens = {',
    ];

    for (const [path, token] of this.tokens) {
      if (config.filter && !config.filter(token, path)) continue;

      const resolved = this.resolve(path);
      if (!resolved) continue;

      const key = path.replace(/\./g, '_');
      const value = JSON.stringify(resolved.value);
      lines.push(`  ${key}: ${value},`);
    }

    lines.push('};');

    return lines.join('\n');
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Convert path to CSS variable name
   */
  private pathToCSSVar(path: string, prefix: string): string {
    const name = path.replace(/\./g, '-').replace(/([A-Z])/g, '-$1').toLowerCase();
    return `--${prefix}${prefix ? '-' : ''}${name}`;
  }

  /**
   * Convert path to SCSS variable name
   */
  private pathToSCSSVar(path: string, prefix: string): string {
    const name = path.replace(/\./g, '-').replace(/([A-Z])/g, '-$1').toLowerCase();
    return `$${prefix}${prefix ? '-' : ''}${name}`;
  }

  /**
   * Convert value to CSS string
   */
  private valueToCSS(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Set nested value in object
   */
  private setNestedValue(obj: Record<string, unknown>, keys: string[], value: unknown): void {
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
  }

  /**
   * Convert tokens back to file format
   */
  toTokenFile(): DesignTokenFile {
    const file: DesignTokenFile = {};

    for (const [path, token] of this.tokens) {
      this.setNestedValue(file as Record<string, unknown>, path.split('.'), token);
    }

    return file;
  }

  /**
   * Get all token paths
   */
  getPaths(): string[] {
    return Array.from(this.tokens.keys());
  }

  /**
   * Get token by path
   */
  getToken(path: string): TokenDefinition | undefined {
    return this.tokens.get(path);
  }

  /**
   * Set token value
   */
  setToken(path: string, token: TokenDefinition): void {
    this.tokens.set(path, token);
    this.resolvedCache.delete(path);
  }

  /**
   * Delete token
   */
  deleteToken(path: string): boolean {
    this.resolvedCache.delete(path);
    return this.tokens.delete(path);
  }

  /**
   * Clear all tokens
   */
  clear(): void {
    this.tokens.clear();
    this.resolvedCache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TokenResolverConfig>): void {
    this.config = { ...this.config, ...config };
    this.resolvedCache.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): TokenResolverConfig {
    return { ...this.config };
  }

  /**
   * Generate CSS variables for injection
   */
  generateCSSVariables(): string {
    return this.exportToCSS({ format: 'css' });
  }

  /**
   * Subscribe to token changes
   */
  private listeners: Set<(path: string, token: TokenDefinition) => void> = new Set();

  subscribe(listener: (path: string, token: TokenDefinition) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(path: string, token: TokenDefinition): void {
    for (const listener of this.listeners) {
      listener(path, token);
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new token engine instance
 */
export function createTokenEngine(config?: Partial<TokenResolverConfig>): TokenEngine {
  return new TokenEngine(config);
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

let defaultEngine: TokenEngine | null = null;

/**
 * Get the default token engine instance
 */
export function getDefaultTokenEngine(): TokenEngine {
  if (!defaultEngine) {
    defaultEngine = new TokenEngine();
  }
  return defaultEngine;
}
