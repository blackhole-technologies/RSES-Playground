/**
 * AI-Powered Color Intelligence System
 *
 * Provides intelligent color generation, accessibility analysis,
 * and design recommendations using algorithmic approaches.
 *
 * Features:
 * - Auto-generate color palettes from brand colors
 * - Suggest accessible color combinations
 * - Auto-adjust for contrast ratios
 * - Generate component color variations
 * - Color harmony analysis
 */

// ============================================================================
// COLOR TYPES
// ============================================================================

/**
 * Color representation in various formats
 */
export interface Color {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  oklch: { l: number; c: number; h: number };
  lab: { l: number; a: number; b: number };
}

/**
 * Color with metadata
 */
export interface ColorWithMeta extends Color {
  name?: string;
  semantic?: string;
  role?: ColorRole;
  accessibility?: ColorAccessibility;
}

export type ColorRole =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'surface'
  | 'text'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral';

export interface ColorAccessibility {
  contrastWhite: number;
  contrastBlack: number;
  wcagAANormal: boolean;
  wcagAALarge: boolean;
  wcagAAANormal: boolean;
  wcagAAALarge: boolean;
  colorBlindSafe: ColorBlindSafety;
}

export interface ColorBlindSafety {
  protanopia: boolean;
  deuteranopia: boolean;
  tritanopia: boolean;
  achromatopsia: boolean;
}

// ============================================================================
// COLOR CONVERSION UTILITIES
// ============================================================================

/**
 * Parse any color format to Color object
 */
export function parseColor(input: string): Color {
  let rgb: { r: number; g: number; b: number };

  if (input.startsWith('#')) {
    rgb = hexToRgb(input);
  } else if (input.startsWith('rgb')) {
    rgb = parseRgbString(input);
  } else if (input.startsWith('hsl')) {
    const hsl = parseHslString(input);
    rgb = hslToRgb(hsl);
  } else {
    throw new Error(`Unsupported color format: ${input}`);
  }

  return {
    hex: rgbToHex(rgb),
    rgb,
    hsl: rgbToHsl(rgb),
    oklch: rgbToOklch(rgb),
    lab: rgbToLab(rgb),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error('Invalid hex color');
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return '#' + [rgb.r, rgb.g, rgb.b]
    .map(x => Math.round(x).toString(16).padStart(2, '0'))
    .join('');
}

function parseRgbString(str: string): { r: number; g: number; b: number } {
  const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error('Invalid RGB string');
  return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
}

function parseHslString(str: string): { h: number; s: number; l: number } {
  const match = str.match(/hsla?\((\d+),\s*(\d+)%?,\s*(\d+)%?/);
  if (!match) throw new Error('Invalid HSL string');
  return { h: parseInt(match[1]), s: parseInt(match[2]), l: parseInt(match[3]) };
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

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

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(hsl: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function rgbToOklch(rgb: { r: number; g: number; b: number }): { l: number; c: number; h: number } {
  // Convert to linear RGB
  const linearize = (c: number) => {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const lr = linearize(rgb.r);
  const lg = linearize(rgb.g);
  const lb = linearize(rgb.b);

  // Convert to OKLab
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  // Convert to OKLCH
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  return { l: L, c, h };
}

function rgbToLab(rgb: { r: number; g: number; b: number }): { l: number; a: number; b: number } {
  // Convert RGB to XYZ
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16/116;

  const L = (116 * f(y)) - 16;
  const a = 500 * (f(x) - f(y));
  const bVal = 200 * (f(y) - f(z));

  return { l: L, a, b: bVal };
}

// ============================================================================
// CONTRAST & ACCESSIBILITY
// ============================================================================

/**
 * Calculate relative luminance
 */
export function getRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: Color, color2: Color): number {
  const l1 = getRelativeLuminance(color1.rgb);
  const l2 = getRelativeLuminance(color2.rgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check WCAG compliance
 */
export function checkWCAGCompliance(
  foreground: Color,
  background: Color
): {
  ratio: number;
  aa: { normal: boolean; large: boolean };
  aaa: { normal: boolean; large: boolean };
} {
  const ratio = getContrastRatio(foreground, background);
  return {
    ratio,
    aa: {
      normal: ratio >= 4.5,
      large: ratio >= 3,
    },
    aaa: {
      normal: ratio >= 7,
      large: ratio >= 4.5,
    },
  };
}

/**
 * Find accessible color by adjusting lightness
 */
export function findAccessibleColor(
  color: Color,
  background: Color,
  targetRatio: number = 4.5
): Color {
  const bgLuminance = getRelativeLuminance(background.rgb);
  let { h, s, l } = color.hsl;

  // Determine if we need to go lighter or darker
  const colorLuminance = getRelativeLuminance(color.rgb);
  const goLighter = colorLuminance < bgLuminance;

  // Binary search for the right lightness
  let low = goLighter ? l : 0;
  let high = goLighter ? 100 : l;

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const testRgb = hslToRgb({ h, s, l: mid });
    const testColor = parseColor(rgbToHex(testRgb));
    const ratio = getContrastRatio(testColor, background);

    if (Math.abs(ratio - targetRatio) < 0.1) {
      return testColor;
    }

    if (goLighter) {
      if (ratio < targetRatio) {
        high = mid;
      } else {
        low = mid;
      }
    } else {
      if (ratio < targetRatio) {
        low = mid;
      } else {
        high = mid;
      }
    }
  }

  // Return the best we found
  return parseColor(rgbToHex(hslToRgb({ h, s, l: (low + high) / 2 })));
}

// ============================================================================
// PALETTE GENERATION
// ============================================================================

export type HarmonyType =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic'
  | 'square'
  | 'monochromatic';

/**
 * Generate color harmony from base color
 */
export function generateHarmony(baseColor: Color, type: HarmonyType): Color[] {
  const { h, s, l } = baseColor.hsl;
  const colors: { h: number; s: number; l: number }[] = [];

  switch (type) {
    case 'complementary':
      colors.push({ h, s, l });
      colors.push({ h: (h + 180) % 360, s, l });
      break;

    case 'analogous':
      colors.push({ h: (h - 30 + 360) % 360, s, l });
      colors.push({ h, s, l });
      colors.push({ h: (h + 30) % 360, s, l });
      break;

    case 'triadic':
      colors.push({ h, s, l });
      colors.push({ h: (h + 120) % 360, s, l });
      colors.push({ h: (h + 240) % 360, s, l });
      break;

    case 'split-complementary':
      colors.push({ h, s, l });
      colors.push({ h: (h + 150) % 360, s, l });
      colors.push({ h: (h + 210) % 360, s, l });
      break;

    case 'tetradic':
      colors.push({ h, s, l });
      colors.push({ h: (h + 60) % 360, s, l });
      colors.push({ h: (h + 180) % 360, s, l });
      colors.push({ h: (h + 240) % 360, s, l });
      break;

    case 'square':
      colors.push({ h, s, l });
      colors.push({ h: (h + 90) % 360, s, l });
      colors.push({ h: (h + 180) % 360, s, l });
      colors.push({ h: (h + 270) % 360, s, l });
      break;

    case 'monochromatic':
      for (let i = 0; i < 5; i++) {
        const lightness = 20 + (i * 15);
        colors.push({ h, s, l: Math.min(90, lightness) });
      }
      break;
  }

  return colors.map(hsl => parseColor(rgbToHex(hslToRgb(hsl))));
}

/**
 * Generate a complete color scale (50-950)
 */
export function generateColorScale(baseColor: Color): Record<number, Color> {
  const { h, s } = baseColor.hsl;
  const scale: Record<number, Color> = {};

  const lightnessMap: Record<number, number> = {
    50: 97,
    100: 94,
    200: 86,
    300: 77,
    400: 66,
    500: 55,
    600: 45,
    700: 35,
    800: 25,
    900: 15,
    950: 8,
  };

  const saturationAdjust: Record<number, number> = {
    50: -15,
    100: -10,
    200: -5,
    300: 0,
    400: 5,
    500: 0,
    600: 5,
    700: 10,
    800: 10,
    900: 15,
    950: 20,
  };

  for (const [step, lightness] of Object.entries(lightnessMap)) {
    const stepNum = parseInt(step);
    const adjustedSat = Math.max(0, Math.min(100, s + saturationAdjust[stepNum]));
    scale[stepNum] = parseColor(rgbToHex(hslToRgb({ h, s: adjustedSat, l: lightness })));
  }

  return scale;
}

/**
 * Generate semantic color palette from brand color
 */
export function generateSemanticPalette(brandColor: Color): {
  primary: Record<number, Color>;
  secondary: Record<number, Color>;
  accent: Record<number, Color>;
  success: Record<number, Color>;
  warning: Record<number, Color>;
  error: Record<number, Color>;
  info: Record<number, Color>;
  neutral: Record<number, Color>;
} {
  const { h } = brandColor.hsl;

  // Generate harmonious colors
  const secondary = parseColor(rgbToHex(hslToRgb({ h: (h + 30) % 360, s: 60, l: 50 })));
  const accent = parseColor(rgbToHex(hslToRgb({ h: (h + 180) % 360, s: 70, l: 50 })));

  // Semantic colors with optimal hues
  const success = parseColor('#10B981'); // Green
  const warning = parseColor('#F59E0B'); // Amber
  const error = parseColor('#EF4444'); // Red
  const info = parseColor('#3B82F6'); // Blue
  const neutral = parseColor('#6B7280'); // Gray

  return {
    primary: generateColorScale(brandColor),
    secondary: generateColorScale(secondary),
    accent: generateColorScale(accent),
    success: generateColorScale(success),
    warning: generateColorScale(warning),
    error: generateColorScale(error),
    info: generateColorScale(info),
    neutral: generateColorScale(neutral),
  };
}

// ============================================================================
// AI-POWERED SUGGESTIONS
// ============================================================================

/**
 * Color suggestion with confidence score
 */
export interface ColorSuggestion {
  color: Color;
  confidence: number;
  reason: string;
  alternatives: Color[];
  accessibility: ColorAccessibility;
}

/**
 * Analyze color usage and suggest improvements
 */
export function analyzeColorPalette(colors: Color[]): {
  issues: ColorIssue[];
  suggestions: ColorSuggestion[];
  score: number;
} {
  const issues: ColorIssue[] = [];
  const suggestions: ColorSuggestion[] = [];

  // Check for accessibility issues
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ratio = getContrastRatio(colors[i], colors[j]);
      if (ratio < 3) {
        issues.push({
          type: 'low-contrast',
          severity: 'error',
          message: `Low contrast between colors ${i} and ${j}: ${ratio.toFixed(2)}`,
          affectedColors: [i, j],
        });
      }
    }
  }

  // Check for color blindness issues
  for (let i = 0; i < colors.length; i++) {
    const safety = checkColorBlindSafety(colors[i], colors);
    if (!safety.protanopia || !safety.deuteranopia) {
      issues.push({
        type: 'color-blind',
        severity: 'warning',
        message: `Color ${i} may not be distinguishable for color blind users`,
        affectedColors: [i],
      });
    }
  }

  // Calculate overall score
  const score = Math.max(0, 100 - (issues.filter(i => i.severity === 'error').length * 20) -
    (issues.filter(i => i.severity === 'warning').length * 5));

  return { issues, suggestions, score };
}

export interface ColorIssue {
  type: 'low-contrast' | 'color-blind' | 'harmony' | 'saturation' | 'temperature';
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedColors: number[];
}

/**
 * Check color blind safety against palette
 */
function checkColorBlindSafety(color: Color, palette: Color[]): ColorBlindSafety {
  // Simplified simulation - in production, use proper simulation algorithms
  const otherColors = palette.filter(c => c.hex !== color.hex);

  const checkDistinguishable = (simulateFn: (c: Color) => Color): boolean => {
    const simulated = simulateFn(color);
    return otherColors.every(other => {
      const otherSimulated = simulateFn(other);
      const distance = getColorDistance(simulated, otherSimulated);
      return distance > 25; // Threshold for distinguishability
    });
  };

  return {
    protanopia: checkDistinguishable(simulateProtanopia),
    deuteranopia: checkDistinguishable(simulateDeuteranopia),
    tritanopia: checkDistinguishable(simulateTritanopia),
    achromatopsia: checkDistinguishable(simulateAchromatopsia),
  };
}

function simulateProtanopia(color: Color): Color {
  // Simplified protanopia simulation
  const { r, g, b } = color.rgb;
  return parseColor(rgbToHex({
    r: Math.round(0.567 * r + 0.433 * g),
    g: Math.round(0.558 * r + 0.442 * g),
    b: Math.round(0.242 * g + 0.758 * b),
  }));
}

function simulateDeuteranopia(color: Color): Color {
  const { r, g, b } = color.rgb;
  return parseColor(rgbToHex({
    r: Math.round(0.625 * r + 0.375 * g),
    g: Math.round(0.7 * r + 0.3 * g),
    b: Math.round(0.3 * g + 0.7 * b),
  }));
}

function simulateTritanopia(color: Color): Color {
  const { r, g, b } = color.rgb;
  return parseColor(rgbToHex({
    r: Math.round(0.95 * r + 0.05 * g),
    g: Math.round(0.433 * g + 0.567 * b),
    b: Math.round(0.475 * g + 0.525 * b),
  }));
}

function simulateAchromatopsia(color: Color): Color {
  const { r, g, b } = color.rgb;
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return parseColor(rgbToHex({ r: gray, g: gray, b: gray }));
}

function getColorDistance(c1: Color, c2: Color): number {
  // CIE76 color difference using Lab
  const dL = c1.lab.l - c2.lab.l;
  const dA = c1.lab.a - c2.lab.a;
  const dB = c1.lab.b - c2.lab.b;
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

// ============================================================================
// DARK MODE GENERATION
// ============================================================================

/**
 * Generate dark mode variant of a color
 */
export function generateDarkModeColor(color: Color, mode: 'invert' | 'shift' | 'adaptive' = 'adaptive'): Color {
  const { h, s, l } = color.hsl;

  switch (mode) {
    case 'invert':
      return parseColor(rgbToHex(hslToRgb({ h, s, l: 100 - l })));

    case 'shift':
      // Shift towards darker while maintaining perceived brightness
      const newL = Math.max(10, l - 40);
      const newS = Math.min(100, s + 10);
      return parseColor(rgbToHex(hslToRgb({ h, s: newS, l: newL })));

    case 'adaptive':
      // Smart adjustment based on original lightness
      if (l > 70) {
        // Light colors become darker
        return parseColor(rgbToHex(hslToRgb({ h, s: Math.min(100, s + 10), l: 30 })));
      } else if (l < 30) {
        // Dark colors become lighter
        return parseColor(rgbToHex(hslToRgb({ h, s: Math.max(0, s - 10), l: 70 })));
      } else {
        // Mid-tones shift appropriately
        return parseColor(rgbToHex(hslToRgb({ h, s, l: l < 50 ? l + 20 : l - 20 })));
      }
  }
}

/**
 * Generate complete dark mode palette
 */
export function generateDarkModePalette(
  lightPalette: Record<number, Color>
): Record<number, Color> {
  const darkPalette: Record<number, Color> = {};

  // Invert the scale
  const steps = Object.keys(lightPalette).map(Number).sort((a, b) => a - b);
  const reversedSteps = [...steps].reverse();

  steps.forEach((step, index) => {
    const sourceStep = reversedSteps[index];
    const sourceColor = lightPalette[sourceStep];

    // Adjust for dark mode readability
    const { h, s, l } = sourceColor.hsl;
    const adjustedL = Math.max(10, Math.min(95, l));
    const adjustedS = step < 500 ? Math.max(0, s - 5) : Math.min(100, s + 5);

    darkPalette[step] = parseColor(rgbToHex(hslToRgb({ h, s: adjustedS, l: adjustedL })));
  });

  return darkPalette;
}

// ============================================================================
// EXPORT
// ============================================================================

export const ColorIntelligence = {
  parseColor,
  getContrastRatio,
  checkWCAGCompliance,
  findAccessibleColor,
  generateHarmony,
  generateColorScale,
  generateSemanticPalette,
  analyzeColorPalette,
  generateDarkModeColor,
  generateDarkModePalette,
};
