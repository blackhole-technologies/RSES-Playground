/**
 * Quantum OS Theme Manifest
 *
 * A futuristic, glassmorphism-based dark theme inspired by sci-fi interfaces.
 * Features glowing accents, transparent surfaces, and smooth animations.
 */

import type { ThemeManifest } from '../../types';

export const quantumOsThemeManifest: ThemeManifest = {
  name: 'quantum-os',
  displayName: 'Quantum OS',
  description: 'A futuristic dark theme with glassmorphism effects, glowing accents, and sci-fi inspired aesthetics.',
  version: '1.0.0',
  author: {
    name: 'RSES CMS',
    url: 'https://rses-cms.io',
  },
  screenshot: '/themes/quantum-os/screenshot.png',
  extends: 'base',
  coreVersion: '1.x',

  features: {
    colorModes: false, // Dark only
    responsive: true,
    rtl: true,
    highContrast: true,
    reducedMotion: true,
    customFonts: true,
    settingsUI: true,
    hotReload: true,
    custom: {
      glassmorphism: true,
      glowEffects: true,
      particleBackground: true,
    },
  },

  regions: {
    // Inherit from base, add quantum-specific regions
    quantum_toolbar: {
      name: 'quantum_toolbar',
      label: 'Quantum Toolbar',
      description: 'Floating toolbar for quick actions',
      className: 'quantum-toolbar',
      weight: -50,
    },
    quantum_hud: {
      name: 'quantum_hud',
      label: 'HUD Overlay',
      description: 'Heads-up display overlay',
      weight: 250,
    },
  },

  tokens: {
    colors: {
      primitives: {
        // Quantum color palette - deep space inspired
        neutral: {
          50: 'hsl(220, 20%, 98%)',
          100: 'hsl(220, 18%, 90%)',
          200: 'hsl(220, 16%, 75%)',
          300: 'hsl(220, 14%, 60%)',
          400: 'hsl(220, 12%, 45%)',
          500: 'hsl(220, 10%, 35%)',
          600: 'hsl(220, 12%, 25%)',
          700: 'hsl(220, 14%, 18%)',
          800: 'hsl(220, 16%, 12%)',
          900: 'hsl(220, 18%, 8%)',
          950: 'hsl(220, 20%, 4%)',
        },
        primary: {
          // Quantum blue - electric
          50: 'hsl(200, 100%, 97%)',
          100: 'hsl(200, 100%, 90%)',
          200: 'hsl(200, 100%, 80%)',
          300: 'hsl(200, 100%, 70%)',
          400: 'hsl(200, 100%, 60%)',
          500: 'hsl(200, 100%, 50%)',
          600: 'hsl(200, 100%, 45%)',
          700: 'hsl(200, 100%, 40%)',
          800: 'hsl(200, 100%, 35%)',
          900: 'hsl(200, 100%, 25%)',
          950: 'hsl(200, 100%, 15%)',
        },
        secondary: {
          // Deep purple
          50: 'hsl(265, 100%, 97%)',
          100: 'hsl(265, 100%, 90%)',
          200: 'hsl(265, 100%, 80%)',
          300: 'hsl(265, 100%, 70%)',
          400: 'hsl(265, 100%, 60%)',
          500: 'hsl(265, 100%, 50%)',
          600: 'hsl(265, 100%, 45%)',
          700: 'hsl(265, 100%, 40%)',
          800: 'hsl(265, 100%, 30%)',
          900: 'hsl(265, 100%, 20%)',
          950: 'hsl(265, 100%, 10%)',
        },
        accent: {
          // Quantum pink/magenta
          50: 'hsl(320, 100%, 97%)',
          100: 'hsl(320, 100%, 90%)',
          200: 'hsl(320, 100%, 80%)',
          300: 'hsl(320, 100%, 70%)',
          400: 'hsl(320, 100%, 60%)',
          500: 'hsl(320, 100%, 50%)',
          600: 'hsl(320, 100%, 45%)',
          700: 'hsl(320, 100%, 40%)',
          800: 'hsl(320, 100%, 30%)',
          900: 'hsl(320, 100%, 20%)',
          950: 'hsl(320, 100%, 10%)',
        },
        success: {
          // Matrix green
          50: 'hsl(150, 100%, 97%)',
          100: 'hsl(150, 100%, 85%)',
          200: 'hsl(150, 100%, 70%)',
          300: 'hsl(150, 100%, 55%)',
          400: 'hsl(150, 100%, 45%)',
          500: 'hsl(150, 100%, 40%)',
          600: 'hsl(150, 100%, 35%)',
          700: 'hsl(150, 100%, 30%)',
          800: 'hsl(150, 100%, 25%)',
          900: 'hsl(150, 100%, 18%)',
          950: 'hsl(150, 100%, 10%)',
        },
        warning: {
          // Amber glow
          50: 'hsl(45, 100%, 96%)',
          100: 'hsl(45, 100%, 85%)',
          200: 'hsl(45, 100%, 70%)',
          300: 'hsl(45, 100%, 55%)',
          400: 'hsl(45, 100%, 50%)',
          500: 'hsl(45, 100%, 45%)',
          600: 'hsl(45, 100%, 40%)',
          700: 'hsl(45, 100%, 35%)',
          800: 'hsl(45, 100%, 28%)',
          900: 'hsl(45, 100%, 20%)',
          950: 'hsl(45, 100%, 10%)',
        },
        error: {
          // Alert red
          50: 'hsl(0, 100%, 97%)',
          100: 'hsl(0, 100%, 90%)',
          200: 'hsl(0, 100%, 80%)',
          300: 'hsl(0, 100%, 70%)',
          400: 'hsl(0, 100%, 60%)',
          500: 'hsl(0, 100%, 50%)',
          600: 'hsl(0, 100%, 45%)',
          700: 'hsl(0, 100%, 40%)',
          800: 'hsl(0, 100%, 35%)',
          900: 'hsl(0, 100%, 25%)',
          950: 'hsl(0, 100%, 15%)',
        },
        info: {
          // Cyan info
          50: 'hsl(185, 100%, 97%)',
          100: 'hsl(185, 100%, 90%)',
          200: 'hsl(185, 100%, 80%)',
          300: 'hsl(185, 100%, 65%)',
          400: 'hsl(185, 100%, 50%)',
          500: 'hsl(185, 100%, 45%)',
          600: 'hsl(185, 100%, 40%)',
          700: 'hsl(185, 100%, 35%)',
          800: 'hsl(185, 100%, 28%)',
          900: 'hsl(185, 100%, 20%)',
          950: 'hsl(185, 100%, 10%)',
        },
        custom: {
          // Quantum-specific colors
          quantum: {
            50: 'hsl(230, 100%, 97%)',
            100: 'hsl(230, 100%, 90%)',
            200: 'hsl(230, 100%, 80%)',
            300: 'hsl(230, 100%, 70%)',
            400: 'hsl(230, 100%, 60%)',
            500: 'hsl(230, 100%, 50%)',
            600: 'hsl(230, 100%, 45%)',
            700: 'hsl(230, 100%, 40%)',
            800: 'hsl(230, 100%, 30%)',
            900: 'hsl(230, 100%, 20%)',
            950: 'hsl(230, 100%, 10%)',
          },
        },
      },
      semantic: {
        background: 'hsl(220, 20%, 6%)',
        foreground: 'hsl(220, 20%, 95%)',
        card: 'hsla(220, 20%, 12%, 0.8)', // Glassmorphism
        cardForeground: 'hsl(220, 20%, 95%)',
        popover: 'hsla(220, 20%, 10%, 0.9)',
        popoverForeground: 'hsl(220, 20%, 95%)',
        primary: 'hsl(200, 100%, 50%)',
        primaryForeground: 'hsl(220, 20%, 4%)',
        secondary: 'hsl(265, 80%, 55%)',
        secondaryForeground: 'hsl(220, 20%, 95%)',
        muted: 'hsla(220, 20%, 20%, 0.6)',
        mutedForeground: 'hsl(220, 15%, 55%)',
        accent: 'hsl(320, 100%, 55%)',
        accentForeground: 'hsl(220, 20%, 95%)',
        destructive: 'hsl(0, 100%, 55%)',
        destructiveForeground: 'hsl(220, 20%, 95%)',
        success: 'hsl(150, 100%, 45%)',
        successForeground: 'hsl(220, 20%, 4%)',
        warning: 'hsl(45, 100%, 50%)',
        warningForeground: 'hsl(220, 20%, 4%)',
        info: 'hsl(185, 100%, 50%)',
        infoForeground: 'hsl(220, 20%, 4%)',
        border: 'hsla(200, 100%, 50%, 0.2)',
        borderSubtle: 'hsla(220, 20%, 50%, 0.1)',
        input: 'hsla(220, 20%, 15%, 0.6)',
        inputForeground: 'hsl(220, 20%, 95%)',
        ring: 'hsl(200, 100%, 50%)',
        selection: 'hsla(200, 100%, 50%, 0.3)',
        selectionForeground: 'hsl(220, 20%, 95%)',
        link: 'hsl(200, 100%, 60%)',
        linkHover: 'hsl(200, 100%, 70%)',
        linkVisited: 'hsl(265, 80%, 60%)',
        codeBackground: 'hsla(220, 20%, 10%, 0.8)',
        codeForeground: 'hsl(150, 100%, 60%)',
        custom: {
          glow: 'hsl(200, 100%, 50%)',
          glowSecondary: 'hsl(320, 100%, 50%)',
          glass: 'hsla(220, 20%, 20%, 0.4)',
          glassBorder: 'hsla(200, 100%, 50%, 0.15)',
          gradientStart: 'hsl(200, 100%, 50%)',
          gradientEnd: 'hsl(320, 100%, 50%)',
          particle: 'hsla(200, 100%, 60%, 0.5)',
        },
      },
    },

    spacing: {
      unit: '0.25rem',
      scale: {
        '0': '0',
        'px': '1px',
        '0.5': '0.125rem',
        '1': '0.25rem',
        '1.5': '0.375rem',
        '2': '0.5rem',
        '2.5': '0.625rem',
        '3': '0.75rem',
        '3.5': '0.875rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '7': '1.75rem',
        '8': '2rem',
        '9': '2.25rem',
        '10': '2.5rem',
        '11': '2.75rem',
        '12': '3rem',
        '14': '3.5rem',
        '16': '4rem',
        '20': '5rem',
        '24': '6rem',
        '28': '7rem',
        '32': '8rem',
        '36': '9rem',
        '40': '10rem',
        '44': '11rem',
        '48': '12rem',
        '52': '13rem',
        '56': '14rem',
        '60': '15rem',
        '64': '16rem',
        '72': '18rem',
        '80': '20rem',
        '96': '24rem',
      },
      semantic: {
        pageMargin: '2rem',
        sectionGap: '4rem',
        contentMaxWidth: '90rem',
        cardPadding: '1.5rem',
        inputPaddingX: '1rem',
        inputPaddingY: '0.75rem',
        buttonPaddingX: '1.25rem',
        buttonPaddingY: '0.625rem',
        stackGap: '1.25rem',
        inlineGap: '0.75rem',
        gridGap: '2rem',
      },
    },

    typography: {
      families: {
        sans: {
          family: 'Inter',
          fallbacks: ['system-ui', '-apple-system', 'sans-serif'],
        },
        serif: {
          family: 'Georgia',
          fallbacks: ['serif'],
        },
        mono: {
          family: 'JetBrains Mono',
          fallbacks: ['Menlo', 'Monaco', 'monospace'],
        },
        display: {
          family: 'Space Grotesk',
          fallbacks: ['Inter', 'system-ui', 'sans-serif'],
        },
      },
      sizes: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
        '7xl': '4.5rem',
        '8xl': '6rem',
        '9xl': '8rem',
      },
      weights: {
        thin: 100,
        extralight: 200,
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900,
      },
      lineHeights: {
        none: 1,
        tight: 1.2,
        snug: 1.35,
        normal: 1.5,
        relaxed: 1.625,
        loose: 2,
      },
      letterSpacing: {
        tighter: '-0.05em',
        tight: '-0.025em',
        normal: '0em',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.15em', // Wider for quantum feel
      },
      styles: {
        h1: {
          fontSize: '2.5rem',
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: '-0.03em',
          fontFamily: 'var(--font-display)',
        },
        h2: {
          fontSize: '2rem',
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: '-0.02em',
          fontFamily: 'var(--font-display)',
        },
        h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3 },
        h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
        h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
        h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
        body: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.6 },
        bodySmall: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 },
        bodyLarge: { fontSize: '1.125rem', fontWeight: 400, lineHeight: 1.7 },
        caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.4 },
        overline: {
          fontSize: '0.75rem',
          fontWeight: 600,
          lineHeight: 1.4,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        },
        label: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.02em' },
        button: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.25, letterSpacing: '0.03em' },
        code: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5, fontFamily: 'var(--font-mono)' },
      },
    },

    shadows: {
      scale: {
        none: 'none',
        sm: '0 2px 8px -2px hsla(200, 100%, 50%, 0.15)',
        base: '0 4px 12px -4px hsla(200, 100%, 50%, 0.2)',
        md: '0 8px 20px -6px hsla(200, 100%, 50%, 0.25)',
        lg: '0 12px 32px -8px hsla(200, 100%, 50%, 0.3)',
        xl: '0 20px 40px -12px hsla(200, 100%, 50%, 0.35)',
        '2xl': '0 32px 64px -16px hsla(200, 100%, 50%, 0.4)',
        inner: 'inset 0 2px 8px 0 hsla(220, 20%, 0%, 0.4)',
      },
      semantic: {
        card: '0 8px 32px -8px hsla(200, 100%, 50%, 0.15), 0 0 0 1px hsla(200, 100%, 50%, 0.1)',
        dropdown: '0 12px 40px -8px hsla(200, 100%, 50%, 0.25), 0 0 0 1px hsla(200, 100%, 50%, 0.15)',
        modal: '0 24px 64px -16px hsla(200, 100%, 50%, 0.4), 0 0 0 1px hsla(200, 100%, 50%, 0.2)',
        toast: '0 12px 40px -8px hsla(200, 100%, 50%, 0.3), 0 0 0 1px hsla(200, 100%, 50%, 0.15)',
        buttonHover: '0 0 20px -4px hsla(200, 100%, 50%, 0.5)',
        focusRing: '0 0 0 2px hsla(200, 100%, 50%, 0.5), 0 0 20px -4px hsla(200, 100%, 50%, 0.3)',
        custom: {
          glow: '0 0 30px -5px hsla(200, 100%, 50%, 0.6)',
          glowIntense: '0 0 50px -5px hsla(200, 100%, 50%, 0.8)',
          glowAccent: '0 0 30px -5px hsla(320, 100%, 50%, 0.6)',
          neon: '0 0 5px hsla(200, 100%, 50%, 0.5), 0 0 20px hsla(200, 100%, 50%, 0.3), 0 0 40px hsla(200, 100%, 50%, 0.1)',
        },
      },
    },

    borders: {
      radius: {
        none: '0',
        sm: '0.25rem',
        base: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px',
      },
      width: {
        none: '0',
        hairline: '0.5px',
        thin: '1px',
        base: '1px',
        thick: '2px',
      },
      semantic: {
        button: '0.75rem',
        input: '0.75rem',
        card: '1rem',
        modal: '1.25rem',
        badge: '9999px',
        avatar: '9999px',
      },
    },

    motion: {
      duration: {
        instant: '0ms',
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
        slower: '600ms',
        slowest: '1200ms',
      },
      easing: {
        linear: 'linear',
        ease: 'ease',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeOutBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        easeInBack: 'cubic-bezier(0.36, 0, 0.66, -0.56)',
        bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      reducedMotion: {
        duration: '0ms',
        easing: 'linear',
      },
    },

    zIndex: {
      scale: {
        hide: -1,
        base: 0,
        dropdown: 1000,
        sticky: 1100,
        fixed: 1200,
        overlay: 1300,
        modal: 1400,
        popover: 1500,
        toast: 1600,
        tooltip: 1700,
        maximum: 9999,
      },
    },

    opacity: {
      scale: {
        '0': 0,
        '5': 0.05,
        '10': 0.1,
        '20': 0.2,
        '25': 0.25,
        '30': 0.3,
        '40': 0.4,
        '50': 0.5,
        '60': 0.6,
        '70': 0.7,
        '75': 0.75,
        '80': 0.8,
        '90': 0.9,
        '95': 0.95,
        '100': 1,
      },
      semantic: {
        disabled: 0.4,
        placeholder: 0.5,
        overlay: 0.6,
        glass: 0.85,
      },
    },

    custom: {
      // Quantum-specific tokens
      blur: {
        none: '0',
        sm: '4px',
        base: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
        glass: '20px',
      },
      gradients: {
        primary: 'linear-gradient(135deg, hsl(200, 100%, 50%) 0%, hsl(265, 80%, 55%) 100%)',
        accent: 'linear-gradient(135deg, hsl(320, 100%, 50%) 0%, hsl(265, 80%, 55%) 100%)',
        surface: 'linear-gradient(180deg, hsla(220, 20%, 15%, 0.8) 0%, hsla(220, 20%, 10%, 0.9) 100%)',
        glow: 'radial-gradient(circle, hsla(200, 100%, 50%, 0.3) 0%, transparent 70%)',
      },
      effects: {
        glassmorphism: 'backdrop-filter: blur(20px); background: hsla(220, 20%, 12%, 0.8); border: 1px solid hsla(200, 100%, 50%, 0.15);',
        neonGlow: 'text-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 40px currentColor;',
        scanline: 'background: repeating-linear-gradient(0deg, transparent, transparent 2px, hsla(200, 100%, 50%, 0.03) 2px, hsla(200, 100%, 50%, 0.03) 4px);',
      },
    },
  },

  components: {
    Button: {
      name: 'Button',
      type: 'styles',
      styles: {
        base: {
          className: 'quantum-button',
          cssVars: {
            '--button-glow': 'var(--color-glow)',
          },
        },
        variants: {
          variant: {
            default: {
              className: 'quantum-button-default bg-gradient-to-r from-primary to-secondary',
            },
            ghost: {
              className: 'quantum-button-ghost backdrop-blur-md bg-glass/50',
            },
            outline: {
              className: 'quantum-button-outline border-primary/30 hover:border-primary/60',
            },
          },
        },
      },
    },
    Card: {
      name: 'Card',
      type: 'styles',
      styles: {
        base: {
          className: 'quantum-card backdrop-blur-lg bg-card border border-glassBorder',
        },
      },
    },
    Input: {
      name: 'Input',
      type: 'styles',
      styles: {
        base: {
          className: 'quantum-input backdrop-blur-md bg-input border border-primary/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/20',
        },
      },
    },
  },

  libraries: {
    'quantum-base': {
      id: 'quantum-base',
      description: 'Quantum OS base styles',
      global: true,
      dependencies: [{ type: 'theme', name: 'base' }],
      css: [
        { path: './css/variables.css', weight: 0, layer: 'theme' },
        { path: './css/glassmorphism.css', weight: 10, layer: 'theme' },
        { path: './css/animations.css', weight: 20, layer: 'theme' },
        { path: './css/utilities.css', weight: 30, layer: 'utilities' },
      ],
    },
    'quantum-effects': {
      id: 'quantum-effects',
      description: 'Advanced visual effects',
      global: false,
      js: [
        { path: './js/particles.js', module: true, defer: true },
        { path: './js/glow-effects.js', module: true, defer: true },
      ],
      css: [
        { path: './css/effects.css', weight: 40 },
      ],
    },
  },

  settings: {
    groups: [
      {
        id: 'effects',
        label: 'Visual Effects',
        icon: 'Sparkles',
        settings: [
          {
            key: 'enableGlassmorphism',
            label: 'Glassmorphism',
            description: 'Enable frosted glass effect on cards and panels',
            type: 'boolean',
            default: true,
          },
          {
            key: 'enableGlowEffects',
            label: 'Glow Effects',
            description: 'Enable neon glow on interactive elements',
            type: 'boolean',
            default: true,
          },
          {
            key: 'enableParticles',
            label: 'Particle Background',
            description: 'Show animated particles in background',
            type: 'boolean',
            default: false,
          },
          {
            key: 'blurIntensity',
            label: 'Blur Intensity',
            description: 'Intensity of glass blur effect',
            type: 'number',
            default: 20,
            options: { min: 0, max: 40, step: 4, unit: 'px' },
          },
          {
            key: 'glowIntensity',
            label: 'Glow Intensity',
            type: 'number',
            default: 100,
            options: { min: 0, max: 200, step: 10, unit: '%' },
          },
        ],
      },
      {
        id: 'colors',
        label: 'Colors',
        icon: 'Palette',
        settings: [
          {
            key: 'primaryHue',
            label: 'Primary Hue',
            description: 'Main accent color hue (0-360)',
            type: 'number',
            default: 200,
            options: { min: 0, max: 360, step: 5 },
          },
          {
            key: 'accentHue',
            label: 'Accent Hue',
            description: 'Secondary accent color hue (0-360)',
            type: 'number',
            default: 320,
            options: { min: 0, max: 360, step: 5 },
          },
        ],
      },
      {
        id: 'animation',
        label: 'Animation',
        icon: 'Zap',
        settings: [
          {
            key: 'animationSpeed',
            label: 'Animation Speed',
            type: 'select',
            default: 'normal',
            options: {
              choices: [
                { value: 'slow', label: 'Slow' },
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Fast' },
                { value: 'none', label: 'No Animation' },
              ],
            },
          },
          {
            key: 'enableScanlines',
            label: 'Scanline Effect',
            description: 'Show subtle CRT-style scanlines',
            type: 'boolean',
            default: false,
          },
        ],
      },
    ],
    defaults: {
      enableGlassmorphism: true,
      enableGlowEffects: true,
      enableParticles: false,
      blurIntensity: 20,
      glowIntensity: 100,
      primaryHue: 200,
      accentHue: 320,
      animationSpeed: 'normal',
      enableScanlines: false,
    },
  },

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
  },

  colorSchemes: {
    schemes: [
      {
        id: 'dark',
        name: 'Quantum Dark',
        className: 'quantum-dark',
        icon: 'Moon',
      },
    ],
    default: 'dark',
    followSystem: false, // Always dark
    userSelectable: false,
  },

  templateSuggestions: {
    components: {
      Button: [
        {
          id: 'button--glow',
          condition: { type: 'custom', match: { hasGlow: true } },
          template: 'quantum-os/components/ButtonGlow',
          priority: 10,
        },
      ],
    },
  },
};
