/**
 * RSES CMS Design Token Utilities
 *
 * Functions for working with design tokens, converting to CSS,
 * and resolving token references.
 */

import type { DesignTokens, TokenPath, HSLColor, ColorValue } from '../types';

// ============================================================================
// TOKEN PATH RESOLUTION
// ============================================================================

/**
 * Resolve a token path to its value
 */
export function resolveTokenPath(tokens: DesignTokens, path: TokenPath): unknown {
  const parts = path.split('.');
  let current: unknown = tokens;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Set a value at a token path
 */
export function setTokenPath(
  tokens: DesignTokens,
  path: TokenPath,
  value: unknown
): DesignTokens {
  const result = structuredClone(tokens);
  const parts = path.split('.');
  let current: Record<string, unknown> = result as unknown as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

// ============================================================================
// CSS CUSTOM PROPERTY CONVERSION
// ============================================================================

/**
 * Convert design tokens to CSS custom properties
 */
export function tokensToCSS(tokens: Partial<DesignTokens>): Record<string, string> {
  const cssVars: Record<string, string> = {};

  function processObject(obj: unknown, prefix: string): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== 'object') {
      // Primitive value
      cssVars[prefix] = formatCSSValue(obj);
      return;
    }

    if (Array.isArray(obj)) {
      cssVars[prefix] = obj.join(', ');
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      const newPrefix = prefix ? `${prefix}-${kebabCase(key)}` : `--${kebabCase(key)}`;
      processObject(value, newPrefix);
    }
  }

  processObject(tokens, '');
  return cssVars;
}

/**
 * Convert a CSS custom properties object to a CSS string
 */
export function cssVarsToString(
  cssVars: Record<string, string>,
  selector = ':root'
): string {
  const entries = Object.entries(cssVars)
    .map(([prop, value]) => `  ${prop}: ${value};`)
    .join('\n');

  return `${selector} {\n${entries}\n}`;
}

/**
 * Generate CSS for all color schemes
 */
export function generateColorSchemesCSS(tokens: DesignTokens): string {
  const lightCSS = cssVarsToString(
    tokensToCSS(tokens),
    ':root, .light'
  );

  // Dark mode would need separate dark tokens
  // This is a placeholder - actual implementation would use
  // the color scheme tokens from the manifest

  return lightCSS;
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Parse an HSL color value
 */
export function parseHSL(value: string): HSLColor | null {
  // Match hsl(h, s%, l%) or hsl(h s% l%)
  const match = value.match(/hsla?\((\d+),?\s*(\d+)%?,?\s*(\d+)%?(?:,?\s*([\d.]+))?\)/);
  if (!match) return null;

  return {
    h: parseInt(match[1], 10),
    s: parseInt(match[2], 10),
    l: parseInt(match[3], 10),
    a: match[4] ? parseFloat(match[4]) : undefined,
  };
}

/**
 * Format an HSL color to string
 */
export function formatHSL(color: HSLColor): string {
  if (color.a !== undefined && color.a < 1) {
    return `hsla(${color.h}, ${color.s}%, ${color.l}%, ${color.a})`;
  }
  return `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
}

/**
 * Convert hex to HSL
 */
export function hexToHSL(hex: string): HSLColor {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse RGB
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Adjust color lightness
 */
export function adjustLightness(color: HSLColor, amount: number): HSLColor {
  return {
    ...color,
    l: Math.max(0, Math.min(100, color.l + amount)),
  };
}

/**
 * Adjust color saturation
 */
export function adjustSaturation(color: HSLColor, amount: number): HSLColor {
  return {
    ...color,
    s: Math.max(0, Math.min(100, color.s + amount)),
  };
}

/**
 * Adjust color alpha
 */
export function adjustAlpha(color: HSLColor, alpha: number): HSLColor {
  return {
    ...color,
    a: Math.max(0, Math.min(1, alpha)),
  };
}

/**
 * Generate a color scale from a base color
 */
export function generateColorScale(baseColor: HSLColor): Record<string, string> {
  const scale: Record<string, string> = {};
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

  // 500 is the base, lighter goes up in lightness, darker goes down
  const baseLightness = 50; // Target lightness for 500
  const lightnessRange = {
    50: 97,
    100: 90,
    200: 80,
    300: 70,
    400: 60,
    500: 50,
    600: 40,
    700: 30,
    800: 20,
    900: 12,
    950: 6,
  };

  for (const step of steps) {
    const adjustedColor = {
      ...baseColor,
      l: lightnessRange[step as keyof typeof lightnessRange],
    };
    scale[step.toString()] = formatHSL(adjustedColor);
  }

  return scale;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert camelCase to kebab-case
 */
function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Format a value for CSS
 */
function formatCSSValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'h' in value) {
    // HSL color
    return formatHSL(value as HSLColor);
  }
  return String(value);
}

/**
 * Create a CSS variable reference
 */
export function cssVar(name: string, fallback?: string): string {
  if (fallback) {
    return `var(--${name}, ${fallback})`;
  }
  return `var(--${name})`;
}

/**
 * Check if a value is a token reference
 */
export function isTokenReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

/**
 * Extract token path from reference
 */
export function extractTokenPath(reference: string): string {
  return reference.slice(1, -1);
}

// ============================================================================
// TAILWIND CSS INTEGRATION
// ============================================================================

/**
 * Generate Tailwind CSS config extend object from tokens
 */
export function tokensToTailwindConfig(tokens: DesignTokens): Record<string, unknown> {
  return {
    colors: flattenColors(tokens.colors),
    spacing: flattenObject(tokens.spacing.scale, ''),
    fontFamily: Object.fromEntries(
      Object.entries(tokens.typography.families).map(([key, value]) => {
        const fontStack = value as { family: string; fallbacks: string[] };
        return [key, [fontStack.family, ...fontStack.fallbacks]];
      })
    ),
    fontSize: flattenObject(tokens.typography.sizes, ''),
    fontWeight: flattenObject(tokens.typography.weights, ''),
    lineHeight: flattenObject(tokens.typography.lineHeights, ''),
    letterSpacing: flattenObject(tokens.typography.letterSpacing, ''),
    borderRadius: flattenObject(tokens.borders.radius, ''),
    boxShadow: {
      ...flattenObject(tokens.shadows.scale, ''),
      ...flattenObject(tokens.shadows.semantic, ''),
    },
    zIndex: flattenObject(tokens.zIndex.scale, ''),
    transitionDuration: flattenObject(tokens.motion.duration, ''),
    transitionTimingFunction: flattenObject(tokens.motion.easing, ''),
  };
}

/**
 * Flatten color tokens for Tailwind
 */
function flattenColors(colors: DesignTokens['colors']): Record<string, string | Record<string, string>> {
  const result: Record<string, string | Record<string, string>> = {};

  // Primitive colors (scales)
  for (const [name, scale] of Object.entries(colors.primitives)) {
    if (name === 'custom') {
      for (const [customName, customScale] of Object.entries(scale as Record<string, unknown>)) {
        result[customName] = customScale as Record<string, string>;
      }
    } else {
      // Convert ColorScale to Record<string, string>
      const scaleObj = scale as Record<string, unknown>;
      const stringScale: Record<string, string> = {};
      for (const [k, v] of Object.entries(scaleObj)) {
        stringScale[k] = String(v);
      }
      result[name] = stringScale;
    }
  }

  // Semantic colors
  for (const [name, value] of Object.entries(colors.semantic)) {
    if (name === 'custom') {
      for (const [customName, customValue] of Object.entries(value as Record<string, string>)) {
        result[customName] = customValue;
      }
    } else {
      result[name] = value as string;
    }
  }

  return result;
}

/**
 * Flatten an object for Tailwind
 */
function flattenObject(
  obj: Record<string, unknown>,
  _prefix: string
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      const nested = flattenObject(value as Record<string, unknown>, key);
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        result[`${key}-${nestedKey}`] = nestedValue;
      }
    } else {
      result[key] = String(value);
    }
  }

  return result;
}
