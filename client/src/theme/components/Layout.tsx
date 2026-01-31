/**
 * RSES CMS Theme Layout System
 *
 * Page layouts that use the region system.
 */

import React, { useMemo, type ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Region, RegionContentProvider } from './Region';
import type { LayoutDefinition, GridTemplate } from '../types';
import { cn } from '@/lib/utils';

// ============================================================================
// LAYOUT DEFINITIONS
// ============================================================================

/**
 * Pre-defined layout configurations
 */
export const LAYOUTS: Record<string, LayoutDefinition> = {
  // Single column layout
  single: {
    name: 'single',
    label: 'Single Column',
    description: 'Full-width single column layout',
    regions: ['header', 'navigation', 'breadcrumb', 'messages', 'content', 'footer'],
    gridTemplate: {
      columns: '1fr',
      areas: `
        "header"
        "navigation"
        "breadcrumb"
        "messages"
        "content"
        "footer"
      `,
      gap: '0',
    },
    className: 'layout-single',
  },

  // Two column with left sidebar
  sidebarLeft: {
    name: 'sidebar-left',
    label: 'Left Sidebar',
    description: 'Two column layout with left sidebar',
    regions: ['header', 'navigation', 'breadcrumb', 'messages', 'sidebar_left', 'content', 'footer'],
    gridTemplate: {
      columns: '280px 1fr',
      areas: `
        "header header"
        "navigation navigation"
        "breadcrumb breadcrumb"
        "messages messages"
        "sidebar-left content"
        "footer footer"
      `,
      gap: '0',
      columnGap: '1.5rem',
    },
    className: 'layout-sidebar-left',
    responsive: {
      md: {
        gridTemplate: {
          columns: '1fr',
          areas: `
            "header"
            "navigation"
            "breadcrumb"
            "messages"
            "content"
            "sidebar-left"
            "footer"
          `,
          gap: '0',
        },
      },
    },
  },

  // Two column with right sidebar
  sidebarRight: {
    name: 'sidebar-right',
    label: 'Right Sidebar',
    description: 'Two column layout with right sidebar',
    regions: ['header', 'navigation', 'breadcrumb', 'messages', 'content', 'sidebar_right', 'footer'],
    gridTemplate: {
      columns: '1fr 280px',
      areas: `
        "header header"
        "navigation navigation"
        "breadcrumb breadcrumb"
        "messages messages"
        "content sidebar-right"
        "footer footer"
      `,
      gap: '0',
      columnGap: '1.5rem',
    },
    className: 'layout-sidebar-right',
    responsive: {
      md: {
        gridTemplate: {
          columns: '1fr',
          areas: `
            "header"
            "navigation"
            "breadcrumb"
            "messages"
            "content"
            "sidebar-right"
            "footer"
          `,
          gap: '0',
        },
      },
    },
  },

  // Three column
  threeColumn: {
    name: 'three-column',
    label: 'Three Column',
    description: 'Three column layout with two sidebars',
    regions: ['header', 'navigation', 'breadcrumb', 'messages', 'sidebar_left', 'content', 'sidebar_right', 'footer'],
    gridTemplate: {
      columns: '240px 1fr 240px',
      areas: `
        "header header header"
        "navigation navigation navigation"
        "breadcrumb breadcrumb breadcrumb"
        "messages messages messages"
        "sidebar-left content sidebar-right"
        "footer footer footer"
      `,
      gap: '0',
      columnGap: '1.5rem',
    },
    className: 'layout-three-column',
    responsive: {
      lg: {
        gridTemplate: {
          columns: '240px 1fr',
          areas: `
            "header header"
            "navigation navigation"
            "breadcrumb breadcrumb"
            "messages messages"
            "sidebar-left content"
            "sidebar-right content"
            "footer footer"
          `,
          gap: '0',
          columnGap: '1rem',
        },
      },
      md: {
        gridTemplate: {
          columns: '1fr',
          areas: `
            "header"
            "navigation"
            "breadcrumb"
            "messages"
            "content"
            "sidebar-left"
            "sidebar-right"
            "footer"
          `,
          gap: '0',
        },
      },
    },
  },

  // Full width (no header/footer)
  fullWidth: {
    name: 'full-width',
    label: 'Full Width',
    description: 'Full width layout without header/footer',
    regions: ['content'],
    gridTemplate: {
      columns: '1fr',
      areas: '"content"',
      gap: '0',
    },
    className: 'layout-full-width',
  },

  // Dashboard layout
  dashboard: {
    name: 'dashboard',
    label: 'Dashboard',
    description: 'Dashboard layout with fixed sidebar',
    regions: ['admin_sidebar', 'header', 'breadcrumb', 'messages', 'content'],
    gridTemplate: {
      columns: '280px 1fr',
      rows: 'auto auto auto 1fr',
      areas: `
        "admin-sidebar header"
        "admin-sidebar breadcrumb"
        "admin-sidebar messages"
        "admin-sidebar content"
      `,
      gap: '0',
    },
    className: 'layout-dashboard',
    responsive: {
      lg: {
        gridTemplate: {
          columns: '1fr',
          areas: `
            "header"
            "admin-sidebar"
            "breadcrumb"
            "messages"
            "content"
          `,
          gap: '0',
        },
      },
    },
  },
};

// ============================================================================
// GRID TEMPLATE TO CSS
// ============================================================================

function gridTemplateToCSS(template: GridTemplate): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: template.columns,
    gridTemplateRows: template.rows,
    gridTemplateAreas: template.areas.trim().split('\n').map(line => line.trim()).join(' '),
    gap: template.gap,
    columnGap: template.columnGap,
    rowGap: template.rowGap,
  };
}

// ============================================================================
// LAYOUT COMPONENT
// ============================================================================

interface LayoutProps {
  /** Layout name or custom layout definition */
  layout?: string | LayoutDefinition;

  /** Children (content for regions) */
  children?: ReactNode;

  /** Additional className */
  className?: string;

  /** Content for specific regions */
  regions?: Partial<Record<string, ReactNode>>;
}

export function Layout({
  layout: layoutProp = 'single',
  children,
  className,
  regions = {},
}: LayoutProps) {
  const { breakpoint, theme } = useTheme();

  // Resolve layout definition
  const layout = useMemo(() => {
    if (typeof layoutProp === 'string') {
      return LAYOUTS[layoutProp] ?? LAYOUTS.single;
    }
    return layoutProp;
  }, [layoutProp]);

  // Get responsive layout for current breakpoint
  const responsiveLayout = useMemo(() => {
    if (!layout.responsive) return layout;

    // Find the most specific responsive variant
    const breakpointOrder = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];
    const currentIndex = breakpointOrder.indexOf(breakpoint);

    for (let i = currentIndex; i < breakpointOrder.length; i++) {
      const bp = breakpointOrder[i];
      if (layout.responsive[bp]) {
        return { ...layout, ...layout.responsive[bp] };
      }
    }

    return layout;
  }, [layout, breakpoint]);

  // Generate grid styles
  const gridStyles = useMemo(() => {
    if (!responsiveLayout.gridTemplate) return {};
    return gridTemplateToCSS(responsiveLayout.gridTemplate);
  }, [responsiveLayout]);

  return (
    <RegionContentProvider>
      <div
        className={cn(
          'rses-layout',
          `rses-layout--${responsiveLayout.name}`,
          responsiveLayout.className,
          className
        )}
        style={gridStyles}
      >
        {/* Render regions defined in layout */}
        {responsiveLayout.regions.map((regionName) => (
          <Region key={regionName} name={regionName}>
            {regions[regionName]}
          </Region>
        ))}

        {/* Render any additional children */}
        {children}
      </div>
    </RegionContentProvider>
  );
}

// ============================================================================
// PAGE WRAPPER
// ============================================================================

interface PageWrapperProps {
  /** Page title */
  title?: string;

  /** Page layout */
  layout?: string | LayoutDefinition;

  /** Children */
  children: ReactNode;

  /** Additional className for content area */
  className?: string;

  /** Sidebar content */
  sidebar?: ReactNode;

  /** Header content */
  header?: ReactNode;

  /** Footer content */
  footer?: ReactNode;

  /** Breadcrumb content */
  breadcrumb?: ReactNode;
}

export function PageWrapper({
  title,
  layout = 'single',
  children,
  className,
  sidebar,
  header,
  footer,
  breadcrumb,
}: PageWrapperProps) {
  // Set document title
  React.useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  const regions: Partial<Record<string, ReactNode>> = {};

  if (header) regions.header = header;
  if (footer) regions.footer = footer;
  if (breadcrumb) regions.breadcrumb = breadcrumb;
  if (sidebar) {
    // Determine which sidebar region based on layout
    const layoutDef = typeof layout === 'string' ? LAYOUTS[layout] : layout;
    if (layoutDef?.regions.includes('sidebar_left')) {
      regions.sidebar_left = sidebar;
    } else if (layoutDef?.regions.includes('sidebar_right')) {
      regions.sidebar_right = sidebar;
    }
  }

  regions.content = (
    <div className={cn('rses-page-content', className)}>
      {children}
    </div>
  );

  return <Layout layout={layout} regions={regions} />;
}

// ============================================================================
// CONTENT CONTAINER
// ============================================================================

interface ContainerProps {
  /** Max width variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';

  /** Center content */
  centered?: boolean;

  /** Padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';

  /** Children */
  children: ReactNode;

  /** Additional className */
  className?: string;
}

const containerSizes = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-full',
};

const containerPadding = {
  none: '',
  sm: 'px-4 py-2',
  md: 'px-6 py-4',
  lg: 'px-8 py-6',
};

export function Container({
  size = 'lg',
  centered = true,
  padding = 'md',
  children,
  className,
}: ContainerProps) {
  return (
    <div
      className={cn(
        'rses-container w-full',
        containerSizes[size],
        containerPadding[padding],
        centered && 'mx-auto',
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// SECTION
// ============================================================================

interface SectionProps {
  /** Section title */
  title?: string;

  /** Section description */
  description?: string;

  /** Children */
  children: ReactNode;

  /** Additional className */
  className?: string;

  /** HTML element to render as */
  as?: 'section' | 'div' | 'article';
}

export function Section({
  title,
  description,
  children,
  className,
  as: Element = 'section',
}: SectionProps) {
  return (
    <Element className={cn('rses-section', className)}>
      {(title || description) && (
        <header className="mb-6">
          {title && <h2 className="text-2xl font-semibold">{title}</h2>}
          {description && (
            <p className="mt-1 text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      {children}
    </Element>
  );
}
