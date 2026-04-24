/**
 * Design System Core Module
 *
 * Core engine and utilities for the design system
 */

export {
  TokenEngine,
  createTokenEngine,
  getDefaultTokenEngine,
} from './token-engine';

export {
  PerformanceOptimizations,
  extractCriticalCSS,
  generateFontLoadingCode,
  generateFallbackMetrics,
  generateOptimizedImage,
  generateLQIP,
  createLazyHydration,
  initPerformanceMonitoring,
} from './performance';

export type {
  CriticalCSSConfig,
  FontLoadingStrategy,
  FontConfig,
  ImageConfig,
  HydrationStrategy,
  LazyHydrationConfig,
  PerformanceMetrics,
} from './performance';
