/**
 * RSES CMS Theme System
 *
 * A Drupal-inspired theming architecture for React applications.
 *
 * Features:
 * - Theme inheritance (base themes that others extend)
 * - Design tokens (CSS custom properties + TypeScript types)
 * - Component override system
 * - Region-based layouts
 * - Template suggestions
 * - Library/asset management
 * - Dark/light mode support
 * - Responsive breakpoints
 * - Theme settings UI
 *
 * @example
 * ```tsx
 * import { ThemeProvider, useTheme, Region, Layout } from '@/theme';
 *
 * function App() {
 *   return (
 *     <ThemeProvider theme="quantum-os">
 *       <Layout layout="sidebar-left">
 *         <Region name="content">
 *           <YourContent />
 *         </Region>
 *       </Layout>
 *     </ThemeProvider>
 *   );
 * }
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export * from './types';

// ============================================================================
// CONTEXT & HOOKS
// ============================================================================

export {
  ThemeProvider,
  useTheme,
  useDesignTokens,
  useColorScheme,
  useBreakpointValue,
  useThemeSettings,
  useThemeFeature,
} from './context/ThemeContext';

// ============================================================================
// CORE UTILITIES
// ============================================================================

export {
  createThemeRegistry,
  getDefaultRegistry,
} from './core/registry';

export {
  tokensToCSS,
  cssVarsToString,
  resolveTokenPath,
  setTokenPath,
  cssVar,
  isTokenReference,
  extractTokenPath,
  parseHSL,
  formatHSL,
  hexToHSL,
  adjustLightness,
  adjustSaturation,
  adjustAlpha,
  generateColorScale,
  tokensToTailwindConfig,
} from './core/tokens';

export {
  createAssetLoader,
  createCSSVariableInjector,
  createStyleSheetManager,
} from './core/asset-loader';

// ============================================================================
// COMPONENTS
// ============================================================================

export {
  Region,
  RegionContentProvider,
  RegionSlot,
  useRegion,
  useRegionContent,
} from './components/Region';

export {
  Layout,
  PageWrapper,
  Container,
  Section,
  LAYOUTS,
} from './components/Layout';

export {
  ComponentRegistryProvider,
  useComponentRegistry,
  withTheme,
  useComponentOverride,
  createSlottedComponent,
  createPolymorphicComponent,
} from './components/ThemedComponent';

export {
  ThemeSettings,
  ThemeSettingsPanel,
  QuickThemeToggle,
} from './components/ThemeSettings';

// ============================================================================
// BUILT-IN THEMES
// ============================================================================

export { baseThemeManifest } from './themes/base/manifest';
export { quantumOsThemeManifest } from './themes/quantum-os/manifest';

// ============================================================================
// STANDARD REGIONS
// ============================================================================

export { STANDARD_REGIONS } from './types/regions';

// ============================================================================
// CONVENIENCE RE-EXPORTS
// ============================================================================

import type {
  ThemeManifest,
  ResolvedTheme,
  ThemeRegistry,
  DesignTokens,
  ColorTokens,
  SpacingTokens,
  TypographyTokens,
  ShadowTokens,
  BorderTokens,
  MotionTokens,
  RegionDefinition,
  LayoutDefinition,
  ComponentOverride,
  ThemeLibrary,
  ThemeSettingsSchema,
  ThemeSetting,
  ColorScheme,
  BreakpointDefinitions,
} from './types';

// Type-only exports for convenience
export type {
  ThemeManifest,
  ResolvedTheme,
  ThemeRegistry,
  DesignTokens,
  ColorTokens,
  SpacingTokens,
  TypographyTokens,
  ShadowTokens,
  BorderTokens,
  MotionTokens,
  RegionDefinition,
  LayoutDefinition,
  ComponentOverride,
  ThemeLibrary,
  ThemeSettingsSchema,
  ThemeSetting,
  ColorScheme,
  BreakpointDefinitions,
};
