/**
 * AI-Powered Design Module
 *
 * Provides intelligent design recommendations, color analysis,
 * and automated design-to-code generation.
 */

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
} from './color-intelligence';

export type {
  Color,
  ColorWithMeta,
  ColorRole,
  ColorAccessibility,
  ColorBlindSafety,
  ColorSuggestion,
  ColorIssue,
  HarmonyType,
} from './color-intelligence';

export {
  DesignIntelligenceEngine,
  designIntelligence,
} from './design-intelligence';

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
  PerformanceMetrics,
  PerformanceRecommendation,
  VariationOptions,
  CodeGenerationOptions,
  Framework,
  StylingApproach,
  GeneratedCode,
} from './design-intelligence';
