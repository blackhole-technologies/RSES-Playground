/**
 * RSES CMS Component Override System
 *
 * This system allows themes to override, extend, or replace components
 * similar to Drupal's template override system but using React components.
 */

import type { ComponentType, ReactNode, CSSProperties } from 'react';

// ============================================================================
// COMPONENT OVERRIDE TYPES
// ============================================================================

/**
 * Component override definition in theme manifest
 */
export interface ComponentOverride {
  /** Component identifier (e.g., 'button', 'card', 'input') */
  name: string;

  /** Override type */
  type: ComponentOverrideType;

  /** Path to override component (relative to theme) */
  component?: string;

  /** For 'wrapper' type: wrapper component */
  wrapper?: string;

  /** For 'props' type: props to inject/override */
  props?: Record<string, unknown>;

  /** For 'variants' type: variant overrides */
  variants?: Record<string, VariantOverride>;

  /** For 'styles' type: style overrides */
  styles?: ComponentStyleOverride;

  /** Conditions when this override applies */
  conditions?: ComponentOverrideCondition[];

  /** Priority (higher = applied later) */
  priority?: number;

  /** Whether this override is enabled */
  enabled?: boolean;
}

export type ComponentOverrideType =
  /** Completely replace the component */
  | 'replace'
  /** Wrap the component */
  | 'wrapper'
  /** Inject/override props */
  | 'props'
  /** Override specific variants */
  | 'variants'
  /** Override styles only */
  | 'styles'
  /** Extend with additional functionality */
  | 'extend';

/**
 * Variant-specific override
 */
export interface VariantOverride {
  /** Variant name (e.g., 'primary', 'secondary') */
  name: string;

  /** New/override CSS classes */
  className?: string;

  /** Override styles */
  styles?: CSSProperties;

  /** Override props */
  props?: Record<string, unknown>;

  /** Replace variant entirely */
  replace?: boolean;
}

/**
 * Style override for components
 */
export interface ComponentStyleOverride {
  /** Base styles (always applied) */
  base?: StyleDefinition;

  /** Variant styles */
  variants?: Record<string, Record<string, StyleDefinition>>;

  /** Compound variant styles */
  compoundVariants?: CompoundVariantStyle[];

  /** Default variant values */
  defaultVariants?: Record<string, string>;
}

export interface StyleDefinition {
  /** CSS class names */
  className?: string;

  /** Inline styles */
  styles?: CSSProperties;

  /** CSS custom properties to set */
  cssVars?: Record<string, string>;
}

export interface CompoundVariantStyle {
  /** Variant conditions */
  conditions: Record<string, string | boolean>;

  /** Styles to apply */
  style: StyleDefinition;
}

/**
 * Condition for when an override applies
 */
export interface ComponentOverrideCondition {
  /** Condition type */
  type: 'route' | 'region' | 'breakpoint' | 'colorScheme' | 'prop' | 'custom';

  /** Condition operator */
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'matches' | 'exists';

  /** Value to compare against */
  value: unknown;

  /** For 'prop' type: which prop to check */
  prop?: string;

  /** For 'custom' type: custom check function name */
  customFn?: string;
}

// ============================================================================
// COMPONENT REGISTRY
// ============================================================================

/**
 * Component entry in the registry
 */
export interface ComponentRegistryEntry<P = Record<string, unknown>> {
  /** Component implementation */
  component: ComponentType<P>;

  /** Component metadata */
  meta: ComponentMeta;

  /** All overrides for this component */
  overrides: ComponentOverride[];

  /** Resolved component (with overrides applied) */
  resolved?: ComponentType<P>;
}

/**
 * Component metadata
 */
export interface ComponentMeta {
  /** Component name */
  name: string;

  /** Display name for admin UI */
  displayName: string;

  /** Description */
  description?: string;

  /** Category for organization */
  category: ComponentCategory;

  /** Icon for admin UI (Lucide icon name) */
  icon?: string;

  /** Component variants */
  variants?: ComponentVariantMeta[];

  /** Default props */
  defaultProps?: Record<string, unknown>;

  /** Props schema for admin UI */
  propsSchema?: ComponentPropsSchema;

  /** Which regions this component can be placed in */
  allowedRegions?: string[];

  /** Whether component is themeable */
  themeable?: boolean;

  /** Source theme (for overrides) */
  sourceTheme?: string;
}

export type ComponentCategory =
  | 'layout'
  | 'navigation'
  | 'content'
  | 'form'
  | 'feedback'
  | 'data'
  | 'media'
  | 'utility'
  | 'custom';

export interface ComponentVariantMeta {
  /** Variant name */
  name: string;

  /** Display name */
  label: string;

  /** Description */
  description?: string;

  /** Preview/thumbnail */
  preview?: string;
}

export interface ComponentPropsSchema {
  /** Props definitions */
  properties: Record<string, PropDefinition>;

  /** Required props */
  required?: string[];
}

export interface PropDefinition {
  /** Prop type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function' | 'node';

  /** Display label */
  label: string;

  /** Description */
  description?: string;

  /** Default value */
  default?: unknown;

  /** For string: enum values */
  enum?: string[];

  /** For string: format (color, url, etc) */
  format?: string;

  /** For number: min/max */
  minimum?: number;
  maximum?: number;

  /** For array: item schema */
  items?: PropDefinition;

  /** For object: nested schema */
  properties?: Record<string, PropDefinition>;
}

// ============================================================================
// COMPONENT LIBRARY
// ============================================================================

/**
 * A collection of components provided by a theme
 */
export interface ComponentLibrary {
  /** Library identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Library version */
  version: string;

  /** Base components provided */
  components: Record<string, ComponentRegistryEntry>;

  /** Dependencies on other libraries */
  dependencies?: string[];

  /** Asset dependencies */
  assets?: LibraryAssets;
}

export interface LibraryAssets {
  /** CSS files to load */
  css?: string[];

  /** JS files to load */
  js?: string[];

  /** Font files to preload */
  fonts?: FontAsset[];
}

export interface FontAsset {
  /** Font family name */
  family: string;

  /** Font weights to load */
  weights: number[];

  /** Font styles to load */
  styles: ('normal' | 'italic')[];

  /** Font source */
  source: 'google' | 'custom' | 'system';

  /** Custom font URL */
  url?: string;

  /** Font display strategy */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}

// ============================================================================
// HOC & WRAPPER TYPES
// ============================================================================

/**
 * Higher-order component for wrapping themed components
 */
export type ComponentWrapper<P = Record<string, unknown>> = (
  WrappedComponent: ComponentType<P>
) => ComponentType<P>;

/**
 * Props injector function
 */
export type PropsInjector<P = Record<string, unknown>> = (
  props: P,
  context: ComponentContext
) => P;

/**
 * Context available to component overrides
 */
export interface ComponentContext {
  /** Current theme name */
  theme: string;

  /** Current color scheme */
  colorScheme: string;

  /** Current breakpoint */
  breakpoint: string;

  /** Current route */
  route: string;

  /** Region this component is in (if any) */
  region?: string;

  /** Theme settings */
  settings: Record<string, unknown>;

  /** Design tokens */
  tokens: Record<string, unknown>;
}

// ============================================================================
// COMPONENT SLOT SYSTEM
// ============================================================================

/**
 * Slot definition for compound components
 */
export interface SlotDefinition {
  /** Slot name */
  name: string;

  /** Display label */
  label: string;

  /** Description */
  description?: string;

  /** Default content */
  defaultContent?: ReactNode;

  /** Allowed component types */
  allowedComponents?: string[];

  /** Required slot */
  required?: boolean;

  /** Max items in slot */
  maxItems?: number;
}

/**
 * Slot content
 */
export interface SlotContent {
  /** Slot name */
  slot: string;

  /** Content */
  content: ReactNode;

  /** Props to pass to slot wrapper */
  props?: Record<string, unknown>;
}

/**
 * Props for slotted components
 */
export interface SlottedComponentProps {
  /** Named slots */
  slots?: Record<string, ReactNode>;

  /** Default slot (children) */
  children?: ReactNode;
}

// ============================================================================
// RENDER PROPS & HOOKS
// ============================================================================

/**
 * Render prop for custom rendering
 */
export type ComponentRenderProp<P, R = ReactNode> = (props: P) => R;

/**
 * Hook for accessing component overrides
 */
export interface UseComponentOverrideOptions {
  /** Component name */
  name: string;

  /** Original component */
  original: ComponentType;

  /** Override props */
  props?: Record<string, unknown>;

  /** Skip override resolution */
  skipOverride?: boolean;
}

export interface UseComponentOverrideResult<P> {
  /** Resolved component */
  Component: ComponentType<P>;

  /** Resolved props */
  props: P;

  /** Override info */
  override?: {
    theme: string;
    type: ComponentOverrideType;
    priority: number;
  };
}

// ============================================================================
// BASE COMPONENT DEFINITIONS
// ============================================================================

/**
 * Standard base components that themes should provide
 */
export type BaseComponentName =
  // Layout
  | 'Container'
  | 'Grid'
  | 'Stack'
  | 'Flex'
  | 'Box'
  | 'Divider'
  | 'Spacer'
  // Typography
  | 'Heading'
  | 'Text'
  | 'Paragraph'
  | 'Link'
  | 'Code'
  | 'Blockquote'
  // Forms
  | 'Button'
  | 'Input'
  | 'Textarea'
  | 'Select'
  | 'Checkbox'
  | 'Radio'
  | 'Switch'
  | 'Slider'
  | 'Form'
  | 'FormField'
  | 'Label'
  // Feedback
  | 'Alert'
  | 'Toast'
  | 'Progress'
  | 'Spinner'
  | 'Skeleton'
  | 'Badge'
  // Navigation
  | 'Nav'
  | 'NavItem'
  | 'Breadcrumb'
  | 'Pagination'
  | 'Tabs'
  | 'Menu'
  | 'Dropdown'
  // Data Display
  | 'Card'
  | 'Table'
  | 'List'
  | 'Avatar'
  | 'Tooltip'
  | 'Popover'
  // Overlay
  | 'Modal'
  | 'Drawer'
  | 'Sheet'
  // Media
  | 'Image'
  | 'Icon'
  | 'Video';

/**
 * Mapping of base component names to their prop types
 */
export interface BaseComponentProps {
  Button: {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    asChild?: boolean;
  };
  Input: {
    type?: string;
    variant?: 'default' | 'filled' | 'flushed' | 'unstyled';
    size?: 'sm' | 'md' | 'lg';
  };
  Card: {
    variant?: 'default' | 'outlined' | 'elevated' | 'filled';
    padding?: 'none' | 'sm' | 'md' | 'lg';
  };
  // Add more as needed...
}
