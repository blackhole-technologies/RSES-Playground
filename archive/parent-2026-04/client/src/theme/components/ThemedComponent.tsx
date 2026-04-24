/**
 * RSES CMS Themed Component System
 *
 * HOCs and utilities for creating theme-aware components
 * that can be overridden by themes.
 */

import React, {
  forwardRef,
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ForwardRefExoticComponent,
  type PropsWithoutRef,
  type RefAttributes,
  type ReactNode,
} from 'react';
import { useTheme } from '../context/ThemeContext';
import type {
  ComponentOverride,
  ComponentContext,
  ComponentMeta,
  ComponentStyleOverride,
  StyleDefinition,
} from '../types';
import { cn } from '@/lib/utils';

// ============================================================================
// COMPONENT REGISTRY CONTEXT
// ============================================================================

interface ComponentRegistryContextValue {
  /** Registered components */
  components: Map<string, RegisteredComponent>;

  /** Register a component */
  register: <P extends Record<string, unknown>>(
    name: string,
    component: ComponentType<P>,
    meta?: Partial<ComponentMeta>
  ) => void;

  /** Get a component */
  get: <P extends Record<string, unknown>>(name: string) => ComponentType<P> | undefined;

  /** Get component with overrides applied */
  getResolved: <P extends Record<string, unknown>>(name: string) => ComponentType<P> | undefined;
}

interface RegisteredComponent {
  component: ComponentType<unknown>;
  meta: ComponentMeta;
}

const ComponentRegistryContext = createContext<ComponentRegistryContextValue | null>(null);

export function ComponentRegistryProvider({ children }: { children: ReactNode }) {
  const components = useMemo(() => new Map<string, RegisteredComponent>(), []);

  const register = <P extends Record<string, unknown>>(
    name: string,
    component: ComponentType<P>,
    meta?: Partial<ComponentMeta>
  ) => {
    components.set(name, {
      component: component as ComponentType<unknown>,
      meta: {
        name,
        displayName: meta?.displayName ?? name,
        category: meta?.category ?? 'custom',
        themeable: meta?.themeable ?? true,
        ...meta,
      },
    });
  };

  const get = <P extends Record<string, unknown>>(name: string): ComponentType<P> | undefined => {
    return components.get(name)?.component as ComponentType<P> | undefined;
  };

  const getResolved = <P extends Record<string, unknown>>(
    name: string
  ): ComponentType<P> | undefined => {
    // This would apply theme overrides - simplified for now
    return get(name);
  };

  const value = useMemo(
    () => ({ components, register, get, getResolved }),
    [components]
  );

  return (
    <ComponentRegistryContext.Provider value={value}>
      {children}
    </ComponentRegistryContext.Provider>
  );
}

export function useComponentRegistry() {
  const context = useContext(ComponentRegistryContext);
  if (!context) {
    throw new Error('useComponentRegistry must be used within ComponentRegistryProvider');
  }
  return context;
}

// ============================================================================
// THEMED COMPONENT HOC
// ============================================================================

interface ThemedComponentOptions {
  /** Component name for theme overrides */
  name: string;

  /** Base CSS class */
  baseClassName?: string;

  /** Component metadata */
  meta?: Partial<ComponentMeta>;

  /** Default style overrides */
  defaultStyles?: ComponentStyleOverride;
}

/**
 * Higher-order component that makes a component theme-aware
 */
export function withTheme<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: ThemedComponentOptions
): ForwardRefExoticComponent<PropsWithoutRef<P & { className?: string }> & RefAttributes<unknown>> {
  const { name, baseClassName, defaultStyles } = options;

  const ThemedComponent = forwardRef<unknown, P & { className?: string }>((props, ref) => {
    const { theme } = useTheme();

    // Get theme overrides
    const override = theme?.resolvedComponents[name];

    // Compute styles
    const computedClassName = useMemo(() => {
      const classes: string[] = [];

      // Base class
      if (baseClassName) {
        classes.push(baseClassName);
      }

      // Default styles
      if (defaultStyles?.base?.className) {
        classes.push(defaultStyles.base.className);
      }

      // Theme override styles
      if (override?.styles?.base?.className) {
        classes.push(override.styles.base.className);
      }

      // Variant styles
      if (defaultStyles?.variants) {
        for (const [variantKey, variantOptions] of Object.entries(defaultStyles.variants)) {
          const propValue = (props as Record<string, unknown>)[variantKey];
          if (propValue && typeof propValue === 'string' && variantOptions[propValue]) {
            const variantStyle = variantOptions[propValue];
            if (variantStyle.className) {
              classes.push(variantStyle.className);
            }
          }
        }
      }

      // Theme variant overrides
      if (override?.styles?.variants) {
        for (const [variantKey, variantOptions] of Object.entries(override.styles.variants)) {
          const propValue = (props as Record<string, unknown>)[variantKey];
          if (propValue && typeof propValue === 'string' && variantOptions[propValue]) {
            const variantStyle = variantOptions[propValue];
            if (variantStyle.className) {
              classes.push(variantStyle.className);
            }
          }
        }
      }

      // Compound variants
      if (defaultStyles?.compoundVariants) {
        for (const compound of defaultStyles.compoundVariants) {
          const matches = Object.entries(compound.conditions).every(([key, value]) => {
            return (props as Record<string, unknown>)[key] === value;
          });
          if (matches && compound.style.className) {
            classes.push(compound.style.className);
          }
        }
      }

      // Props className
      if (props.className) {
        classes.push(props.className);
      }

      return cn(...classes);
    }, [override, props]);

    // Compute CSS variables
    const computedStyle = useMemo(() => {
      const style: React.CSSProperties = {};

      // Default CSS vars
      if (defaultStyles?.base?.cssVars) {
        for (const [key, value] of Object.entries(defaultStyles.base.cssVars)) {
          (style as Record<string, string>)[key] = value;
        }
      }

      // Override CSS vars
      if (override?.styles?.base?.cssVars) {
        for (const [key, value] of Object.entries(override.styles.base.cssVars)) {
          (style as Record<string, string>)[key] = value;
        }
      }

      return Object.keys(style).length > 0 ? style : undefined;
    }, [override]);

    // Inject props from override
    const injectedProps = useMemo(() => {
      if (override?.type === 'props' && override.props) {
        return override.props;
      }
      return {};
    }, [override]);

    const finalProps = {
      ...props,
      ...injectedProps,
      className: computedClassName,
      style: computedStyle,
    } as P & { className: string; style?: React.CSSProperties };

    return (
      <WrappedComponent
        ref={ref}
        {...finalProps}
      />
    );
  });

  ThemedComponent.displayName = `Themed(${name})`;

  return ThemedComponent;
}

// ============================================================================
// USE COMPONENT OVERRIDE HOOK
// ============================================================================

interface UseComponentOverrideOptions<P> {
  /** Component name */
  name: string;

  /** Original component */
  original: ComponentType<P>;

  /** Props */
  props: P;
}

export function useComponentOverride<P extends object>({
  name,
  original,
  props,
}: UseComponentOverrideOptions<P>) {
  const { theme, colorScheme, breakpoint } = useTheme();

  return useMemo(() => {
    const override = theme?.resolvedComponents[name];

    // Create context for condition evaluation
    const context: ComponentContext = {
      theme: theme?.manifest.name ?? 'base',
      colorScheme,
      breakpoint,
      route: typeof window !== 'undefined' ? window.location.pathname : '/',
      settings: theme?.currentSettings ?? {},
      tokens: (theme?.resolvedTokens ?? {}) as Record<string, unknown>,
    };

    // Check conditions
    if (override?.conditions) {
      const conditionsMet = override.conditions.every((condition) => {
        switch (condition.type) {
          case 'colorScheme':
            return checkCondition(colorScheme, condition.operator, condition.value);
          case 'breakpoint':
            return checkCondition(breakpoint, condition.operator, condition.value);
          case 'route':
            return checkCondition(context.route, condition.operator, condition.value);
          case 'prop':
            if (condition.prop) {
              return checkCondition(
                (props as Record<string, unknown>)[condition.prop],
                condition.operator,
                condition.value
              );
            }
            return true;
          default:
            return true;
        }
      });

      if (!conditionsMet) {
        return { Component: original, props, override: undefined };
      }
    }

    // Apply override based on type
    if (!override) {
      return { Component: original, props, override: undefined };
    }

    switch (override.type) {
      case 'replace':
        // Would need to dynamically import the replacement
        // For now, return original
        return { Component: original, props, override };

      case 'props':
        return {
          Component: original,
          props: { ...props, ...override.props } as P,
          override,
        };

      case 'styles':
        // Styles are handled by withTheme HOC
        return { Component: original, props, override };

      default:
        return { Component: original, props, override };
    }
  }, [theme, colorScheme, breakpoint, name, original, props]);
}

function checkCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'nin':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'matches':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return new RegExp(expected).test(actual);
      }
      return false;
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      return true;
  }
}

// ============================================================================
// SLOT-BASED COMPONENT COMPOSITION
// ============================================================================

/**
 * Props for slotted components
 */
export interface SlotProps {
  children?: ReactNode;
  className?: string;
}

/**
 * Create a component with named slots
 * Simplified version that avoids complex generic constraints
 */
export function createSlottedComponent<P extends object>(
  render: (props: P, slots: Record<string, ReactNode | undefined>) => ReactNode,
  slotNames: string[]
): ComponentType<P & { slots?: Record<string, ReactNode> }> {
  function SlottedComponent(props: P & { slots?: Record<string, ReactNode> }) {
    const { slots = {}, ...rest } = props;

    const resolvedSlots: Record<string, ReactNode | undefined> = {};
    for (const name of slotNames) {
      resolvedSlots[name] = slots[name];
    }

    return <>{render(rest as P, resolvedSlots)}</>;
  }

  return SlottedComponent;
}

// ============================================================================
// POLYMORPHIC COMPONENT
// ============================================================================

/**
 * Props for polymorphic components
 */
export interface PolymorphicProps<E extends React.ElementType = React.ElementType> {
  as?: E;
  children?: ReactNode;
  className?: string;
}

/**
 * Create a polymorphic component that can render as any element
 * Simplified version for better type compatibility
 */
export function createPolymorphicComponent<P extends object = object>(
  defaultElement: React.ElementType,
  render: (
    props: P & PolymorphicProps,
    ref: React.ForwardedRef<unknown>
  ) => ReactNode
) {
  const Component = forwardRef<unknown, P & PolymorphicProps>(
    (props, ref) => {
      const mergedProps = { ...props, as: props.as || defaultElement } as P & PolymorphicProps;
      return render(mergedProps, ref);
    }
  );

  return Component as React.ForwardRefExoticComponent<
    P & PolymorphicProps & React.RefAttributes<unknown>
  >;
}
