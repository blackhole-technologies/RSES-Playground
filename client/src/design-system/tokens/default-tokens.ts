/**
 * Default Design Tokens
 *
 * Comprehensive token set following W3C Design Tokens specification
 * Inspired by: Shopify Polaris, IBM Carbon, Material Design 3, Radix Themes
 */

import type { DesignTokenFile } from '../types/w3c-tokens';

export const defaultTokens: DesignTokenFile = {
  $name: 'RSES Design System',
  $description: 'Default design tokens for the RSES Design System 2.0',
  $version: '2.0.0',

  // ==========================================================================
  // COLORS - PRIMITIVES
  // ==========================================================================
  color: {
    $description: 'Color tokens',

    // Neutral scale (gray)
    neutral: {
      $type: 'color',
      50: { $value: '#fafafa', $extensions: { 'org.rses.category': 'neutral' } },
      100: { $value: '#f4f4f5', $extensions: { 'org.rses.category': 'neutral' } },
      200: { $value: '#e4e4e7', $extensions: { 'org.rses.category': 'neutral' } },
      300: { $value: '#d4d4d8', $extensions: { 'org.rses.category': 'neutral' } },
      400: { $value: '#a1a1aa', $extensions: { 'org.rses.category': 'neutral' } },
      500: { $value: '#71717a', $extensions: { 'org.rses.category': 'neutral' } },
      600: { $value: '#52525b', $extensions: { 'org.rses.category': 'neutral' } },
      700: { $value: '#3f3f46', $extensions: { 'org.rses.category': 'neutral' } },
      800: { $value: '#27272a', $extensions: { 'org.rses.category': 'neutral' } },
      900: { $value: '#18181b', $extensions: { 'org.rses.category': 'neutral' } },
      950: { $value: '#09090b', $extensions: { 'org.rses.category': 'neutral' } },
    },

    // Primary scale (blue)
    primary: {
      $type: 'color',
      50: { $value: '#eff6ff', $extensions: { 'org.rses.category': 'primary' } },
      100: { $value: '#dbeafe', $extensions: { 'org.rses.category': 'primary' } },
      200: { $value: '#bfdbfe', $extensions: { 'org.rses.category': 'primary' } },
      300: { $value: '#93c5fd', $extensions: { 'org.rses.category': 'primary' } },
      400: { $value: '#60a5fa', $extensions: { 'org.rses.category': 'primary' } },
      500: { $value: '#3b82f6', $extensions: { 'org.rses.category': 'primary' } },
      600: { $value: '#2563eb', $extensions: { 'org.rses.category': 'primary' } },
      700: { $value: '#1d4ed8', $extensions: { 'org.rses.category': 'primary' } },
      800: { $value: '#1e40af', $extensions: { 'org.rses.category': 'primary' } },
      900: { $value: '#1e3a8a', $extensions: { 'org.rses.category': 'primary' } },
      950: { $value: '#172554', $extensions: { 'org.rses.category': 'primary' } },
    },

    // Secondary scale (violet)
    secondary: {
      $type: 'color',
      50: { $value: '#f5f3ff', $extensions: { 'org.rses.category': 'secondary' } },
      100: { $value: '#ede9fe', $extensions: { 'org.rses.category': 'secondary' } },
      200: { $value: '#ddd6fe', $extensions: { 'org.rses.category': 'secondary' } },
      300: { $value: '#c4b5fd', $extensions: { 'org.rses.category': 'secondary' } },
      400: { $value: '#a78bfa', $extensions: { 'org.rses.category': 'secondary' } },
      500: { $value: '#8b5cf6', $extensions: { 'org.rses.category': 'secondary' } },
      600: { $value: '#7c3aed', $extensions: { 'org.rses.category': 'secondary' } },
      700: { $value: '#6d28d9', $extensions: { 'org.rses.category': 'secondary' } },
      800: { $value: '#5b21b6', $extensions: { 'org.rses.category': 'secondary' } },
      900: { $value: '#4c1d95', $extensions: { 'org.rses.category': 'secondary' } },
      950: { $value: '#2e1065', $extensions: { 'org.rses.category': 'secondary' } },
    },

    // Accent scale (cyan)
    accent: {
      $type: 'color',
      50: { $value: '#ecfeff', $extensions: { 'org.rses.category': 'accent' } },
      100: { $value: '#cffafe', $extensions: { 'org.rses.category': 'accent' } },
      200: { $value: '#a5f3fc', $extensions: { 'org.rses.category': 'accent' } },
      300: { $value: '#67e8f9', $extensions: { 'org.rses.category': 'accent' } },
      400: { $value: '#22d3ee', $extensions: { 'org.rses.category': 'accent' } },
      500: { $value: '#06b6d4', $extensions: { 'org.rses.category': 'accent' } },
      600: { $value: '#0891b2', $extensions: { 'org.rses.category': 'accent' } },
      700: { $value: '#0e7490', $extensions: { 'org.rses.category': 'accent' } },
      800: { $value: '#155e75', $extensions: { 'org.rses.category': 'accent' } },
      900: { $value: '#164e63', $extensions: { 'org.rses.category': 'accent' } },
      950: { $value: '#083344', $extensions: { 'org.rses.category': 'accent' } },
    },

    // Success scale (green)
    success: {
      $type: 'color',
      50: { $value: '#f0fdf4', $extensions: { 'org.rses.category': 'success' } },
      100: { $value: '#dcfce7', $extensions: { 'org.rses.category': 'success' } },
      200: { $value: '#bbf7d0', $extensions: { 'org.rses.category': 'success' } },
      300: { $value: '#86efac', $extensions: { 'org.rses.category': 'success' } },
      400: { $value: '#4ade80', $extensions: { 'org.rses.category': 'success' } },
      500: { $value: '#22c55e', $extensions: { 'org.rses.category': 'success' } },
      600: { $value: '#16a34a', $extensions: { 'org.rses.category': 'success' } },
      700: { $value: '#15803d', $extensions: { 'org.rses.category': 'success' } },
      800: { $value: '#166534', $extensions: { 'org.rses.category': 'success' } },
      900: { $value: '#14532d', $extensions: { 'org.rses.category': 'success' } },
      950: { $value: '#052e16', $extensions: { 'org.rses.category': 'success' } },
    },

    // Warning scale (amber)
    warning: {
      $type: 'color',
      50: { $value: '#fffbeb', $extensions: { 'org.rses.category': 'warning' } },
      100: { $value: '#fef3c7', $extensions: { 'org.rses.category': 'warning' } },
      200: { $value: '#fde68a', $extensions: { 'org.rses.category': 'warning' } },
      300: { $value: '#fcd34d', $extensions: { 'org.rses.category': 'warning' } },
      400: { $value: '#fbbf24', $extensions: { 'org.rses.category': 'warning' } },
      500: { $value: '#f59e0b', $extensions: { 'org.rses.category': 'warning' } },
      600: { $value: '#d97706', $extensions: { 'org.rses.category': 'warning' } },
      700: { $value: '#b45309', $extensions: { 'org.rses.category': 'warning' } },
      800: { $value: '#92400e', $extensions: { 'org.rses.category': 'warning' } },
      900: { $value: '#78350f', $extensions: { 'org.rses.category': 'warning' } },
      950: { $value: '#451a03', $extensions: { 'org.rses.category': 'warning' } },
    },

    // Error scale (red)
    error: {
      $type: 'color',
      50: { $value: '#fef2f2', $extensions: { 'org.rses.category': 'error' } },
      100: { $value: '#fee2e2', $extensions: { 'org.rses.category': 'error' } },
      200: { $value: '#fecaca', $extensions: { 'org.rses.category': 'error' } },
      300: { $value: '#fca5a5', $extensions: { 'org.rses.category': 'error' } },
      400: { $value: '#f87171', $extensions: { 'org.rses.category': 'error' } },
      500: { $value: '#ef4444', $extensions: { 'org.rses.category': 'error' } },
      600: { $value: '#dc2626', $extensions: { 'org.rses.category': 'error' } },
      700: { $value: '#b91c1c', $extensions: { 'org.rses.category': 'error' } },
      800: { $value: '#991b1b', $extensions: { 'org.rses.category': 'error' } },
      900: { $value: '#7f1d1d', $extensions: { 'org.rses.category': 'error' } },
      950: { $value: '#450a0a', $extensions: { 'org.rses.category': 'error' } },
    },

    // Info scale (sky)
    info: {
      $type: 'color',
      50: { $value: '#f0f9ff', $extensions: { 'org.rses.category': 'info' } },
      100: { $value: '#e0f2fe', $extensions: { 'org.rses.category': 'info' } },
      200: { $value: '#bae6fd', $extensions: { 'org.rses.category': 'info' } },
      300: { $value: '#7dd3fc', $extensions: { 'org.rses.category': 'info' } },
      400: { $value: '#38bdf8', $extensions: { 'org.rses.category': 'info' } },
      500: { $value: '#0ea5e9', $extensions: { 'org.rses.category': 'info' } },
      600: { $value: '#0284c7', $extensions: { 'org.rses.category': 'info' } },
      700: { $value: '#0369a1', $extensions: { 'org.rses.category': 'info' } },
      800: { $value: '#075985', $extensions: { 'org.rses.category': 'info' } },
      900: { $value: '#0c4a6e', $extensions: { 'org.rses.category': 'info' } },
      950: { $value: '#082f49', $extensions: { 'org.rses.category': 'info' } },
    },
  },

  // ==========================================================================
  // COLORS - SEMANTIC
  // ==========================================================================
  semantic: {
    $description: 'Semantic color tokens',

    background: { $value: '{color.neutral.50}', $type: 'color' },
    foreground: { $value: '{color.neutral.950}', $type: 'color' },

    card: { $value: '#ffffff', $type: 'color' },
    cardForeground: { $value: '{color.neutral.950}', $type: 'color' },

    popover: { $value: '#ffffff', $type: 'color' },
    popoverForeground: { $value: '{color.neutral.950}', $type: 'color' },

    primary: { $value: '{color.primary.500}', $type: 'color' },
    primaryForeground: { $value: '#ffffff', $type: 'color' },

    secondary: { $value: '{color.secondary.500}', $type: 'color' },
    secondaryForeground: { $value: '#ffffff', $type: 'color' },

    muted: { $value: '{color.neutral.100}', $type: 'color' },
    mutedForeground: { $value: '{color.neutral.500}', $type: 'color' },

    accent: { $value: '{color.accent.500}', $type: 'color' },
    accentForeground: { $value: '#ffffff', $type: 'color' },

    destructive: { $value: '{color.error.500}', $type: 'color' },
    destructiveForeground: { $value: '#ffffff', $type: 'color' },

    success: { $value: '{color.success.500}', $type: 'color' },
    successForeground: { $value: '#ffffff', $type: 'color' },

    warning: { $value: '{color.warning.500}', $type: 'color' },
    warningForeground: { $value: '{color.neutral.950}', $type: 'color' },

    info: { $value: '{color.info.500}', $type: 'color' },
    infoForeground: { $value: '#ffffff', $type: 'color' },

    border: { $value: '{color.neutral.200}', $type: 'color' },
    borderSubtle: { $value: '{color.neutral.100}', $type: 'color' },

    input: { $value: '{color.neutral.200}', $type: 'color' },
    inputForeground: { $value: '{color.neutral.950}', $type: 'color' },

    ring: { $value: '{color.primary.500}', $type: 'color' },

    selection: { $value: '{color.primary.100}', $type: 'color' },
    selectionForeground: { $value: '{color.primary.900}', $type: 'color' },

    link: { $value: '{color.primary.600}', $type: 'color' },
    linkHover: { $value: '{color.primary.700}', $type: 'color' },
    linkVisited: { $value: '{color.secondary.600}', $type: 'color' },
  },

  // ==========================================================================
  // SPACING
  // ==========================================================================
  spacing: {
    $description: 'Spacing tokens',

    0: { $value: '0px', $type: 'dimension' },
    px: { $value: '1px', $type: 'dimension' },
    0.5: { $value: '0.125rem', $type: 'dimension' },
    1: { $value: '0.25rem', $type: 'dimension' },
    1.5: { $value: '0.375rem', $type: 'dimension' },
    2: { $value: '0.5rem', $type: 'dimension' },
    2.5: { $value: '0.625rem', $type: 'dimension' },
    3: { $value: '0.75rem', $type: 'dimension' },
    3.5: { $value: '0.875rem', $type: 'dimension' },
    4: { $value: '1rem', $type: 'dimension' },
    5: { $value: '1.25rem', $type: 'dimension' },
    6: { $value: '1.5rem', $type: 'dimension' },
    7: { $value: '1.75rem', $type: 'dimension' },
    8: { $value: '2rem', $type: 'dimension' },
    9: { $value: '2.25rem', $type: 'dimension' },
    10: { $value: '2.5rem', $type: 'dimension' },
    11: { $value: '2.75rem', $type: 'dimension' },
    12: { $value: '3rem', $type: 'dimension' },
    14: { $value: '3.5rem', $type: 'dimension' },
    16: { $value: '4rem', $type: 'dimension' },
    20: { $value: '5rem', $type: 'dimension' },
    24: { $value: '6rem', $type: 'dimension' },
    28: { $value: '7rem', $type: 'dimension' },
    32: { $value: '8rem', $type: 'dimension' },
    36: { $value: '9rem', $type: 'dimension' },
    40: { $value: '10rem', $type: 'dimension' },
    44: { $value: '11rem', $type: 'dimension' },
    48: { $value: '12rem', $type: 'dimension' },
    52: { $value: '13rem', $type: 'dimension' },
    56: { $value: '14rem', $type: 'dimension' },
    60: { $value: '15rem', $type: 'dimension' },
    64: { $value: '16rem', $type: 'dimension' },
    72: { $value: '18rem', $type: 'dimension' },
    80: { $value: '20rem', $type: 'dimension' },
    96: { $value: '24rem', $type: 'dimension' },
  },

  // ==========================================================================
  // TYPOGRAPHY
  // ==========================================================================
  font: {
    $description: 'Typography tokens',

    family: {
      sans: {
        $value: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
        $type: 'fontFamily',
      },
      serif: {
        $value: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
        $type: 'fontFamily',
      },
      mono: {
        $value: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
        $type: 'fontFamily',
      },
      display: {
        $value: 'Cal Sans, Inter, ui-sans-serif, sans-serif',
        $type: 'fontFamily',
      },
    },

    size: {
      xs: { $value: '0.75rem', $type: 'dimension' },
      sm: { $value: '0.875rem', $type: 'dimension' },
      base: { $value: '1rem', $type: 'dimension' },
      lg: { $value: '1.125rem', $type: 'dimension' },
      xl: { $value: '1.25rem', $type: 'dimension' },
      '2xl': { $value: '1.5rem', $type: 'dimension' },
      '3xl': { $value: '1.875rem', $type: 'dimension' },
      '4xl': { $value: '2.25rem', $type: 'dimension' },
      '5xl': { $value: '3rem', $type: 'dimension' },
      '6xl': { $value: '3.75rem', $type: 'dimension' },
      '7xl': { $value: '4.5rem', $type: 'dimension' },
      '8xl': { $value: '6rem', $type: 'dimension' },
      '9xl': { $value: '8rem', $type: 'dimension' },
    },

    weight: {
      thin: { $value: 100, $type: 'fontWeight' },
      extralight: { $value: 200, $type: 'fontWeight' },
      light: { $value: 300, $type: 'fontWeight' },
      normal: { $value: 400, $type: 'fontWeight' },
      medium: { $value: 500, $type: 'fontWeight' },
      semibold: { $value: 600, $type: 'fontWeight' },
      bold: { $value: 700, $type: 'fontWeight' },
      extrabold: { $value: 800, $type: 'fontWeight' },
      black: { $value: 900, $type: 'fontWeight' },
    },

    lineHeight: {
      none: { $value: 1, $type: 'number' },
      tight: { $value: 1.25, $type: 'number' },
      snug: { $value: 1.375, $type: 'number' },
      normal: { $value: 1.5, $type: 'number' },
      relaxed: { $value: 1.625, $type: 'number' },
      loose: { $value: 2, $type: 'number' },
    },

    letterSpacing: {
      tighter: { $value: '-0.05em', $type: 'dimension' },
      tight: { $value: '-0.025em', $type: 'dimension' },
      normal: { $value: '0em', $type: 'dimension' },
      wide: { $value: '0.025em', $type: 'dimension' },
      wider: { $value: '0.05em', $type: 'dimension' },
      widest: { $value: '0.1em', $type: 'dimension' },
    },
  },

  // ==========================================================================
  // BORDERS
  // ==========================================================================
  border: {
    $description: 'Border tokens',

    radius: {
      none: { $value: '0px', $type: 'dimension' },
      sm: { $value: '0.125rem', $type: 'dimension' },
      base: { $value: '0.25rem', $type: 'dimension' },
      md: { $value: '0.375rem', $type: 'dimension' },
      lg: { $value: '0.5rem', $type: 'dimension' },
      xl: { $value: '0.75rem', $type: 'dimension' },
      '2xl': { $value: '1rem', $type: 'dimension' },
      '3xl': { $value: '1.5rem', $type: 'dimension' },
      full: { $value: '9999px', $type: 'dimension' },
    },

    width: {
      none: { $value: '0px', $type: 'dimension' },
      hairline: { $value: '0.5px', $type: 'dimension' },
      thin: { $value: '1px', $type: 'dimension' },
      base: { $value: '1px', $type: 'dimension' },
      medium: { $value: '2px', $type: 'dimension' },
      thick: { $value: '4px', $type: 'dimension' },
    },
  },

  // ==========================================================================
  // SHADOWS
  // ==========================================================================
  shadow: {
    $description: 'Shadow tokens',

    none: { $value: 'none', $type: 'shadow' },
    sm: { $value: '0 1px 2px 0 rgb(0 0 0 / 0.05)', $type: 'shadow' },
    base: { $value: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)', $type: 'shadow' },
    md: { $value: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', $type: 'shadow' },
    lg: { $value: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', $type: 'shadow' },
    xl: { $value: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', $type: 'shadow' },
    '2xl': { $value: '0 25px 50px -12px rgb(0 0 0 / 0.25)', $type: 'shadow' },
    inner: { $value: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)', $type: 'shadow' },
  },

  // ==========================================================================
  // MOTION
  // ==========================================================================
  motion: {
    $description: 'Motion/animation tokens',

    duration: {
      instant: { $value: '0ms', $type: 'duration' },
      ultraFast: { $value: '50ms', $type: 'duration' },
      fast: { $value: '100ms', $type: 'duration' },
      normal: { $value: '200ms', $type: 'duration' },
      medium: { $value: '300ms', $type: 'duration' },
      slow: { $value: '400ms', $type: 'duration' },
      slower: { $value: '500ms', $type: 'duration' },
      slowest: { $value: '700ms', $type: 'duration' },
      extended: { $value: '1000ms', $type: 'duration' },
    },

    easing: {
      linear: { $value: [0, 0, 1, 1], $type: 'cubicBezier' },
      standard: { $value: [0.2, 0, 0, 1], $type: 'cubicBezier' },
      standardDecelerate: { $value: [0, 0, 0, 1], $type: 'cubicBezier' },
      standardAccelerate: { $value: [0.3, 0, 1, 1], $type: 'cubicBezier' },
      emphasized: { $value: [0.2, 0, 0, 1], $type: 'cubicBezier' },
      emphasizedDecelerate: { $value: [0.05, 0.7, 0.1, 1], $type: 'cubicBezier' },
      emphasizedAccelerate: { $value: [0.3, 0, 0.8, 0.15], $type: 'cubicBezier' },
      easeInOut: { $value: [0.4, 0, 0.2, 1], $type: 'cubicBezier' },
      easeOut: { $value: [0, 0, 0.2, 1], $type: 'cubicBezier' },
      easeIn: { $value: [0.4, 0, 1, 1], $type: 'cubicBezier' },
      bouncy: { $value: [0.68, -0.55, 0.265, 1.55], $type: 'cubicBezier' },
    },
  },

  // ==========================================================================
  // Z-INDEX
  // ==========================================================================
  zIndex: {
    $description: 'Z-index tokens',

    hide: { $value: -1, $type: 'number' },
    base: { $value: 0, $type: 'number' },
    dropdown: { $value: 1000, $type: 'number' },
    sticky: { $value: 1100, $type: 'number' },
    fixed: { $value: 1200, $type: 'number' },
    overlay: { $value: 1300, $type: 'number' },
    modal: { $value: 1400, $type: 'number' },
    popover: { $value: 1500, $type: 'number' },
    toast: { $value: 1600, $type: 'number' },
    tooltip: { $value: 1700, $type: 'number' },
    maximum: { $value: 9999, $type: 'number' },
  },

  // ==========================================================================
  // OPACITY
  // ==========================================================================
  opacity: {
    $description: 'Opacity tokens',

    0: { $value: 0, $type: 'number' },
    5: { $value: 0.05, $type: 'number' },
    10: { $value: 0.1, $type: 'number' },
    20: { $value: 0.2, $type: 'number' },
    25: { $value: 0.25, $type: 'number' },
    30: { $value: 0.3, $type: 'number' },
    40: { $value: 0.4, $type: 'number' },
    50: { $value: 0.5, $type: 'number' },
    60: { $value: 0.6, $type: 'number' },
    70: { $value: 0.7, $type: 'number' },
    75: { $value: 0.75, $type: 'number' },
    80: { $value: 0.8, $type: 'number' },
    90: { $value: 0.9, $type: 'number' },
    95: { $value: 0.95, $type: 'number' },
    100: { $value: 1, $type: 'number' },
  },

  // ==========================================================================
  // BREAKPOINTS
  // ==========================================================================
  breakpoint: {
    $description: 'Responsive breakpoint tokens',

    xs: { $value: '0px', $type: 'dimension' },
    sm: { $value: '640px', $type: 'dimension' },
    md: { $value: '768px', $type: 'dimension' },
    lg: { $value: '1024px', $type: 'dimension' },
    xl: { $value: '1280px', $type: 'dimension' },
    '2xl': { $value: '1536px', $type: 'dimension' },
  },
};

/**
 * Dark mode token overrides
 */
export const darkModeTokens: Partial<DesignTokenFile> = {
  semantic: {
    background: { $value: '{color.neutral.950}', $type: 'color' },
    foreground: { $value: '{color.neutral.50}', $type: 'color' },

    card: { $value: '{color.neutral.900}', $type: 'color' },
    cardForeground: { $value: '{color.neutral.50}', $type: 'color' },

    popover: { $value: '{color.neutral.900}', $type: 'color' },
    popoverForeground: { $value: '{color.neutral.50}', $type: 'color' },

    muted: { $value: '{color.neutral.800}', $type: 'color' },
    mutedForeground: { $value: '{color.neutral.400}', $type: 'color' },

    border: { $value: '{color.neutral.800}', $type: 'color' },
    borderSubtle: { $value: '{color.neutral.900}', $type: 'color' },

    input: { $value: '{color.neutral.800}', $type: 'color' },
    inputForeground: { $value: '{color.neutral.50}', $type: 'color' },

    selection: { $value: '{color.primary.900}', $type: 'color' },
    selectionForeground: { $value: '{color.primary.100}', $type: 'color' },
  },
};
