/**
 * RSES CMS Theme Context
 *
 * Provides theme state and methods to all components.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type {
  ThemeContextValue,
  ThemeProviderProps,
  ResolvedTheme,
  ThemeManifest,
  DesignTokens,
  ThemeRegistry,
  AssetLoader,
} from '../types';
import { createThemeRegistry } from '../core/registry';
import { createAssetLoader } from '../core/asset-loader';
import { resolveTokenPath, tokensToCSS } from '../core/tokens';

// ============================================================================
// CONTEXT
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// MEDIA QUERY HOOKS
// ============================================================================

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

function useSystemColorScheme(): 'light' | 'dark' {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  return prefersDark ? 'dark' : 'light';
}

function useBreakpoint(breakpoints: Record<string, { minWidth: number }>): string {
  const [currentBreakpoint, setCurrentBreakpoint] = useState('xs');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const calculateBreakpoint = () => {
      const width = window.innerWidth;
      const sorted = Object.entries(breakpoints).sort(
        ([, a], [, b]) => b.minWidth - a.minWidth
      );

      for (const [name, { minWidth }] of sorted) {
        if (width >= minWidth) {
          setCurrentBreakpoint(name);
          return;
        }
      }
      setCurrentBreakpoint('xs');
    };

    calculateBreakpoint();
    window.addEventListener('resize', calculateBreakpoint);
    return () => window.removeEventListener('resize', calculateBreakpoint);
  }, [breakpoints]);

  return currentBreakpoint;
}

// ============================================================================
// PROVIDER
// ============================================================================

export function ThemeProvider({
  theme: initialTheme = 'base',
  defaultColorScheme = 'system',
  storageKey = 'rses-theme',
  registry: externalRegistry,
  children,
}: ThemeProviderProps) {
  // Registry setup
  const registryRef = useRef<ThemeRegistry>(
    externalRegistry || createThemeRegistry()
  );

  // Asset loader
  const assetLoaderRef = useRef<AssetLoader>(createAssetLoader());

  // State
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userColorScheme, setUserColorScheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window === 'undefined') return defaultColorScheme;
    const stored = localStorage.getItem(`${storageKey}-color-scheme`);
    return (stored as 'light' | 'dark' | 'system') || defaultColorScheme;
  });

  // System color scheme detection
  const systemColorScheme = useSystemColorScheme();

  // Computed color scheme
  const colorScheme = useMemo(() => {
    if (userColorScheme === 'system') {
      return systemColorScheme;
    }
    return userColorScheme;
  }, [userColorScheme, systemColorScheme]);

  // Breakpoint detection
  const breakpoints = resolvedTheme?.manifest.breakpoints.values ?? {
    xs: { minWidth: 0, label: 'Extra Small' },
  };
  const currentBreakpoint = useBreakpoint(
    Object.fromEntries(
      Object.entries(breakpoints).map(([k, v]) => [k, { minWidth: v.minWidth }])
    )
  );

  // Set theme
  const setTheme = useCallback(async (themeName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const resolved = await registryRef.current.activate(themeName);
      setResolvedTheme(resolved);

      // Apply CSS custom properties
      const cssVars = tokensToCSS(resolved.resolvedTokens);
      const root = document.documentElement;

      for (const [property, value] of Object.entries(cssVars)) {
        root.style.setProperty(property, value);
      }

      // Load theme assets
      const libraries = Object.values(resolved.manifest.libraries).filter(
        (lib) => lib.global
      );

      for (const library of libraries) {
        await assetLoaderRef.current.loadLibrary(library);
      }

      // Persist theme preference
      localStorage.setItem(`${storageKey}-theme`, themeName);

      // Call onActivate hook if defined
      resolved.manifest.hooks?.onActivate?.();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load theme'));
    } finally {
      setIsLoading(false);
    }
  }, [storageKey]);

  // Set color scheme
  const setColorSchemeHandler = useCallback(
    (scheme: 'light' | 'dark' | 'system') => {
      setUserColorScheme(scheme);
      localStorage.setItem(`${storageKey}-color-scheme`, scheme);

      // Update document class
      const root = document.documentElement;
      root.classList.remove('light', 'dark');

      const effectiveScheme = scheme === 'system' ? systemColorScheme : scheme;
      root.classList.add(effectiveScheme);

      // Apply color scheme token overrides
      if (resolvedTheme) {
        const schemeConfig = resolvedTheme.manifest.colorSchemes.schemes.find(
          (s) => s.id === effectiveScheme
        );

        if (schemeConfig?.tokens) {
          const cssVars = tokensToCSS(schemeConfig.tokens as DesignTokens);
          const rootEl = document.documentElement;

          for (const [property, value] of Object.entries(cssVars)) {
            rootEl.style.setProperty(property, value);
          }
        }

        // Call hook
        resolvedTheme.manifest.hooks?.onColorSchemeChange?.(effectiveScheme);
      }
    },
    [storageKey, systemColorScheme, resolvedTheme]
  );

  // Toggle color scheme
  const toggleColorScheme = useCallback(() => {
    setColorSchemeHandler(colorScheme === 'light' ? 'dark' : 'light');
  }, [colorScheme, setColorSchemeHandler]);

  // Update settings
  const updateSettings = useCallback(
    (settings: Record<string, unknown>) => {
      if (!resolvedTheme) return;

      const newSettings = { ...resolvedTheme.currentSettings, ...settings };

      setResolvedTheme((prev) =>
        prev ? { ...prev, currentSettings: newSettings } : null
      );

      // Apply settings that map to CSS properties
      const manifest = resolvedTheme.manifest;
      for (const group of manifest.settings.groups) {
        for (const setting of group.settings) {
          if (setting.cssProperty && settings[setting.key] !== undefined) {
            document.documentElement.style.setProperty(
              setting.cssProperty,
              String(settings[setting.key])
            );
          }
        }
      }

      // Call hook
      resolvedTheme.manifest.hooks?.onSettingsChange?.(newSettings);
    },
    [resolvedTheme]
  );

  // Get token value
  const getToken = useCallback(
    (path: string): unknown => {
      if (!resolvedTheme) return undefined;
      return resolveTokenPath(resolvedTheme.resolvedTokens, path);
    },
    [resolvedTheme]
  );

  // Get CSS variable name for token
  const getTokenVar = useCallback((path: string): string => {
    // Convert token path to CSS variable name
    // e.g., 'colors.semantic.primary' -> '--colors-semantic-primary'
    return `var(--${path.replace(/\./g, '-')})`;
  }, []);

  // Check feature support
  const hasFeature = useCallback(
    (feature: string): boolean => {
      if (!resolvedTheme) return false;

      const features = resolvedTheme.manifest.features;
      if (feature in features) {
        return features[feature as keyof typeof features] as boolean;
      }

      return features.custom?.[feature] ?? false;
    },
    [resolvedTheme]
  );

  // Initial theme load
  useEffect(() => {
    const savedTheme = localStorage.getItem(`${storageKey}-theme`) || initialTheme;
    setTheme(savedTheme);
  }, [initialTheme, storageKey, setTheme]);

  // Apply color scheme class on mount and changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(colorScheme);
  }, [colorScheme]);

  // Breakpoint change callback
  useEffect(() => {
    resolvedTheme?.manifest.hooks?.onBreakpointChange?.(currentBreakpoint);
  }, [currentBreakpoint, resolvedTheme]);

  // Context value
  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      colorScheme,
      breakpoint: currentBreakpoint,
      setTheme,
      setColorScheme: setColorSchemeHandler,
      toggleColorScheme,
      updateSettings,
      getToken,
      getTokenVar,
      hasFeature,
      isLoading,
      error,
      assetLoader: assetLoaderRef.current,
      registry: registryRef.current,
    }),
    [
      resolvedTheme,
      colorScheme,
      currentBreakpoint,
      setTheme,
      setColorSchemeHandler,
      toggleColorScheme,
      updateSettings,
      getToken,
      getTokenVar,
      hasFeature,
      isLoading,
      error,
    ]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Access the full theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Access design tokens
 */
export function useDesignTokens() {
  const { theme, getToken, getTokenVar } = useTheme();

  return {
    tokens: theme?.resolvedTokens ?? null,
    getToken,
    getVar: getTokenVar,
    colors: theme?.resolvedTokens.colors ?? null,
  };
}

/**
 * Access current color scheme
 */
export function useColorScheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useTheme();

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
export function useBreakpointValue() {
  const { breakpoint, theme } = useTheme();

  const isAbove = useCallback(
    (bp: string): boolean => {
      if (!theme) return false;
      const breakpoints = theme.manifest.breakpoints.values;
      const current = breakpoints[breakpoint]?.minWidth ?? 0;
      const target = breakpoints[bp]?.minWidth ?? 0;
      return current >= target;
    },
    [breakpoint, theme]
  );

  const isBelow = useCallback(
    (bp: string): boolean => {
      if (!theme) return false;
      const breakpoints = theme.manifest.breakpoints.values;
      const current = breakpoints[breakpoint]?.minWidth ?? 0;
      const target = breakpoints[bp]?.minWidth ?? 0;
      return current < target;
    },
    [breakpoint, theme]
  );

  return {
    breakpoint,
    isAbove,
    isBelow,
    isMobile: !isAbove('md'),
    isTablet: isAbove('md') && isBelow('lg'),
    isDesktop: isAbove('lg'),
  };
}

/**
 * Access theme settings
 */
export function useThemeSettings<T = Record<string, unknown>>(): {
  settings: T;
  updateSettings: (settings: Partial<T>) => void;
} {
  const { theme, updateSettings } = useTheme();

  return {
    settings: (theme?.currentSettings ?? {}) as T,
    updateSettings: updateSettings as (settings: Partial<T>) => void,
  };
}

/**
 * Check if theme has a specific feature
 */
export function useThemeFeature(feature: string): boolean {
  const { hasFeature } = useTheme();
  return hasFeature(feature);
}
