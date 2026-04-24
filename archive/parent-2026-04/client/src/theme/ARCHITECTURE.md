# RSES CMS Theme System Architecture

A Drupal-inspired theming architecture for React/TypeScript applications.

## Overview

The RSES CMS theme system provides a flexible, extensible theming infrastructure that allows:

- **Theme Inheritance**: Themes can extend other themes, inheriting and overriding tokens, components, and regions
- **Design Tokens**: A comprehensive token system that maps to CSS custom properties
- **Component Overrides**: Themes can override, wrap, or extend any component
- **Region System**: Drupal-like regions for flexible page layouts
- **Template Suggestions**: Context-aware component selection
- **Asset Management**: Per-theme CSS/JS loading with hot reload
- **Settings UI**: Admin interface for theme configuration

## Directory Structure

```
client/src/theme/
├── types/                    # TypeScript type definitions
│   ├── manifest.ts           # Theme manifest types
│   ├── design-tokens.ts      # Design token types
│   ├── regions.ts            # Region system types
│   ├── components.ts         # Component override types
│   ├── libraries.ts          # Asset/library types
│   └── index.ts              # Type exports
├── core/                     # Core utilities
│   ├── registry.ts           # Theme registry
│   ├── tokens.ts             # Token utilities
│   └── asset-loader.ts       # Asset loading
├── context/                  # React context
│   └── ThemeContext.tsx      # Theme provider & hooks
├── components/               # Theme components
│   ├── Region.tsx            # Region component
│   ├── Layout.tsx            # Layout components
│   ├── ThemedComponent.tsx   # Component override system
│   └── ThemeSettings.tsx     # Settings UI
├── themes/                   # Built-in themes
│   ├── base/                 # Base theme
│   │   └── manifest.ts
│   └── quantum-os/           # Quantum OS theme
│       └── manifest.ts
└── index.ts                  # Main exports
```

## Theme Manifest

Each theme is defined by a manifest (similar to Drupal's .info.yml):

```typescript
const myTheme: ThemeManifest = {
  name: 'my-theme',
  displayName: 'My Theme',
  description: 'A custom theme',
  version: '1.0.0',
  extends: 'base',  // Inherit from base theme

  features: {
    colorModes: true,
    responsive: true,
    // ...
  },

  tokens: {
    colors: { /* ... */ },
    spacing: { /* ... */ },
    typography: { /* ... */ },
    // ...
  },

  regions: {
    header: { /* ... */ },
    content: { /* ... */ },
    // ...
  },

  components: {
    Button: { /* overrides */ },
    // ...
  },

  libraries: {
    base: { /* CSS/JS assets */ },
  },

  settings: {
    groups: [/* settings UI */ ],
  },

  breakpoints: { /* responsive */ },
  colorSchemes: { /* light/dark */ },
};
```

## Design Tokens

Design tokens are the atomic design values that define the theme's visual language:

### Color Tokens

```typescript
tokens: {
  colors: {
    // Primitive colors (scales)
    primitives: {
      primary: {
        50: '#eff6ff',
        100: '#dbeafe',
        // ... 200-950
      },
      // neutral, secondary, accent, success, warning, error, info
    },

    // Semantic colors (what components use)
    semantic: {
      background: '{colors.primitives.neutral.50}',  // Token reference
      foreground: '{colors.primitives.neutral.950}',
      primary: '{colors.primitives.primary.600}',
      // ...
    },
  },
}
```

### Spacing Tokens

```typescript
spacing: {
  unit: '0.25rem',
  scale: {
    '0': '0',
    '1': '0.25rem',
    '2': '0.5rem',
    // ... up to 96
  },
  semantic: {
    pageMargin: '1.5rem',
    cardPadding: '1.5rem',
    // ...
  },
}
```

### Typography Tokens

```typescript
typography: {
  families: {
    sans: { family: 'Inter', fallbacks: ['system-ui'] },
    mono: { family: 'JetBrains Mono', fallbacks: ['monospace'] },
  },
  sizes: { xs: '0.75rem', /* ... */ '9xl': '8rem' },
  weights: { normal: 400, bold: 700, /* ... */ },
  styles: {
    h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.25 },
    // ...
  },
}
```

### Token References

Tokens can reference other tokens using `{path.to.token}` syntax:

```typescript
semantic: {
  primary: '{colors.primitives.primary.600}',  // Resolved at runtime
}
```

## Region System

Regions are named areas in the page layout:

### Standard Regions

- `header`, `header_top`, `header_bottom`
- `navigation`, `navigation_secondary`
- `sidebar_left`, `sidebar_right`
- `content`, `content_top`, `content_bottom`
- `footer`, `footer_top`, `footer_bottom`
- `breadcrumb`, `messages`, `help`

### Using Regions

```tsx
import { Layout, Region } from '@/theme';

function Page() {
  return (
    <Layout layout="sidebar-left">
      <Region name="header">
        <Header />
      </Region>
      <Region name="sidebar_left">
        <Sidebar />
      </Region>
      <Region name="content">
        <MainContent />
      </Region>
    </Layout>
  );
}
```

### Region Visibility

Regions can have visibility conditions:

```typescript
regions: {
  admin_sidebar: {
    name: 'admin_sidebar',
    label: 'Admin Sidebar',
    visibility: {
      roles: ['admin', 'editor'],
      excludeBreakpoints: ['xs', 'sm'],
    },
  },
}
```

## Component Overrides

Themes can override components in several ways:

### Style Overrides

```typescript
components: {
  Button: {
    name: 'Button',
    type: 'styles',
    styles: {
      base: {
        className: 'my-button-class',
        cssVars: { '--button-radius': '8px' },
      },
      variants: {
        variant: {
          primary: { className: 'bg-primary text-white' },
          ghost: { className: 'bg-transparent' },
        },
      },
    },
  },
}
```

### Props Injection

```typescript
components: {
  Input: {
    name: 'Input',
    type: 'props',
    props: {
      autoComplete: 'off',
      spellCheck: false,
    },
  },
}
```

### Component Replacement

```typescript
components: {
  Modal: {
    name: 'Modal',
    type: 'replace',
    component: './components/CustomModal',
  },
}
```

### Using withTheme HOC

```tsx
import { withTheme } from '@/theme';

const Button = withTheme(BaseButton, {
  name: 'Button',
  baseClassName: 'btn',
  defaultStyles: {
    variants: {
      size: {
        sm: { className: 'btn-sm' },
        lg: { className: 'btn-lg' },
      },
    },
  },
});
```

## Asset/Library System

Themes define libraries of CSS and JavaScript:

```typescript
libraries: {
  'my-theme-base': {
    id: 'my-theme-base',
    global: true,  // Load with theme
    css: [
      { path: './css/variables.css', weight: -100, layer: 'base' },
      { path: './css/components.css', weight: 0, layer: 'components' },
    ],
    js: [
      { path: './js/effects.js', module: true, defer: true },
    ],
  },
}
```

## Theme Settings

Themes can expose configurable settings:

```typescript
settings: {
  groups: [
    {
      id: 'colors',
      label: 'Colors',
      icon: 'Palette',
      settings: [
        {
          key: 'primaryColor',
          label: 'Primary Color',
          type: 'color',
          default: '#3b82f6',
          token: 'colors.primitives.primary.500',
        },
      ],
    },
  ],
  defaults: {
    primaryColor: '#3b82f6',
  },
}
```

## Color Schemes

Support for dark/light mode:

```typescript
colorSchemes: {
  schemes: [
    {
      id: 'light',
      name: 'Light',
      className: 'light',
      icon: 'Sun',
      mediaQuery: '(prefers-color-scheme: light)',
    },
    {
      id: 'dark',
      name: 'Dark',
      className: 'dark',
      icon: 'Moon',
      mediaQuery: '(prefers-color-scheme: dark)',
      tokens: {
        // Token overrides for dark mode
        colors: {
          semantic: {
            background: '{colors.primitives.neutral.950}',
            foreground: '{colors.primitives.neutral.50}',
          },
        },
      },
    },
  ],
  default: 'light',
  followSystem: true,
  userSelectable: true,
}
```

## Breakpoints

Responsive breakpoint definitions:

```typescript
breakpoints: {
  values: {
    xs: { minWidth: 0, label: 'Extra Small' },
    sm: { minWidth: 640, label: 'Small' },
    md: { minWidth: 768, label: 'Medium' },
    lg: { minWidth: 1024, label: 'Large' },
    xl: { minWidth: 1280, label: 'Extra Large' },
    '2xl': { minWidth: 1536, label: '2X Large' },
  },
  default: 'xs',
  containerQueries: true,
}
```

## Usage Examples

### Basic Setup

```tsx
import { ThemeProvider, useTheme } from '@/theme';

function App() {
  return (
    <ThemeProvider theme="base" defaultColorScheme="system">
      <YourApp />
    </ThemeProvider>
  );
}
```

### Using Theme Hooks

```tsx
import {
  useTheme,
  useColorScheme,
  useBreakpointValue,
  useDesignTokens
} from '@/theme';

function MyComponent() {
  const { theme, hasFeature } = useTheme();
  const { colorScheme, toggleColorScheme, isDark } = useColorScheme();
  const { breakpoint, isMobile, isDesktop } = useBreakpointValue();
  const { getToken, getVar } = useDesignTokens();

  const primaryColor = getToken('colors.semantic.primary');
  const primaryVar = getVar('colors.semantic.primary');  // var(--colors-semantic-primary)

  return (
    <div style={{ color: primaryVar }}>
      Current theme: {theme?.manifest.displayName}
      {hasFeature('colorModes') && (
        <button onClick={toggleColorScheme}>
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
      )}
    </div>
  );
}
```

### Creating a Custom Theme

```typescript
// themes/my-theme/manifest.ts
import type { ThemeManifest } from '@/theme/types';

export const myThemeManifest: ThemeManifest = {
  name: 'my-theme',
  displayName: 'My Custom Theme',
  description: 'A beautiful custom theme',
  version: '1.0.0',
  extends: 'base',  // Extend the base theme
  coreVersion: '1.x',

  // Override specific tokens
  tokens: {
    colors: {
      primitives: {
        primary: {
          // Custom primary color scale
          500: '#10b981',
          // ... other shades
        },
      },
    },
  },

  // Rest of manifest...
};

// Register the theme
import { getDefaultRegistry } from '@/theme';
getDefaultRegistry().register(myThemeManifest);
```

## Tailwind CSS Integration

The token system integrates with Tailwind CSS:

```typescript
import { tokensToTailwindConfig } from '@/theme';

// In tailwind.config.js
const tokens = require('./theme-tokens.json');

module.exports = {
  theme: {
    extend: tokensToTailwindConfig(tokens),
  },
};
```

## Hot Reload

During development, theme changes are hot-reloaded:

```typescript
// Theme manifest
hooks: {
  onActivate: () => console.log('Theme activated'),
  onSettingsChange: (settings) => console.log('Settings changed', settings),
  onColorSchemeChange: (scheme) => console.log('Color scheme:', scheme),
}
```

## Best Practices

1. **Always extend `base`**: Start from the base theme to inherit defaults
2. **Use semantic tokens**: Reference semantic colors, not primitives
3. **Design mobile-first**: Use breakpoints progressively
4. **Keep themes focused**: One theme per visual style
5. **Test color schemes**: Verify both light and dark modes
6. **Document settings**: Provide clear labels and descriptions
7. **Use CSS layers**: Organize styles with @layer for predictable cascading

## Migration from Existing Styles

To migrate from existing CSS:

1. Map existing colors to design tokens
2. Convert hardcoded values to token references
3. Move component styles to theme overrides
4. Update layouts to use the region system
5. Test with different themes

## API Reference

See the TypeScript types in `/theme/types/` for complete API documentation.
