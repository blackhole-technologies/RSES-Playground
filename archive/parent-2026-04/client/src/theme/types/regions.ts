/**
 * RSES CMS Region System
 *
 * Regions are structural areas of the page layout where components can be placed.
 * This is similar to Drupal's region system but adapted for React.
 */

import type { ComponentType, ReactNode } from 'react';

// ============================================================================
// REGION DEFINITIONS
// ============================================================================

/**
 * Region definition in theme manifest
 */
export interface RegionDefinition {
  /** Region machine name */
  name: string;

  /** Human-readable label */
  label: string;

  /** Description for admin UI */
  description?: string;

  /** Whether this region is required */
  required?: boolean;

  /** Default content when empty */
  defaultContent?: ReactNode;

  /** CSS class applied to region wrapper */
  className?: string;

  /** HTML element to use for region wrapper */
  element?: keyof JSX.IntrinsicElements;

  /** ARIA role for accessibility */
  role?: string;

  /** ARIA label */
  ariaLabel?: string;

  /** CSS Grid/Flexbox area name */
  gridArea?: string;

  /** Visibility settings */
  visibility?: RegionVisibility;

  /** Allowed component types in this region */
  allowedComponents?: string[];

  /** Maximum number of items */
  maxItems?: number;

  /** Display order */
  weight?: number;
}

/**
 * Region visibility configuration
 */
export interface RegionVisibility {
  /** Show on specific routes */
  routes?: string[];

  /** Hide on specific routes */
  excludeRoutes?: string[];

  /** Show at specific breakpoints */
  breakpoints?: string[];

  /** Hide at specific breakpoints */
  excludeBreakpoints?: string[];

  /** Show for specific user roles */
  roles?: string[];

  /** Custom visibility function */
  condition?: (context: RegionVisibilityContext) => boolean;
}

export interface RegionVisibilityContext {
  route: string;
  breakpoint: string;
  userRoles: string[];
  isAuthenticated: boolean;
  colorScheme: string;
  customData?: Record<string, unknown>;
}

// ============================================================================
// STANDARD REGIONS
// ============================================================================

/**
 * Standard region names that themes should support
 */
export type StandardRegionName =
  // Header regions
  | 'header'
  | 'header_top'
  | 'header_left'
  | 'header_right'
  | 'header_bottom'
  | 'branding'
  | 'navigation'
  | 'navigation_secondary'
  // Main content regions
  | 'content'
  | 'content_top'
  | 'content_bottom'
  | 'highlighted'
  // Sidebar regions
  | 'sidebar_left'
  | 'sidebar_right'
  | 'sidebar_first'
  | 'sidebar_second'
  // Footer regions
  | 'footer'
  | 'footer_top'
  | 'footer_left'
  | 'footer_center'
  | 'footer_right'
  | 'footer_bottom'
  // Utility regions
  | 'breadcrumb'
  | 'messages'
  | 'help'
  | 'page_top'
  | 'page_bottom'
  // Off-canvas regions
  | 'off_canvas_left'
  | 'off_canvas_right'
  | 'modal'
  | 'drawer'
  // Admin regions
  | 'admin_toolbar'
  | 'admin_sidebar';

/**
 * Standard region definitions for base theme
 */
export const STANDARD_REGIONS: Record<StandardRegionName, RegionDefinition> = {
  // Header regions
  header: {
    name: 'header',
    label: 'Header',
    description: 'Main header area',
    element: 'header',
    role: 'banner',
    gridArea: 'header',
    weight: 0,
  },
  header_top: {
    name: 'header_top',
    label: 'Header Top',
    description: 'Above main header (announcements, utility nav)',
    gridArea: 'header-top',
    weight: -10,
  },
  header_left: {
    name: 'header_left',
    label: 'Header Left',
    description: 'Left side of header',
    weight: 1,
  },
  header_right: {
    name: 'header_right',
    label: 'Header Right',
    description: 'Right side of header',
    weight: 2,
  },
  header_bottom: {
    name: 'header_bottom',
    label: 'Header Bottom',
    description: 'Below main header (secondary nav)',
    gridArea: 'header-bottom',
    weight: 10,
  },
  branding: {
    name: 'branding',
    label: 'Branding',
    description: 'Logo and site name',
    weight: 0,
  },
  navigation: {
    name: 'navigation',
    label: 'Main Navigation',
    description: 'Primary site navigation',
    element: 'nav',
    role: 'navigation',
    ariaLabel: 'Main navigation',
    weight: 5,
  },
  navigation_secondary: {
    name: 'navigation_secondary',
    label: 'Secondary Navigation',
    description: 'Secondary navigation menu',
    element: 'nav',
    role: 'navigation',
    ariaLabel: 'Secondary navigation',
    weight: 6,
  },

  // Main content regions
  content: {
    name: 'content',
    label: 'Content',
    description: 'Main page content',
    required: true,
    element: 'main',
    role: 'main',
    gridArea: 'content',
    weight: 50,
  },
  content_top: {
    name: 'content_top',
    label: 'Content Top',
    description: 'Above main content',
    gridArea: 'content-top',
    weight: 40,
  },
  content_bottom: {
    name: 'content_bottom',
    label: 'Content Bottom',
    description: 'Below main content',
    gridArea: 'content-bottom',
    weight: 60,
  },
  highlighted: {
    name: 'highlighted',
    label: 'Highlighted',
    description: 'Featured/highlighted content area',
    weight: 45,
  },

  // Sidebar regions
  sidebar_left: {
    name: 'sidebar_left',
    label: 'Left Sidebar',
    description: 'Left sidebar area',
    element: 'aside',
    role: 'complementary',
    ariaLabel: 'Left sidebar',
    gridArea: 'sidebar-left',
    weight: 30,
  },
  sidebar_right: {
    name: 'sidebar_right',
    label: 'Right Sidebar',
    description: 'Right sidebar area',
    element: 'aside',
    role: 'complementary',
    ariaLabel: 'Right sidebar',
    gridArea: 'sidebar-right',
    weight: 70,
  },
  sidebar_first: {
    name: 'sidebar_first',
    label: 'First Sidebar',
    description: 'Primary sidebar (position determined by layout)',
    element: 'aside',
    role: 'complementary',
    weight: 30,
  },
  sidebar_second: {
    name: 'sidebar_second',
    label: 'Second Sidebar',
    description: 'Secondary sidebar (position determined by layout)',
    element: 'aside',
    role: 'complementary',
    weight: 70,
  },

  // Footer regions
  footer: {
    name: 'footer',
    label: 'Footer',
    description: 'Main footer area',
    element: 'footer',
    role: 'contentinfo',
    gridArea: 'footer',
    weight: 100,
  },
  footer_top: {
    name: 'footer_top',
    label: 'Footer Top',
    description: 'Above main footer',
    gridArea: 'footer-top',
    weight: 90,
  },
  footer_left: {
    name: 'footer_left',
    label: 'Footer Left',
    description: 'Left footer column',
    weight: 101,
  },
  footer_center: {
    name: 'footer_center',
    label: 'Footer Center',
    description: 'Center footer column',
    weight: 102,
  },
  footer_right: {
    name: 'footer_right',
    label: 'Footer Right',
    description: 'Right footer column',
    weight: 103,
  },
  footer_bottom: {
    name: 'footer_bottom',
    label: 'Footer Bottom',
    description: 'Below main footer (copyright, legal)',
    gridArea: 'footer-bottom',
    weight: 110,
  },

  // Utility regions
  breadcrumb: {
    name: 'breadcrumb',
    label: 'Breadcrumb',
    description: 'Breadcrumb navigation',
    element: 'nav',
    role: 'navigation',
    ariaLabel: 'Breadcrumb',
    weight: 35,
  },
  messages: {
    name: 'messages',
    label: 'Messages',
    description: 'System messages and notifications',
    role: 'status',
    ariaLabel: 'Status messages',
    weight: 36,
  },
  help: {
    name: 'help',
    label: 'Help',
    description: 'Contextual help text',
    weight: 37,
  },
  page_top: {
    name: 'page_top',
    label: 'Page Top',
    description: 'Very top of page (skip links, etc)',
    weight: -100,
  },
  page_bottom: {
    name: 'page_bottom',
    label: 'Page Bottom',
    description: 'Very bottom of page',
    weight: 200,
  },

  // Off-canvas regions
  off_canvas_left: {
    name: 'off_canvas_left',
    label: 'Off-Canvas Left',
    description: 'Left slide-out panel',
    visibility: {
      excludeBreakpoints: ['lg', 'xl', '2xl'],
    },
    weight: -50,
  },
  off_canvas_right: {
    name: 'off_canvas_right',
    label: 'Off-Canvas Right',
    description: 'Right slide-out panel',
    visibility: {
      excludeBreakpoints: ['lg', 'xl', '2xl'],
    },
    weight: -49,
  },
  modal: {
    name: 'modal',
    label: 'Modal',
    description: 'Modal dialog container',
    role: 'dialog',
    weight: 300,
  },
  drawer: {
    name: 'drawer',
    label: 'Drawer',
    description: 'Drawer panel container',
    weight: 301,
  },

  // Admin regions
  admin_toolbar: {
    name: 'admin_toolbar',
    label: 'Admin Toolbar',
    description: 'Administrative toolbar',
    visibility: {
      roles: ['admin', 'editor'],
    },
    weight: -200,
  },
  admin_sidebar: {
    name: 'admin_sidebar',
    label: 'Admin Sidebar',
    description: 'Administrative sidebar',
    visibility: {
      roles: ['admin', 'editor'],
    },
    weight: -199,
  },
};

// ============================================================================
// REGION CONTENT
// ============================================================================

/**
 * Content item placed in a region
 */
export interface RegionContent {
  /** Unique identifier */
  id: string;

  /** Component type/name */
  component: string;

  /** Component props */
  props?: Record<string, unknown>;

  /** Display weight (order) */
  weight?: number;

  /** Visibility settings */
  visibility?: RegionVisibility;

  /** CSS class to add */
  className?: string;

  /** Whether this item is enabled */
  enabled?: boolean;
}

/**
 * Region state at runtime
 */
export interface RegionState {
  /** Region definition */
  definition: RegionDefinition;

  /** Content items in this region */
  content: RegionContent[];

  /** Whether region is currently visible */
  isVisible: boolean;

  /** Whether region has any content */
  hasContent: boolean;

  /** Computed CSS classes */
  computedClassName: string;
}

// ============================================================================
// LAYOUT DEFINITIONS
// ============================================================================

/**
 * Layout variant that determines how regions are arranged
 */
export interface LayoutDefinition {
  /** Layout machine name */
  name: string;

  /** Human-readable label */
  label: string;

  /** Description */
  description?: string;

  /** Icon for admin UI */
  icon?: string;

  /** Screenshot for admin UI */
  screenshot?: string;

  /** Regions used in this layout */
  regions: string[];

  /** CSS Grid template */
  gridTemplate?: GridTemplate;

  /** CSS classes for layout wrapper */
  className?: string;

  /** Responsive variants */
  responsive?: Record<string, Partial<LayoutDefinition>>;
}

export interface GridTemplate {
  /** Grid template columns */
  columns: string;

  /** Grid template rows */
  rows?: string;

  /** Grid template areas */
  areas: string;

  /** Gap between grid items */
  gap?: string;

  /** Column gap */
  columnGap?: string;

  /** Row gap */
  rowGap?: string;
}

// ============================================================================
// REGION COMPONENT PROPS
// ============================================================================

/**
 * Props passed to Region component
 */
export interface RegionProps {
  /** Region name */
  name: string;

  /** Override CSS class */
  className?: string;

  /** Override element type */
  as?: keyof JSX.IntrinsicElements;

  /** Children (fallback content) */
  children?: ReactNode;

  /** Additional HTML attributes */
  [key: string]: unknown;
}

/**
 * Props for RegionContent component
 */
export interface RegionContentProps {
  /** Content items */
  items: RegionContent[];

  /** Region context */
  region: string;
}

/**
 * Region component type
 */
export type RegionComponent = ComponentType<RegionProps>;

/**
 * Region wrapper render function
 */
export type RegionRenderer = (
  region: RegionDefinition,
  content: ReactNode,
  props: RegionProps
) => ReactNode;
