/**
 * RSES Design System 2.0
 *
 * A comprehensive, industry-leading design system featuring:
 * - W3C Design Tokens specification compliance
 * - AI-powered color intelligence and design suggestions
 * - Micro-frontend architecture support
 * - Advanced motion design system
 * - React Server Components compatibility
 * - Zero-runtime CSS-in-JS optimizations
 * - WCAG 2.2 AAA accessibility compliance
 *
 * Inspired by:
 * - Shopify Polaris: Comprehensive design system
 * - IBM Carbon: Enterprise design system
 * - Atlassian Design System: Extensive documentation
 * - Material Design 3: Adaptive design, dynamic color
 * - Radix Themes: Accessible, customizable
 *
 * @example
 * ```tsx
 * import {
 *   DesignSystemProvider,
 *   useDesignSystem,
 *   useToken,
 *   useColorScheme,
 *   useBreakpoint,
 *   ColorIntelligence,
 * } from '@/design-system';
 *
 * function App() {
 *   return (
 *     <DesignSystemProvider tokens={[defaultTokens]}>
 *       <YourApp />
 *     </DesignSystemProvider>
 *   );
 * }
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

// Local imports needed by helper functions defined later in this file.
// The corresponding `export type { … } from './types/w3c-tokens'` re-exports
// these symbols for external consumers; this block brings them into scope
// for internal use.
import type {
  ResponsiveToken,
  ContextualToken,
  ContentContext,
} from "./types/w3c-tokens";

// W3C Design Tokens Types
export type {
  TokenValue,
  TokenAlias,
  ColorTokenValue,
  DimensionTokenValue,
  DurationTokenValue,
  CubicBezierTokenValue,
  FontFamilyTokenValue,
  FontWeightTokenValue,
  StrokeStyleTokenValue,
  BorderTokenValue,
  TransitionTokenValue,
  ShadowTokenValue,
  GradientTokenValue,
  TypographyTokenValue,
  TokenDefinition,
  TokenExtensions,
  TokenAccessibilityInfo,
  TokenPerformanceInfo,
  TokenAnalyticsInfo,
  TokenGroup,
  DesignTokenFile,
  ResponsiveToken,
  ContainerToken,
  ContextualToken,
  ContentContext,
  InteractionTokens,
  InteractionTokenDefinition,
  TokenResolverConfig,
  ResolvedToken,
  TokenTransform,
  TokenTransformContext,
  BuiltInTransform,
  TokenExportConfig,
  TokenExportResult,
} from './types/w3c-tokens';

// Motion Design System Types
export type {
  DurationTokens,
  EasingTokens,
  SpringConfig,
  SpringTokens,
  StaggerConfig,
  ChoreographyTokens,
  TransitionPreset,
  TransitionTokens,
  Keyframe,
  AnimationDefinition,
  AnimationTokens,
  ReducedMotionConfig,
  MotionAccessibility,
  GestureMotion,
  ScrollMotion,
  ViewTransitionConfig,
  MotionDesignSystem,
} from './types/motion-tokens';

// Micro-Frontend Types
export type {
  MicroFrontend,
  SharedDependency,
  RouteConfig,
  RouteGuard,
  LazyRouteConfig,
  RouteMetadata,
  ExposeConfig,
  RemoteConfig,
  MicroFrontendTokenConfig,
  TokenScopeStrategy,
  TokenInheritance,
  MicroFrontendLifecycle,
  MountProps,
  MountResult,
  ErrorInfo,
  CrossMFEMessage,
  EventBus,
  SharedState,
  LoadingStrategy,
  RetryConfig,
  CacheConfig,
  LayoutSlot,
  ApplicationShell,
  ShellLayout,
  ShellRegion,
  RegionVisibility,
  MicroFrontendMetadata,
  DependencyGraph,
  BundleInfo,
  ChunkInfo,
  MicroFrontendRegistry,
  MFESearchQuery,
  MFEHealth,
} from './types/micro-frontend';

// ============================================================================
// CORE ENGINE
// ============================================================================

export {
  TokenEngine,
  createTokenEngine,
  getDefaultTokenEngine,
} from './core/token-engine';

// ============================================================================
// PERFORMANCE OPTIMIZATIONS
// ============================================================================

export {
  PerformanceOptimizations,
} from './core/performance';

export type {
  CriticalCSSConfig,
  FontLoadingStrategy,
  FontConfig,
  ImageConfig,
  HydrationStrategy,
  LazyHydrationConfig,
  PerformanceMetrics,
  // PerformanceRecommendation removed 2026-04-14: not exported by ./core/performance.
  // If the type is needed in the future, define it in core/performance.ts first.
} from './core/performance';

// ============================================================================
// AI-POWERED DESIGN
// ============================================================================

// Color Intelligence
export {
  ColorIntelligence,
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
} from './ai/color-intelligence';

export type {
  Color,
  ColorWithMeta,
  ColorRole,
  ColorAccessibility,
  ColorBlindSafety,
  ColorSuggestion,
  ColorIssue,
  HarmonyType,
} from './ai/color-intelligence';

// Design Intelligence
export {
  DesignIntelligenceEngine,
  designIntelligence,
} from './ai/design-intelligence';

export type {
  ComponentDesignSpec,
  ComponentCategory,
  ComponentTokens,
  ComponentVariant,
  ComponentState,
  AccessibilitySpec,
  KeyboardNavSpec,
  ScreenReaderSpec,
  ContrastRequirements,
  AnimationSpec,
  ResponsiveSpec,
  ResponsiveBreakpoint,
  ContainerQuerySpec,
  DesignSuggestion,
  SuggestionType,
  DesignImpact,
  ComponentAnalytics,
  ABTestResult,
  HeatmapData,
  ClickData,
  HoverData,
  UserFeedback,
  PerformanceAnalysis,
  PerformanceMetrics as ComponentPerformanceMetrics,
  VariationOptions,
  CodeGenerationOptions,
  Framework,
  StylingApproach,
  GeneratedCode,
} from './ai/design-intelligence';

// ============================================================================
// REACT INTEGRATION
// ============================================================================

export {
  DesignSystemProvider,
  useDesignSystem,
  useToken,
  useTokens,
  useColorScheme,
  useBreakpoint,
  useResponsiveValue,
  useMotion,
  useAccessibilityPrefs,
  useContentContext,
  useAccessibleColors,
  useTokenStyles,
} from './hooks/useDesignSystem';

export type {
  DesignSystemContextValue,
  DesignSystemProviderProps,
} from './hooks/useDesignSystem';

// ============================================================================
// DEFAULT TOKENS
// ============================================================================

export {
  defaultTokens,
  darkModeTokens,
} from './tokens/default-tokens';

// ============================================================================
// MOTION DEFAULTS
// ============================================================================

export {
  defaultDurationTokens,
  defaultEasingTokens,
  defaultSpringTokens,
} from './types/motion-tokens';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Create CSS variable reference
 */
export function cssVar(name: string, fallback?: string): string {
  return fallback ? `var(--${name}, ${fallback})` : `var(--${name})`;
}

/**
 * Create token reference
 */
export function tokenRef(path: string): `{${string}}` {
  return `{${path}}`;
}

/**
 * Check if value is a token reference
 */
export function isTokenRef(value: unknown): value is `{${string}}` {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

/**
 * Extract path from token reference
 */
export function extractTokenPath(ref: `{${string}}`): string {
  return ref.slice(1, -1);
}

/**
 * Convert token path to CSS variable name
 */
export function tokenPathToCSSVar(path: string, prefix = ''): string {
  const name = path
    .replace(/\./g, '-')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
  return `--${prefix}${prefix ? '-' : ''}${name}`;
}

/**
 * Create responsive token value
 */
export function responsive<T>(values: {
  base?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
}): ResponsiveToken<T extends string | number | boolean ? T : never> {
  return {
    $type: 'responsive',
    $value: values as ResponsiveToken['$value'],
  } as ResponsiveToken<T extends string | number | boolean ? T : never>;
}

/**
 * Create contextual token value
 */
export function contextual<T>(
  defaultValue: T,
  contexts: Record<ContentContext, T>
): ContextualToken<T extends string | number | boolean ? T : never> {
  return {
    $type: 'contextual',
    $value: {
      default: defaultValue,
      contexts,
    },
  } as unknown as ContextualToken<T extends string | number | boolean ? T : never>;
}

// ============================================================================
// VERSION INFO
// ============================================================================

export const VERSION = '2.0.0';
export const SPEC_VERSION = 'W3C Design Tokens Community Group Draft';
