/**
 * RSES CMS Region Component
 *
 * Renders a theme region with its content.
 */

import React, {
  createElement,
  useContext,
  createContext,
  useMemo,
  type ReactNode,
  type ComponentType,
} from 'react';
import { useTheme } from '../context/ThemeContext';
import type {
  RegionDefinition,
  RegionContent,
  RegionProps,
  RegionVisibilityContext,
} from '../types';
import { cn } from '@/lib/utils';

// ============================================================================
// REGION CONTENT CONTEXT
// ============================================================================

interface RegionContentContextValue {
  /** Content items for each region */
  regionContent: Map<string, RegionContent[]>;

  /** Add content to a region */
  addContent: (region: string, content: RegionContent) => void;

  /** Remove content from a region */
  removeContent: (region: string, contentId: string) => void;

  /** Clear all content from a region */
  clearRegion: (region: string) => void;
}

const RegionContentContext = createContext<RegionContentContextValue | null>(null);

export function RegionContentProvider({ children }: { children: ReactNode }) {
  const [regionContent, setRegionContent] = React.useState<Map<string, RegionContent[]>>(
    new Map()
  );

  const addContent = React.useCallback((region: string, content: RegionContent) => {
    setRegionContent((prev) => {
      const next = new Map(prev);
      const existing = next.get(region) || [];
      next.set(region, [...existing, content].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)));
      return next;
    });
  }, []);

  const removeContent = React.useCallback((region: string, contentId: string) => {
    setRegionContent((prev) => {
      const next = new Map(prev);
      const existing = next.get(region) || [];
      next.set(region, existing.filter((c) => c.id !== contentId));
      return next;
    });
  }, []);

  const clearRegion = React.useCallback((region: string) => {
    setRegionContent((prev) => {
      const next = new Map(prev);
      next.delete(region);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ regionContent, addContent, removeContent, clearRegion }),
    [regionContent, addContent, removeContent, clearRegion]
  );

  return (
    <RegionContentContext.Provider value={value}>
      {children}
    </RegionContentContext.Provider>
  );
}

export function useRegionContent() {
  const context = useContext(RegionContentContext);
  if (!context) {
    throw new Error('useRegionContent must be used within RegionContentProvider');
  }
  return context;
}

// ============================================================================
// VISIBILITY CHECK
// ============================================================================

function checkVisibility(
  definition: RegionDefinition,
  context: RegionVisibilityContext
): boolean {
  const visibility = definition.visibility;
  if (!visibility) return true;

  // Route checks
  if (visibility.routes && !visibility.routes.some((r) => context.route.startsWith(r))) {
    return false;
  }

  if (visibility.excludeRoutes && visibility.excludeRoutes.some((r) => context.route.startsWith(r))) {
    return false;
  }

  // Breakpoint checks
  if (visibility.breakpoints && !visibility.breakpoints.includes(context.breakpoint)) {
    return false;
  }

  if (visibility.excludeBreakpoints && visibility.excludeBreakpoints.includes(context.breakpoint)) {
    return false;
  }

  // Role checks
  if (visibility.roles && !visibility.roles.some((r) => context.userRoles.includes(r))) {
    return false;
  }

  // Custom condition
  if (visibility.condition && !visibility.condition(context)) {
    return false;
  }

  return true;
}

// ============================================================================
// REGION COMPONENT
// ============================================================================

export interface RegionComponentProps extends RegionProps {
  /** Component registry for rendering content */
  componentRegistry?: Map<string, ComponentType<unknown>>;

  /** Current route */
  route?: string;

  /** User roles */
  userRoles?: string[];

  /** Whether user is authenticated */
  isAuthenticated?: boolean;
}

export function Region({
  name,
  className,
  as,
  children,
  componentRegistry,
  route = '/',
  userRoles = [],
  isAuthenticated = false,
  ...props
}: RegionComponentProps) {
  const { theme, colorScheme, breakpoint } = useTheme();
  const { regionContent } = useRegionContent();

  // Get region definition
  const definition = theme?.resolvedRegions[name];

  // Get content for this region
  const content = regionContent.get(name) || [];

  // Check visibility
  const visibilityContext: RegionVisibilityContext = {
    route,
    breakpoint,
    userRoles,
    isAuthenticated,
    colorScheme,
  };

  const isVisible = definition ? checkVisibility(definition, visibilityContext) : true;

  if (!isVisible) {
    return null;
  }

  // Determine element to render
  const Element = as || definition?.element || 'div';

  // Build class names
  const regionClassName = cn(
    'rses-region',
    `rses-region--${name}`,
    definition?.className,
    className
  );

  // Build ARIA attributes
  const ariaProps: Record<string, string | undefined> = {};
  if (definition?.role) {
    ariaProps.role = definition.role;
  }
  if (definition?.ariaLabel) {
    ariaProps['aria-label'] = definition.ariaLabel;
  }

  // Render content items
  const renderedContent = content
    .filter((item) => {
      if (!item.enabled) return false;
      if (!item.visibility) return true;
      return checkVisibility(
        { name: item.id, label: '', visibility: item.visibility },
        visibilityContext
      );
    })
    .map((item) => {
      if (componentRegistry) {
        const Component = componentRegistry.get(item.component);
        if (Component) {
          const componentProps = {
            ...item.props,
            className: cn(item.className),
          } as Record<string, unknown>;
          return (
            <Component
              key={item.id}
              {...componentProps}
            />
          );
        }
      }

      // Fallback: render as placeholder
      return (
        <div key={item.id} className={cn('rses-region-item', item.className)}>
          {item.component}
        </div>
      );
    });

  // Has content?
  const hasContent = renderedContent.length > 0 || React.Children.count(children) > 0;

  // Render default content if empty
  if (!hasContent && definition?.defaultContent) {
    return createElement(
      Element,
      {
        className: regionClassName,
        'data-region': name,
        'data-empty': 'true',
        style: definition?.gridArea ? { gridArea: definition.gridArea } : undefined,
        ...ariaProps,
        ...props,
      },
      definition.defaultContent
    );
  }

  return createElement(
    Element,
    {
      className: regionClassName,
      'data-region': name,
      'data-empty': !hasContent ? 'true' : undefined,
      style: definition?.gridArea ? { gridArea: definition.gridArea } : undefined,
      ...ariaProps,
      ...props,
    },
    <>
      {renderedContent}
      {children}
    </>
  );
}

// ============================================================================
// REGION SLOT COMPONENT
// ============================================================================

interface RegionSlotProps {
  /** Region name */
  region: string;

  /** Content ID */
  id: string;

  /** Component name to render */
  component: string;

  /** Component props */
  componentProps?: Record<string, unknown>;

  /** Display weight */
  weight?: number;

  /** Additional className */
  className?: string;

  /** Whether this slot is enabled */
  enabled?: boolean;
}

/**
 * Declarative way to add content to a region
 */
export function RegionSlot({
  region,
  id,
  component,
  componentProps,
  weight,
  className,
  enabled = true,
}: RegionSlotProps) {
  const { addContent, removeContent } = useRegionContent();

  React.useEffect(() => {
    if (enabled) {
      addContent(region, {
        id,
        component,
        props: componentProps,
        weight,
        className,
        enabled,
      });
    }

    return () => {
      removeContent(region, id);
    };
  }, [region, id, component, componentProps, weight, className, enabled, addContent, removeContent]);

  return null;
}

// ============================================================================
// USE REGION HOOK
// ============================================================================

export function useRegion(name: string) {
  const { theme, colorScheme, breakpoint } = useTheme();
  const { regionContent } = useRegionContent();

  const definition = theme?.resolvedRegions[name] ?? null;
  const content = regionContent.get(name) ?? [];

  const visibilityContext: RegionVisibilityContext = {
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
    breakpoint,
    userRoles: [],
    isAuthenticated: false,
    colorScheme,
  };

  const isVisible = definition ? checkVisibility(definition, visibilityContext) : true;

  return {
    definition,
    content,
    isVisible,
    hasContent: content.length > 0,
  };
}
