/**
 * W3C Design Tokens Specification Implementation
 *
 * Based on the W3C Design Tokens Community Group specification
 * https://design-tokens.github.io/community-group/format/
 *
 * This implementation provides:
 * - Standard token format
 * - Token aliases and references
 * - Composite tokens
 * - Token metadata
 */

// ============================================================================
// CORE TOKEN TYPES
// ============================================================================

/**
 * Base token value types as per W3C spec
 */
export type TokenValue =
  | string
  | number
  | boolean
  | ColorTokenValue
  | DimensionTokenValue
  | DurationTokenValue
  | CubicBezierTokenValue
  | FontFamilyTokenValue
  | FontWeightTokenValue
  | StrokeStyleTokenValue
  | BorderTokenValue
  | TransitionTokenValue
  | ShadowTokenValue
  | GradientTokenValue
  | TypographyTokenValue
  | TokenAlias;

/**
 * Token alias reference
 */
export interface TokenAlias {
  $value: `{${string}}`;
}

/**
 * Color token value (supports multiple formats)
 */
export interface ColorTokenValue {
  $type: 'color';
  $value: string; // hex, rgb, rgba, hsl, hsla, oklch, etc.
  colorSpace?: 'srgb' | 'display-p3' | 'oklch' | 'lab' | 'lch';
}

/**
 * Dimension token value
 */
export interface DimensionTokenValue {
  $type: 'dimension';
  $value: number;
  unit: 'px' | 'rem' | 'em' | '%' | 'vw' | 'vh' | 'dvh' | 'svh' | 'lvh' | 'cqw' | 'cqh';
}

/**
 * Duration token value
 */
export interface DurationTokenValue {
  $type: 'duration';
  $value: number;
  unit: 'ms' | 's';
}

/**
 * Cubic bezier easing token
 */
export interface CubicBezierTokenValue {
  $type: 'cubicBezier';
  $value: [number, number, number, number];
}

/**
 * Font family token
 */
export interface FontFamilyTokenValue {
  $type: 'fontFamily';
  $value: string | string[];
}

/**
 * Font weight token
 */
export interface FontWeightTokenValue {
  $type: 'fontWeight';
  $value: number | 'normal' | 'bold' | 'lighter' | 'bolder';
}

/**
 * Stroke style token
 */
export interface StrokeStyleTokenValue {
  $type: 'strokeStyle';
  $value: 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'outset' | 'inset' | StrokeStyleObject;
}

export interface StrokeStyleObject {
  dashArray: DimensionTokenValue[];
  lineCap: 'round' | 'butt' | 'square';
}

/**
 * Border composite token
 */
export interface BorderTokenValue {
  $type: 'border';
  $value: {
    color: ColorTokenValue | TokenAlias;
    width: DimensionTokenValue | TokenAlias;
    style: StrokeStyleTokenValue | TokenAlias;
  };
}

/**
 * Transition composite token
 */
export interface TransitionTokenValue {
  $type: 'transition';
  $value: {
    duration: DurationTokenValue | TokenAlias;
    delay?: DurationTokenValue | TokenAlias;
    timingFunction: CubicBezierTokenValue | TokenAlias | string;
  };
}

/**
 * Shadow token value
 */
export interface ShadowTokenValue {
  $type: 'shadow';
  $value: ShadowLayer | ShadowLayer[];
}

export interface ShadowLayer {
  color: ColorTokenValue | TokenAlias;
  offsetX: DimensionTokenValue | TokenAlias;
  offsetY: DimensionTokenValue | TokenAlias;
  blur: DimensionTokenValue | TokenAlias;
  spread?: DimensionTokenValue | TokenAlias;
  inset?: boolean;
}

/**
 * Gradient token value
 */
export interface GradientTokenValue {
  $type: 'gradient';
  $value: GradientStop[];
}

export interface GradientStop {
  color: ColorTokenValue | TokenAlias;
  position: number; // 0-1
}

/**
 * Typography composite token
 */
export interface TypographyTokenValue {
  $type: 'typography';
  $value: {
    fontFamily: FontFamilyTokenValue | TokenAlias;
    fontSize: DimensionTokenValue | TokenAlias;
    fontWeight: FontWeightTokenValue | TokenAlias;
    letterSpacing?: DimensionTokenValue | TokenAlias;
    lineHeight: DimensionTokenValue | TokenAlias | number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
  };
}

// ============================================================================
// TOKEN DEFINITION
// ============================================================================

/**
 * Base token definition with metadata
 */
export interface TokenDefinition<T extends TokenValue = TokenValue> {
  $value: T | `{${string}}`; // Value or alias reference
  $type?: string;
  $description?: string;
  $extensions?: TokenExtensions;
}

/**
 * Token extensions for additional metadata
 */
export interface TokenExtensions {
  /** Token category for organization */
  'org.rses.category'?: string;
  /** AI-generated suggestion confidence */
  'org.rses.ai.confidence'?: number;
  /** AI-generated suggestion source */
  'org.rses.ai.source'?: string;
  /** Accessibility information */
  'org.rses.a11y'?: TokenAccessibilityInfo;
  /** Performance impact */
  'org.rses.perf'?: TokenPerformanceInfo;
  /** Usage analytics */
  'org.rses.analytics'?: TokenAnalyticsInfo;
  /** Custom extensions */
  [key: string]: unknown;
}

export interface TokenAccessibilityInfo {
  wcagContrast?: {
    aa: boolean;
    aaa: boolean;
    largeText: boolean;
  };
  colorBlindSafe?: boolean;
  motionSafe?: boolean;
}

export interface TokenPerformanceInfo {
  renderCost: 'low' | 'medium' | 'high';
  animationFps?: number;
  gpuAccelerated?: boolean;
}

export interface TokenAnalyticsInfo {
  usageCount: number;
  lastUsed: string;
  topComponents: string[];
}

// ============================================================================
// TOKEN GROUP
// ============================================================================

/**
 * Token group for organizing tokens
 */
export interface TokenGroup {
  $type?: string;
  $description?: string;
  $extensions?: TokenExtensions;
  [key: string]: TokenDefinition | TokenGroup | string | TokenExtensions | undefined;
}

// ============================================================================
// TOKEN FILE FORMAT
// ============================================================================

/**
 * Complete token file format
 */
export interface DesignTokenFile {
  /** File metadata */
  $name?: string;
  $description?: string;
  $version?: string;

  /** Token definitions */
  [key: string]: TokenDefinition | TokenGroup | string | undefined;
}

// ============================================================================
// RESPONSIVE TOKENS
// ============================================================================

/**
 * Responsive token with breakpoint-specific values
 */
export interface ResponsiveToken<T extends TokenValue = TokenValue> {
  $type: 'responsive';
  $value: {
    base: T | TokenAlias;
    sm?: T | TokenAlias;
    md?: T | TokenAlias;
    lg?: T | TokenAlias;
    xl?: T | TokenAlias;
    '2xl'?: T | TokenAlias;
  };
}

/**
 * Container query token
 */
export interface ContainerToken<T extends TokenValue = TokenValue> {
  $type: 'container';
  $value: {
    default: T | TokenAlias;
    '@container (min-width: 300px)'?: T | TokenAlias;
    '@container (min-width: 500px)'?: T | TokenAlias;
    '@container (min-width: 700px)'?: T | TokenAlias;
  };
}

// ============================================================================
// CONTEXTUAL TOKENS
// ============================================================================

/**
 * Context-aware tokens that change based on content type
 */
export interface ContextualToken<T extends TokenValue = TokenValue> {
  $type: 'contextual';
  $value: {
    default: T | TokenAlias;
    contexts: {
      [contextName: string]: T | TokenAlias;
    };
  };
}

/**
 * Built-in context types
 */
export type ContentContext =
  | 'article'
  | 'commerce'
  | 'dashboard'
  | 'form'
  | 'media'
  | 'navigation'
  | 'notification'
  | 'overlay'
  | 'settings';

// ============================================================================
// INTERACTION TOKENS
// ============================================================================

/**
 * Interaction state tokens
 */
export interface InteractionTokens {
  default: TokenValue | TokenAlias;
  hover?: TokenValue | TokenAlias;
  focus?: TokenValue | TokenAlias;
  active?: TokenValue | TokenAlias;
  disabled?: TokenValue | TokenAlias;
  selected?: TokenValue | TokenAlias;
  error?: TokenValue | TokenAlias;
  loading?: TokenValue | TokenAlias;
}

/**
 * Complete interaction token definition
 */
export interface InteractionTokenDefinition {
  $type: 'interaction';
  $value: InteractionTokens;
  $description?: string;
  $extensions?: TokenExtensions;
}

// ============================================================================
// TOKEN RESOLVER
// ============================================================================

/**
 * Token resolver configuration
 */
export interface TokenResolverConfig {
  /** Token files to merge */
  files: DesignTokenFile[];
  /** Color scheme */
  colorScheme: 'light' | 'dark' | 'auto';
  /** Current breakpoint */
  breakpoint: string;
  /** Content context */
  context?: ContentContext;
  /** Reduced motion preference */
  reducedMotion: boolean;
  /** High contrast preference */
  highContrast: boolean;
}

/**
 * Resolved token value
 */
export interface ResolvedToken<T = unknown> {
  value: T;
  source: string;
  path: string;
  metadata?: TokenExtensions;
}

// ============================================================================
// TOKEN TRANSFORMS
// ============================================================================

/**
 * Token transform function
 */
export type TokenTransform = (
  token: TokenDefinition,
  path: string,
  context: TokenTransformContext
) => TokenDefinition;

export interface TokenTransformContext {
  allTokens: DesignTokenFile;
  colorScheme: 'light' | 'dark';
  platform: 'web' | 'ios' | 'android' | 'figma';
}

/**
 * Built-in transforms
 */
export type BuiltInTransform =
  | 'color/hex'
  | 'color/rgb'
  | 'color/hsl'
  | 'color/oklch'
  | 'dimension/px'
  | 'dimension/rem'
  | 'duration/ms'
  | 'duration/s'
  | 'shadow/css'
  | 'typography/css'
  | 'gradient/css';

// ============================================================================
// TOKEN EXPORT FORMATS
// ============================================================================

/**
 * Export format configuration
 */
export interface TokenExportConfig {
  format: 'css' | 'scss' | 'less' | 'json' | 'js' | 'ts' | 'swift' | 'kotlin' | 'figma';
  transforms?: (BuiltInTransform | TokenTransform)[];
  filter?: (token: TokenDefinition, path: string) => boolean;
  prefix?: string;
  outputPath?: string;
}

export interface TokenExportResult {
  format: string;
  content: string;
  tokens: number;
  timestamp: string;
}
