/**
 * Design System React Hooks
 *
 * Provides React integration for the Design System 2.0
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { TokenEngine, createTokenEngine } from '../core/token-engine';
import type { DesignTokenFile, TokenResolverConfig, ContentContext } from '../types/w3c-tokens';
import type { MotionDesignSystem } from '../types/motion-tokens';
import { ColorIntelligence, type Color } from '../ai/color-intelligence';

// ============================================================================
// DESIGN SYSTEM CONTEXT
// ============================================================================

export interface DesignSystemContextValue {
  /** Token engine instance */
  tokenEngine: TokenEngine;

  /** Current color scheme */
  colorScheme: 'light' | 'dark';

  /** Current breakpoint */
  breakpoint: string;

  /** Content context */
  context?: ContentContext;

  /** Reduced motion preference */
  reducedMotion: boolean;

  /** High contrast mode */
  highContrast: boolean;

  /** Set color scheme */
  setColorScheme: (scheme: 'light' | 'dark' | 'system') => void;

  /** Set content context */
  setContext: (context: ContentContext | undefined) => void;

  /** Get token value */
  getToken: <T = unknown>(path: string) => T | undefined;

  /** Get CSS variable name */
  getCSSVar: (path: string) => string;

  /** Check if system ready */
  isReady: boolean;

  /** Motion system */
  motion: MotionDesignSystem | null;
}

const DesignSystemContext = createContext<DesignSystemContextValue | null>(null);

// ============================================================================
// DESIGN SYSTEM PROVIDER
// ============================================================================

export interface DesignSystemProviderProps {
  /** Token files to load */
  tokens?: DesignTokenFile[];

  /** Initial color scheme */
  defaultColorScheme?: 'light' | 'dark' | 'system';

  /** Initial breakpoint */
  defaultBreakpoint?: string;

  /** Initial content context */
  defaultContext?: ContentContext;

  /** Storage key for preferences */
  storageKey?: string;

  /** Motion system configuration. Pass `null` to disable motion entirely. */
  motion?: MotionDesignSystem | null;

  /** Children */
  children: ReactNode;
}

export function DesignSystemProvider({
  tokens = [],
  defaultColorScheme = 'system',
  defaultBreakpoint = 'md',
  defaultContext,
  storageKey = 'design-system',
  // motion accepts `null` as the explicit "no motion" sentinel; the
  // context value type also allows null so the assignment is safe.
  motion = null,
  children,
}: DesignSystemProviderProps) {
  // Token engine
  const engineRef = useRef<TokenEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createTokenEngine({
      breakpoint: defaultBreakpoint,
      context: defaultContext,
    });

    // Load initial tokens
    for (const tokenFile of tokens) {
      engineRef.current.loadTokens(tokenFile);
    }
  }

  // State
  const [isReady, setIsReady] = useState(false);
  const [colorScheme, setColorSchemeState] = useState<'light' | 'dark'>('light');
  const [breakpoint, setBreakpoint] = useState(defaultBreakpoint);
  const [context, setContextState] = useState<ContentContext | undefined>(defaultContext);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  // Initialize system preferences
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Color scheme
    const storedScheme = localStorage.getItem(`${storageKey}-color-scheme`);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    let effectiveScheme: 'light' | 'dark';
    if (storedScheme === 'light' || storedScheme === 'dark') {
      effectiveScheme = storedScheme;
    } else if (defaultColorScheme === 'system') {
      effectiveScheme = systemPrefersDark ? 'dark' : 'light';
    } else {
      effectiveScheme = defaultColorScheme;
    }
    setColorSchemeState(effectiveScheme);

    // Reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(prefersReducedMotion);

    // High contrast
    const prefersHighContrast = window.matchMedia('(prefers-contrast: more)').matches;
    setHighContrast(prefersHighContrast);

    // Listen for system preference changes
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const highContrastQuery = window.matchMedia('(prefers-contrast: more)');

    const handleDarkModeChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(`${storageKey}-color-scheme`)) {
        setColorSchemeState(e.matches ? 'dark' : 'light');
      }
    };

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    const handleHighContrastChange = (e: MediaQueryListEvent) => {
      setHighContrast(e.matches);
    };

    darkModeQuery.addEventListener('change', handleDarkModeChange);
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    highContrastQuery.addEventListener('change', handleHighContrastChange);

    setIsReady(true);

    return () => {
      darkModeQuery.removeEventListener('change', handleDarkModeChange);
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      highContrastQuery.removeEventListener('change', handleHighContrastChange);
    };
  }, [defaultColorScheme, storageKey]);

  // Breakpoint detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const breakpoints = {
      xs: 0,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1536,
    };

    const calculateBreakpoint = () => {
      const width = window.innerWidth;
      let currentBp = 'xs';

      for (const [name, minWidth] of Object.entries(breakpoints).reverse()) {
        if (width >= minWidth) {
          currentBp = name;
          break;
        }
      }

      setBreakpoint(currentBp);
      engineRef.current?.updateConfig({ breakpoint: currentBp });
    };

    calculateBreakpoint();
    window.addEventListener('resize', calculateBreakpoint);
    return () => window.removeEventListener('resize', calculateBreakpoint);
  }, []);

  // Update engine config when preferences change
  useEffect(() => {
    engineRef.current?.updateConfig({
      colorScheme,
      context,
      reducedMotion,
      highContrast,
    });
  }, [colorScheme, context, reducedMotion, highContrast]);

  // Apply CSS variables to document
  useEffect(() => {
    if (typeof window === 'undefined' || !isReady) return;

    const css = engineRef.current?.generateCSSVariables();
    if (css) {
      let styleEl = document.getElementById('design-system-tokens');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'design-system-tokens';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    }

    // Apply color scheme class
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(colorScheme);
  }, [isReady, colorScheme]);

  // Callbacks
  const setColorScheme = useCallback((scheme: 'light' | 'dark' | 'system') => {
    if (scheme === 'system') {
      localStorage.removeItem(`${storageKey}-color-scheme`);
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setColorSchemeState(systemDark ? 'dark' : 'light');
    } else {
      localStorage.setItem(`${storageKey}-color-scheme`, scheme);
      setColorSchemeState(scheme);
    }
  }, [storageKey]);

  const setContext = useCallback((ctx: ContentContext | undefined) => {
    setContextState(ctx);
  }, []);

  const getToken = useCallback(<T = unknown>(path: string): T | undefined => {
    const resolved = engineRef.current?.resolve<T>(path);
    return resolved?.value;
  }, []);

  const getCSSVar = useCallback((path: string): string => {
    const varName = path.replace(/\./g, '-').replace(/([A-Z])/g, '-$1').toLowerCase();
    return `var(--${varName})`;
  }, []);

  // Context value
  const contextValue = useMemo<DesignSystemContextValue>(() => ({
    tokenEngine: engineRef.current!,
    colorScheme,
    breakpoint,
    context,
    reducedMotion,
    highContrast,
    setColorScheme,
    setContext,
    getToken,
    getCSSVar,
    isReady,
    motion,
  }), [
    colorScheme,
    breakpoint,
    context,
    reducedMotion,
    highContrast,
    setColorScheme,
    setContext,
    getToken,
    getCSSVar,
    isReady,
    motion,
  ]);

  return (
    <DesignSystemContext.Provider value={contextValue}>
      {children}
    </DesignSystemContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Access the design system context
 */
export function useDesignSystem(): DesignSystemContextValue {
  const context = useContext(DesignSystemContext);
  if (!context) {
    throw new Error('useDesignSystem must be used within a DesignSystemProvider');
  }
  return context;
}

/**
 * Access a specific token
 */
export function useToken<T = unknown>(path: string): T | undefined {
  const { getToken } = useDesignSystem();
  return getToken<T>(path);
}

/**
 * Access multiple tokens
 */
export function useTokens<T extends Record<string, unknown>>(paths: string[]): Partial<T> {
  const { getToken } = useDesignSystem();

  return useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const path of paths) {
      const key = path.split('.').pop() || path;
      result[key] = getToken(path);
    }
    return result as Partial<T>;
  }, [getToken, paths]);
}

/**
 * Access color scheme
 */
export function useColorScheme(): {
  colorScheme: 'light' | 'dark';
  setColorScheme: (scheme: 'light' | 'dark' | 'system') => void;
  toggleColorScheme: () => void;
  isDark: boolean;
  isLight: boolean;
} {
  const { colorScheme, setColorScheme } = useDesignSystem();

  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === 'light' ? 'dark' : 'light');
  }, [colorScheme, setColorScheme]);

  return {
    colorScheme,
    setColorScheme,
    toggleColorScheme,
    isDark: colorScheme === 'dark',
    isLight: colorScheme === 'light',
  };
}

/**
 * Access current breakpoint
 */
export function useBreakpoint(): {
  breakpoint: string;
  isAbove: (bp: string) => boolean;
  isBelow: (bp: string) => boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
} {
  const { breakpoint } = useDesignSystem();

  const breakpointOrder = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const currentIndex = breakpointOrder.indexOf(breakpoint);

  const isAbove = useCallback((bp: string): boolean => {
    const targetIndex = breakpointOrder.indexOf(bp);
    return currentIndex >= targetIndex;
  }, [currentIndex]);

  const isBelow = useCallback((bp: string): boolean => {
    const targetIndex = breakpointOrder.indexOf(bp);
    return currentIndex < targetIndex;
  }, [currentIndex]);

  return {
    breakpoint,
    isAbove,
    isBelow,
    isMobile: currentIndex < 2, // xs, sm
    isTablet: currentIndex >= 2 && currentIndex < 4, // md, lg
    isDesktop: currentIndex >= 4, // xl, 2xl
  };
}

/**
 * Access responsive value based on breakpoint
 */
export function useResponsiveValue<T>(values: Partial<Record<string, T>>): T | undefined {
  const { breakpoint } = useDesignSystem();
  const breakpointOrder = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const currentIndex = breakpointOrder.indexOf(breakpoint);

  // Find the closest defined value
  for (let i = currentIndex; i >= 0; i--) {
    const bp = breakpointOrder[i];
    if (values[bp] !== undefined) {
      return values[bp];
    }
  }

  return values.base;
}

/**
 * Access motion preferences
 */
export function useMotion(): {
  reducedMotion: boolean;
  duration: (baseMs: number) => number;
  spring: (config: { stiffness: number; damping: number; mass: number }) => {
    stiffness: number;
    damping: number;
    mass: number;
  };
} {
  const { reducedMotion, motion } = useDesignSystem();

  const duration = useCallback((baseMs: number): number => {
    return reducedMotion ? 0 : baseMs;
  }, [reducedMotion]);

  const spring = useCallback((config: { stiffness: number; damping: number; mass: number }) => {
    if (reducedMotion) {
      return { stiffness: 500, damping: 30, mass: 0.5 }; // Fast, no bounce
    }
    return config;
  }, [reducedMotion]);

  return { reducedMotion, duration, spring };
}

/**
 * Access accessibility preferences
 */
export function useAccessibilityPrefs(): {
  reducedMotion: boolean;
  highContrast: boolean;
  prefersColorScheme: 'light' | 'dark' | 'no-preference';
} {
  const { reducedMotion, highContrast, colorScheme } = useDesignSystem();

  return {
    reducedMotion,
    highContrast,
    prefersColorScheme: colorScheme,
  };
}

/**
 * Access content context
 */
export function useContentContext(): {
  context: ContentContext | undefined;
  setContext: (context: ContentContext | undefined) => void;
} {
  const { context, setContext } = useDesignSystem();
  return { context, setContext };
}

/**
 * Generate accessible color combinations
 */
export function useAccessibleColors(backgroundColor: string): {
  foreground: Color;
  mutedForeground: Color;
  border: Color;
  contrast: {
    ratio: number;
    aa: boolean;
    aaa: boolean;
  };
} {
  const bg = ColorIntelligence.parseColor(backgroundColor);
  const foreground = ColorIntelligence.findAccessibleColor(
    ColorIntelligence.parseColor(bg.hsl.l > 50 ? '#000000' : '#ffffff'),
    bg,
    7 // AAA
  );

  const mutedForeground = ColorIntelligence.findAccessibleColor(
    ColorIntelligence.parseColor(bg.hsl.l > 50 ? '#666666' : '#999999'),
    bg,
    4.5 // AA
  );

  const border = ColorIntelligence.parseColor(
    bg.hsl.l > 50
      ? `hsl(${bg.hsl.h}, ${bg.hsl.s}%, ${Math.max(0, bg.hsl.l - 20)}%)`
      : `hsl(${bg.hsl.h}, ${bg.hsl.s}%, ${Math.min(100, bg.hsl.l + 20)}%)`
  );

  const compliance = ColorIntelligence.checkWCAGCompliance(foreground, bg);

  return {
    foreground,
    mutedForeground,
    border,
    contrast: {
      ratio: compliance.ratio,
      aa: compliance.aa.normal,
      aaa: compliance.aaa.normal,
    },
  };
}

/**
 * CSS-in-JS style object from tokens
 */
export function useTokenStyles<T extends Record<string, string>>(
  tokenMap: T
): Record<keyof T, string> {
  const { getCSSVar } = useDesignSystem();

  return useMemo(() => {
    const styles: Record<string, string> = {};
    for (const [key, path] of Object.entries(tokenMap)) {
      styles[key] = getCSSVar(path);
    }
    return styles as Record<keyof T, string>;
  }, [getCSSVar, tokenMap]);
}
