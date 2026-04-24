/**
 * AI-Powered Design Intelligence System
 *
 * Provides intelligent design recommendations, component generation,
 * and design-to-code capabilities.
 *
 * Features:
 * - Auto-generate component variations
 * - Design-to-code generation
 * - Usage analytics
 * - A/B testing integration
 * - Accessibility scoring
 * - Performance impact analysis
 */

import type { Color, ColorSuggestion } from './color-intelligence';
import { ColorIntelligence } from './color-intelligence';
import type { TokenDefinition, TokenExtensions } from '../types/w3c-tokens';
import type { TransitionPreset, SpringConfig } from '../types/motion-tokens';

// ============================================================================
// DESIGN INTELLIGENCE TYPES
// ============================================================================

/**
 * Component design specification
 */
export interface ComponentDesignSpec {
  /** Component name */
  name: string;
  /** Component category */
  category: ComponentCategory;
  /** Design tokens used */
  tokens: ComponentTokens;
  /** Variants */
  variants: ComponentVariant[];
  /** States */
  states: ComponentState[];
  /** Accessibility requirements */
  accessibility: AccessibilitySpec;
  /** Animation configuration */
  animation: AnimationSpec;
  /** Responsive behavior */
  responsive: ResponsiveSpec;
}

export type ComponentCategory =
  | 'action' // Buttons, links, CTAs
  | 'input' // Form inputs, selects
  | 'display' // Cards, badges, avatars
  | 'navigation' // Navbars, breadcrumbs, tabs
  | 'feedback' // Alerts, toasts, progress
  | 'overlay' // Modals, popovers, tooltips
  | 'layout' // Containers, grids, dividers
  | 'data' // Tables, charts, lists
  | 'media'; // Images, videos, icons

export interface ComponentTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, string>;
  borders: Record<string, string>;
  shadows: Record<string, string>;
  motion: Record<string, string>;
}

export interface ComponentVariant {
  name: string;
  description: string;
  props: Record<string, unknown>;
  tokens: Partial<ComponentTokens>;
  preview?: string;
}

export interface ComponentState {
  name: 'default' | 'hover' | 'focus' | 'active' | 'disabled' | 'loading' | 'error' | 'success';
  tokens: Partial<ComponentTokens>;
  transition?: TransitionPreset;
}

export interface AccessibilitySpec {
  role?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  focusable: boolean;
  keyboardNav: KeyboardNavSpec;
  screenReader: ScreenReaderSpec;
  contrastRequirements: ContrastRequirements;
}

export interface KeyboardNavSpec {
  keys: string[];
  tabIndex?: number;
  focusTrap?: boolean;
  arrowNav?: 'horizontal' | 'vertical' | 'both' | 'none';
}

export interface ScreenReaderSpec {
  announcements: string[];
  liveRegion?: 'polite' | 'assertive' | 'off';
  hideFromScreenReader?: boolean;
}

export interface ContrastRequirements {
  textOnBackground: 'AA' | 'AAA';
  graphicalElements: boolean;
  focusIndicator: boolean;
}

export interface AnimationSpec {
  enter?: TransitionPreset;
  exit?: TransitionPreset;
  stateChange?: TransitionPreset;
  spring?: SpringConfig;
  reducedMotionFallback: 'none' | 'instant' | 'fade';
}

export interface ResponsiveSpec {
  breakpoints: ResponsiveBreakpoint[];
  containerQueries?: ContainerQuerySpec[];
}

export interface ResponsiveBreakpoint {
  name: string;
  minWidth: number;
  tokens?: Partial<ComponentTokens>;
  hide?: boolean;
}

export interface ContainerQuerySpec {
  name: string;
  condition: string;
  tokens: Partial<ComponentTokens>;
}

// ============================================================================
// DESIGN SUGGESTIONS
// ============================================================================

/**
 * Design suggestion from AI analysis
 */
export interface DesignSuggestion {
  id: string;
  type: SuggestionType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  currentValue?: unknown;
  suggestedValue: unknown;
  impact: DesignImpact;
  confidence: number;
  autoFixable: boolean;
}

export type SuggestionType =
  | 'accessibility'
  | 'contrast'
  | 'spacing'
  | 'typography'
  | 'color'
  | 'motion'
  | 'performance'
  | 'consistency'
  | 'responsive';

export interface DesignImpact {
  accessibility: number; // 0-100
  performance: number; // 0-100
  usability: number; // 0-100
  aesthetics: number; // 0-100
}

// ============================================================================
// USAGE ANALYTICS
// ============================================================================

/**
 * Component usage analytics
 */
export interface ComponentAnalytics {
  componentName: string;
  usageCount: number;
  uniqueVariants: number;
  averageRenderTime: number;
  accessibilityScore: number;
  interactionRate: number;
  errorRate: number;
  abTestResults?: ABTestResult[];
  heatmapData?: HeatmapData;
  userFeedback?: UserFeedback[];
}

export interface ABTestResult {
  testId: string;
  variant: string;
  metric: string;
  value: number;
  confidence: number;
  winner: boolean;
  sampleSize: number;
  startDate: string;
  endDate?: string;
}

export interface HeatmapData {
  clicks: ClickData[];
  hovers: HoverData[];
  scrollDepth: number[];
  timeOnComponent: number;
}

export interface ClickData {
  x: number;
  y: number;
  count: number;
  element?: string;
}

export interface HoverData {
  x: number;
  y: number;
  duration: number;
  element?: string;
}

export interface UserFeedback {
  rating: number;
  comment?: string;
  timestamp: string;
  userId?: string;
}

// ============================================================================
// PERFORMANCE ANALYSIS
// ============================================================================

/**
 * Component performance analysis
 */
export interface PerformanceAnalysis {
  componentName: string;
  metrics: PerformanceMetrics;
  recommendations: PerformanceRecommendation[];
  score: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  reRenderCount: number;
  bundleSize: number;
  cssSize: number;
  memoryUsage: number;
  layoutShift: number;
  paintTime: number;
  interactionDelay: number;
}

export interface PerformanceRecommendation {
  type: 'bundle' | 'render' | 'css' | 'animation' | 'memory';
  title: string;
  description: string;
  potentialGain: number;
  effort: 'low' | 'medium' | 'high';
  code?: string;
}

// ============================================================================
// DESIGN INTELLIGENCE ENGINE
// ============================================================================

/**
 * Design Intelligence Engine
 */
export class DesignIntelligenceEngine {
  private tokenCache: Map<string, TokenDefinition> = new Map();
  private analyticsStore: Map<string, ComponentAnalytics> = new Map();

  /**
   * Generate component variations from base design
   */
  generateVariations(
    baseSpec: ComponentDesignSpec,
    options: VariationOptions
  ): ComponentVariant[] {
    const variations: ComponentVariant[] = [];

    // Size variations
    if (options.sizes) {
      variations.push(...this.generateSizeVariations(baseSpec));
    }

    // Color variations
    if (options.colors) {
      variations.push(...this.generateColorVariations(baseSpec));
    }

    // Style variations (outlined, filled, ghost, etc.)
    if (options.styles) {
      variations.push(...this.generateStyleVariations(baseSpec));
    }

    // Shape variations
    if (options.shapes) {
      variations.push(...this.generateShapeVariations(baseSpec));
    }

    return variations;
  }

  private generateSizeVariations(spec: ComponentDesignSpec): ComponentVariant[] {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
    const baseScale = 1;

    return sizes.map((size, index) => {
      const scale = 0.75 + (index * 0.25);
      return {
        name: size,
        description: `${size.toUpperCase()} size variant`,
        props: { size },
        tokens: {
          spacing: {
            padding: `calc(var(--spacing-base) * ${scale})`,
            gap: `calc(var(--spacing-base) * ${scale * 0.5})`,
          },
          typography: {
            fontSize: `calc(var(--font-size-base) * ${scale})`,
          },
          borders: {
            radius: `calc(var(--radius-base) * ${scale})`,
          },
        },
      };
    });
  }

  private generateColorVariations(spec: ComponentDesignSpec): ComponentVariant[] {
    const colorRoles = ['primary', 'secondary', 'accent', 'success', 'warning', 'error', 'neutral'];

    return colorRoles.map(role => ({
      name: role,
      description: `${role} color variant`,
      props: { color: role },
      tokens: {
        colors: {
          background: `var(--color-${role}-500)`,
          foreground: `var(--color-${role}-foreground)`,
          border: `var(--color-${role}-600)`,
          hover: `var(--color-${role}-600)`,
          active: `var(--color-${role}-700)`,
        },
      },
    }));
  }

  private generateStyleVariations(spec: ComponentDesignSpec): ComponentVariant[] {
    return [
      {
        name: 'solid',
        description: 'Solid filled variant',
        props: { variant: 'solid' },
        tokens: {
          colors: {
            background: 'var(--color-primary-500)',
            foreground: 'var(--color-primary-foreground)',
          },
        },
      },
      {
        name: 'outline',
        description: 'Outlined variant',
        props: { variant: 'outline' },
        tokens: {
          colors: {
            background: 'transparent',
            foreground: 'var(--color-primary-500)',
            border: 'var(--color-primary-500)',
          },
          borders: {
            width: 'var(--border-width-thin)',
          },
        },
      },
      {
        name: 'ghost',
        description: 'Ghost/subtle variant',
        props: { variant: 'ghost' },
        tokens: {
          colors: {
            background: 'transparent',
            foreground: 'var(--color-primary-500)',
            hover: 'var(--color-primary-100)',
          },
        },
      },
      {
        name: 'soft',
        description: 'Soft/muted variant',
        props: { variant: 'soft' },
        tokens: {
          colors: {
            background: 'var(--color-primary-100)',
            foreground: 'var(--color-primary-700)',
          },
        },
      },
      {
        name: 'link',
        description: 'Link-style variant',
        props: { variant: 'link' },
        tokens: {
          colors: {
            background: 'transparent',
            foreground: 'var(--color-primary-500)',
          },
          typography: {
            textDecoration: 'underline',
          },
        },
      },
    ];
  }

  private generateShapeVariations(spec: ComponentDesignSpec): ComponentVariant[] {
    return [
      {
        name: 'square',
        description: 'Square corners',
        props: { shape: 'square' },
        tokens: { borders: { radius: '0' } },
      },
      {
        name: 'rounded',
        description: 'Rounded corners',
        props: { shape: 'rounded' },
        tokens: { borders: { radius: 'var(--radius-md)' } },
      },
      {
        name: 'pill',
        description: 'Pill/capsule shape',
        props: { shape: 'pill' },
        tokens: { borders: { radius: 'var(--radius-full)' } },
      },
      {
        name: 'circle',
        description: 'Circular shape',
        props: { shape: 'circle' },
        tokens: {
          borders: { radius: 'var(--radius-full)' },
          spacing: { aspectRatio: '1' },
        },
      },
    ];
  }

  /**
   * Analyze design for accessibility and suggest improvements
   */
  analyzeAccessibility(spec: ComponentDesignSpec): DesignSuggestion[] {
    const suggestions: DesignSuggestion[] = [];

    // Check contrast ratios
    const bgColor = spec.tokens.colors.background;
    const fgColor = spec.tokens.colors.foreground;

    if (bgColor && fgColor) {
      try {
        const bg = ColorIntelligence.parseColor(bgColor);
        const fg = ColorIntelligence.parseColor(fgColor);
        const compliance = ColorIntelligence.checkWCAGCompliance(fg, bg);

        if (!compliance.aa.normal) {
          const accessibleColor = ColorIntelligence.findAccessibleColor(fg, bg, 4.5);
          suggestions.push({
            id: `contrast-${spec.name}`,
            type: 'contrast',
            priority: 'critical',
            title: 'Insufficient Color Contrast',
            description: `Text color does not meet WCAG AA requirements. Current ratio: ${compliance.ratio.toFixed(2)}`,
            currentValue: fgColor,
            suggestedValue: accessibleColor.hex,
            impact: {
              accessibility: 100,
              performance: 0,
              usability: 80,
              aesthetics: 20,
            },
            confidence: 0.95,
            autoFixable: true,
          });
        }
      } catch {
        // Color parsing failed, skip contrast check
      }
    }

    // Check focus indicators
    if (!spec.states.some(s => s.name === 'focus')) {
      suggestions.push({
        id: `focus-${spec.name}`,
        type: 'accessibility',
        priority: 'high',
        title: 'Missing Focus Indicator',
        description: 'Component lacks visible focus state for keyboard navigation',
        suggestedValue: {
          name: 'focus',
          tokens: {
            borders: { outline: '2px solid var(--color-primary-500)' },
            shadows: { ring: '0 0 0 2px var(--color-primary-200)' },
          },
        },
        impact: {
          accessibility: 90,
          performance: 0,
          usability: 70,
          aesthetics: 10,
        },
        confidence: 0.9,
        autoFixable: true,
      });
    }

    // Check keyboard navigation
    if (spec.category === 'action' && !spec.accessibility.keyboardNav.keys.includes('Enter')) {
      suggestions.push({
        id: `keyboard-${spec.name}`,
        type: 'accessibility',
        priority: 'high',
        title: 'Incomplete Keyboard Support',
        description: 'Action component should be activatable with Enter key',
        suggestedValue: { keys: ['Enter', 'Space'] },
        impact: {
          accessibility: 85,
          performance: 0,
          usability: 75,
          aesthetics: 0,
        },
        confidence: 0.95,
        autoFixable: true,
      });
    }

    return suggestions;
  }

  /**
   * Generate design-to-code output
   */
  generateCode(
    spec: ComponentDesignSpec,
    options: CodeGenerationOptions
  ): GeneratedCode {
    const { framework, language, styling } = options;

    let code: string;
    let styles: string;
    let types: string;

    switch (framework) {
      case 'react':
        code = this.generateReactComponent(spec, styling);
        break;
      case 'vue':
        code = this.generateVueComponent(spec, styling);
        break;
      case 'svelte':
        code = this.generateSvelteComponent(spec, styling);
        break;
      case 'solid':
        code = this.generateSolidComponent(spec, styling);
        break;
      default:
        code = this.generateReactComponent(spec, styling);
    }

    switch (styling) {
      case 'css':
        styles = this.generateCSS(spec);
        break;
      case 'tailwind':
        styles = this.generateTailwindClasses(spec);
        break;
      case 'css-in-js':
        styles = this.generateCSSInJS(spec);
        break;
      default:
        styles = this.generateCSS(spec);
    }

    types = language === 'typescript' ? this.generateTypes(spec) : '';

    return {
      component: code,
      styles,
      types,
      tests: this.generateTests(spec, framework),
      storybook: this.generateStorybook(spec, framework),
    };
  }

  private generateReactComponent(spec: ComponentDesignSpec, styling: StylingApproach): string {
    const className = styling === 'tailwind' ? this.generateTailwindClasses(spec) : `${spec.name.toLowerCase()}`;

    return `import React, { forwardRef } from 'react';
import type { ${spec.name}Props } from './${spec.name}.types';
${styling === 'css' ? `import './${spec.name}.css';` : ''}
${styling === 'css-in-js' ? `import { styled } from '@/styled';` : ''}

export const ${spec.name} = forwardRef<HTMLElement, ${spec.name}Props>(
  ({
    children,
    variant = 'solid',
    size = 'md',
    color = 'primary',
    disabled = false,
    className,
    ...props
  }, ref) => {
    return (
      <${spec.category === 'action' ? 'button' : 'div'}
        ref={ref}
        className={\`${className} \${className || ''}\`}
        disabled={disabled}
        data-variant={variant}
        data-size={size}
        data-color={color}
        {...props}
      >
        {children}
      </${spec.category === 'action' ? 'button' : 'div'}>
    );
  }
);

${spec.name}.displayName = '${spec.name}';
`;
  }

  private generateVueComponent(spec: ComponentDesignSpec, styling: StylingApproach): string {
    return `<script setup lang="ts">
interface Props {
  variant?: 'solid' | 'outline' | 'ghost' | 'soft' | 'link';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error';
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'solid',
  size: 'md',
  color: 'primary',
  disabled: false,
});
</script>

<template>
  <${spec.category === 'action' ? 'button' : 'div'}
    class="${spec.name.toLowerCase()}"
    :disabled="disabled"
    :data-variant="variant"
    :data-size="size"
    :data-color="color"
  >
    <slot />
  </${spec.category === 'action' ? 'button' : 'div'}>
</template>

<style scoped>
${this.generateCSS(spec)}
</style>
`;
  }

  private generateSvelteComponent(spec: ComponentDesignSpec, styling: StylingApproach): string {
    return `<script lang="ts">
  export let variant: 'solid' | 'outline' | 'ghost' | 'soft' | 'link' = 'solid';
  export let size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
  export let color: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' = 'primary';
  export let disabled: boolean = false;
</script>

<${spec.category === 'action' ? 'button' : 'div'}
  class="${spec.name.toLowerCase()}"
  {disabled}
  data-variant={variant}
  data-size={size}
  data-color={color}
>
  <slot />
</${spec.category === 'action' ? 'button' : 'div'}>

<style>
${this.generateCSS(spec)}
</style>
`;
  }

  private generateSolidComponent(spec: ComponentDesignSpec, styling: StylingApproach): string {
    return `import { Component, JSX, splitProps } from 'solid-js';

interface ${spec.name}Props extends JSX.HTMLAttributes<HTMLElement> {
  variant?: 'solid' | 'outline' | 'ghost' | 'soft' | 'link';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error';
  disabled?: boolean;
}

export const ${spec.name}: Component<${spec.name}Props> = (props) => {
  const [local, others] = splitProps(props, [
    'variant', 'size', 'color', 'disabled', 'children', 'class'
  ]);

  return (
    <${spec.category === 'action' ? 'button' : 'div'}
      class={\`${spec.name.toLowerCase()} \${local.class || ''}\`}
      disabled={local.disabled}
      data-variant={local.variant ?? 'solid'}
      data-size={local.size ?? 'md'}
      data-color={local.color ?? 'primary'}
      {...others}
    >
      {local.children}
    </${spec.category === 'action' ? 'button' : 'div'}>
  );
};
`;
  }

  private generateCSS(spec: ComponentDesignSpec): string {
    return `.${spec.name.toLowerCase()} {
  /* Base styles */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-family-sans);
  font-weight: var(--font-weight-medium);
  transition: var(--transition-standard);
  cursor: pointer;

  /* Size: md (default) */
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-md);

  /* Variant: solid (default) */
  background-color: var(--color-primary-500);
  color: var(--color-primary-foreground);
  border: none;
}

/* Variants */
.${spec.name.toLowerCase()}[data-variant="outline"] {
  background-color: transparent;
  color: var(--color-primary-500);
  border: 1px solid var(--color-primary-500);
}

.${spec.name.toLowerCase()}[data-variant="ghost"] {
  background-color: transparent;
  color: var(--color-primary-500);
  border: none;
}

.${spec.name.toLowerCase()}[data-variant="soft"] {
  background-color: var(--color-primary-100);
  color: var(--color-primary-700);
  border: none;
}

/* Sizes */
.${spec.name.toLowerCase()}[data-size="xs"] {
  padding: var(--spacing-1) var(--spacing-2);
  font-size: var(--font-size-xs);
}

.${spec.name.toLowerCase()}[data-size="sm"] {
  padding: var(--spacing-1\\.5) var(--spacing-3);
  font-size: var(--font-size-sm);
}

.${spec.name.toLowerCase()}[data-size="lg"] {
  padding: var(--spacing-2\\.5) var(--spacing-5);
  font-size: var(--font-size-base);
}

.${spec.name.toLowerCase()}[data-size="xl"] {
  padding: var(--spacing-3) var(--spacing-6);
  font-size: var(--font-size-lg);
}

/* States */
.${spec.name.toLowerCase()}:hover:not(:disabled) {
  background-color: var(--color-primary-600);
}

.${spec.name.toLowerCase()}:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}

.${spec.name.toLowerCase()}:active:not(:disabled) {
  background-color: var(--color-primary-700);
  transform: scale(0.98);
}

.${spec.name.toLowerCase()}:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .${spec.name.toLowerCase()} {
    transition: none;
  }

  .${spec.name.toLowerCase()}:active:not(:disabled) {
    transform: none;
  }
}
`;
  }

  private generateTailwindClasses(spec: ComponentDesignSpec): string {
    return 'inline-flex items-center justify-center font-medium transition-all ' +
           'px-4 py-2 text-sm rounded-md ' +
           'bg-primary-500 text-primary-foreground ' +
           'hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500 ' +
           'active:bg-primary-700 active:scale-[0.98] ' +
           'disabled:opacity-50 disabled:cursor-not-allowed';
  }

  private generateCSSInJS(spec: ComponentDesignSpec): string {
    return `export const ${spec.name.toLowerCase()}Styles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-family-sans)',
    fontWeight: 'var(--font-weight-medium)',
    transition: 'var(--transition-standard)',
    cursor: 'pointer',
    padding: 'var(--spacing-2) var(--spacing-4)',
    fontSize: 'var(--font-size-sm)',
    borderRadius: 'var(--radius-md)',
  },
  variants: {
    solid: {
      backgroundColor: 'var(--color-primary-500)',
      color: 'var(--color-primary-foreground)',
      border: 'none',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--color-primary-500)',
      border: '1px solid var(--color-primary-500)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-primary-500)',
      border: 'none',
    },
  },
};`;
  }

  private generateTypes(spec: ComponentDesignSpec): string {
    return `import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from 'react';

export interface ${spec.name}Props extends ComponentPropsWithoutRef<'${spec.category === 'action' ? 'button' : 'div'}'> {
  /** Visual variant */
  variant?: 'solid' | 'outline' | 'ghost' | 'soft' | 'link';
  /** Size variant */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Color scheme */
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Icon before content */
  iconBefore?: ReactNode;
  /** Icon after content */
  iconAfter?: ReactNode;
  /** Full width */
  fullWidth?: boolean;
  /** Component content */
  children?: ReactNode;
}

export type ${spec.name}Ref = ElementRef<'${spec.category === 'action' ? 'button' : 'div'}'>;
`;
  }

  private generateTests(spec: ComponentDesignSpec, framework: Framework): string {
    return `import { render, screen, fireEvent } from '@testing-library/react';
import { ${spec.name} } from './${spec.name}';

describe('${spec.name}', () => {
  it('renders correctly', () => {
    render(<${spec.name}>Click me</${spec.name}>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<${spec.name} onClick={handleClick}>Click me</${spec.name}>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('respects disabled state', () => {
    const handleClick = jest.fn();
    render(<${spec.name} disabled onClick={handleClick}>Click me</${spec.name}>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies variant classes correctly', () => {
    render(<${spec.name} variant="outline">Click me</${spec.name}>);
    const element = screen.getByText('Click me');
    expect(element).toHaveAttribute('data-variant', 'outline');
  });

  it('meets accessibility requirements', async () => {
    const { container } = render(<${spec.name}>Click me</${spec.name}>);
    // Add axe-core accessibility checks
    expect(container).toBeAccessible();
  });
});
`;
  }

  private generateStorybook(spec: ComponentDesignSpec, framework: Framework): string {
    return `import type { Meta, StoryObj } from '@storybook/react';
import { ${spec.name} } from './${spec.name}';

const meta: Meta<typeof ${spec.name}> = {
  title: 'Components/${spec.category}/${spec.name}',
  component: ${spec.name},
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline', 'ghost', 'soft', 'link'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'accent', 'success', 'warning', 'error'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof ${spec.name}>;

export const Default: Story = {
  args: {
    children: '${spec.name}',
  },
};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <${spec.name} variant="solid">Solid</${spec.name}>
      <${spec.name} variant="outline">Outline</${spec.name}>
      <${spec.name} variant="ghost">Ghost</${spec.name}>
      <${spec.name} variant="soft">Soft</${spec.name}>
      <${spec.name} variant="link">Link</${spec.name}>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <${spec.name} size="xs">XSmall</${spec.name}>
      <${spec.name} size="sm">Small</${spec.name}>
      <${spec.name} size="md">Medium</${spec.name}>
      <${spec.name} size="lg">Large</${spec.name}>
      <${spec.name} size="xl">XLarge</${spec.name}>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <${spec.name} color="primary">Primary</${spec.name}>
      <${spec.name} color="secondary">Secondary</${spec.name}>
      <${spec.name} color="accent">Accent</${spec.name}>
      <${spec.name} color="success">Success</${spec.name}>
      <${spec.name} color="warning">Warning</${spec.name}>
      <${spec.name} color="error">Error</${spec.name}>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <${spec.name}>Default</${spec.name}>
      <${spec.name} disabled>Disabled</${spec.name}>
      <${spec.name} loading>Loading</${spec.name}>
    </div>
  ),
};
`;
  }

  /**
   * Track component usage
   */
  trackUsage(componentName: string, metadata: Partial<ComponentAnalytics>): void {
    const existing = this.analyticsStore.get(componentName) || {
      componentName,
      usageCount: 0,
      uniqueVariants: 0,
      averageRenderTime: 0,
      accessibilityScore: 100,
      interactionRate: 0,
      errorRate: 0,
    };

    this.analyticsStore.set(componentName, {
      ...existing,
      ...metadata,
      usageCount: existing.usageCount + 1,
    });
  }

  /**
   * Get usage analytics for a component
   */
  getAnalytics(componentName: string): ComponentAnalytics | undefined {
    return this.analyticsStore.get(componentName);
  }

  /**
   * Calculate accessibility score
   */
  calculateAccessibilityScore(spec: ComponentDesignSpec): number {
    let score = 100;
    const suggestions = this.analyzeAccessibility(spec);

    for (const suggestion of suggestions) {
      switch (suggestion.priority) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }

    return Math.max(0, score);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface VariationOptions {
  sizes?: boolean;
  colors?: boolean;
  styles?: boolean;
  shapes?: boolean;
}

export interface CodeGenerationOptions {
  framework: Framework;
  language: 'typescript' | 'javascript';
  styling: StylingApproach;
}

export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'angular';
export type StylingApproach = 'css' | 'tailwind' | 'css-in-js' | 'styled-components';

export interface GeneratedCode {
  component: string;
  styles: string;
  types: string;
  tests: string;
  storybook: string;
}

// ============================================================================
// EXPORT
// ============================================================================

export const designIntelligence = new DesignIntelligenceEngine();
