/**
 * RSES CMS Design Token System
 *
 * Design tokens are the visual design atoms of the design system.
 * They are named entities that store visual design attributes.
 * These map directly to CSS custom properties.
 */

// ============================================================================
// COLOR TOKENS
// ============================================================================

/**
 * HSL color value (allows for easy manipulation)
 */
export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a?: number; // 0-1 (optional alpha)
}

/**
 * Color token that can be HSL, hex, or reference
 */
export type ColorValue =
  | HSLColor
  | `#${string}` // Hex
  | `hsl(${string})` // HSL string
  | `hsla(${string})` // HSLA string
  | `rgb(${string})` // RGB string
  | `rgba(${string})` // RGBA string
  | `var(--${string})` // CSS variable reference
  | `{${string}}`; // Token reference (e.g., "{colors.primary}")

/**
 * Semantic color scale (50-950 like Tailwind)
 */
export interface ColorScale {
  50: ColorValue;
  100: ColorValue;
  200: ColorValue;
  300: ColorValue;
  400: ColorValue;
  500: ColorValue;
  600: ColorValue;
  700: ColorValue;
  800: ColorValue;
  900: ColorValue;
  950: ColorValue;
}

/**
 * Core color palette
 */
export interface ColorTokens {
  /** Base/primitive colors (used to build semantic colors) */
  primitives: {
    /** Neutral scale (grays) */
    neutral: ColorScale;
    /** Primary brand scale */
    primary: ColorScale;
    /** Secondary brand scale */
    secondary: ColorScale;
    /** Accent scale */
    accent: ColorScale;
    /** Success scale */
    success: ColorScale;
    /** Warning scale */
    warning: ColorScale;
    /** Error/Danger scale */
    error: ColorScale;
    /** Info scale */
    info: ColorScale;
    /** Custom color scales */
    custom?: Record<string, ColorScale>;
  };

  /** Semantic/Alias colors (what components use) */
  semantic: {
    /** Main background */
    background: ColorValue;
    /** Primary text color */
    foreground: ColorValue;

    /** Card/Panel backgrounds */
    card: ColorValue;
    cardForeground: ColorValue;

    /** Popover/Dropdown backgrounds */
    popover: ColorValue;
    popoverForeground: ColorValue;

    /** Primary action color */
    primary: ColorValue;
    primaryForeground: ColorValue;

    /** Secondary action color */
    secondary: ColorValue;
    secondaryForeground: ColorValue;

    /** Muted/Subdued color */
    muted: ColorValue;
    mutedForeground: ColorValue;

    /** Accent color for highlights */
    accent: ColorValue;
    accentForeground: ColorValue;

    /** Destructive/Danger actions */
    destructive: ColorValue;
    destructiveForeground: ColorValue;

    /** Success states */
    success: ColorValue;
    successForeground: ColorValue;

    /** Warning states */
    warning: ColorValue;
    warningForeground: ColorValue;

    /** Info states */
    info: ColorValue;
    infoForeground: ColorValue;

    /** Border color */
    border: ColorValue;
    /** Subtle border */
    borderSubtle: ColorValue;

    /** Input backgrounds */
    input: ColorValue;
    inputForeground: ColorValue;

    /** Focus ring color */
    ring: ColorValue;

    /** Selection highlight */
    selection: ColorValue;
    selectionForeground: ColorValue;

    /** Link colors */
    link: ColorValue;
    linkHover: ColorValue;
    linkVisited: ColorValue;

    /** Code/syntax highlighting */
    codeBackground: ColorValue;
    codeForeground: ColorValue;

    /** Custom semantic colors */
    custom?: Record<string, ColorValue>;
  };

  /** Component-specific color tokens */
  components?: Record<string, Record<string, ColorValue>>;
}

// ============================================================================
// SPACING TOKENS
// ============================================================================

export type SpacingValue = string | number;

export interface SpacingTokens {
  /** Base spacing unit (default: 4px or 0.25rem) */
  unit: SpacingValue;

  /** Named spacing scale */
  scale: {
    '0': SpacingValue;
    px: SpacingValue;
    '0.5': SpacingValue;
    '1': SpacingValue;
    '1.5': SpacingValue;
    '2': SpacingValue;
    '2.5': SpacingValue;
    '3': SpacingValue;
    '3.5': SpacingValue;
    '4': SpacingValue;
    '5': SpacingValue;
    '6': SpacingValue;
    '7': SpacingValue;
    '8': SpacingValue;
    '9': SpacingValue;
    '10': SpacingValue;
    '11': SpacingValue;
    '12': SpacingValue;
    '14': SpacingValue;
    '16': SpacingValue;
    '20': SpacingValue;
    '24': SpacingValue;
    '28': SpacingValue;
    '32': SpacingValue;
    '36': SpacingValue;
    '40': SpacingValue;
    '44': SpacingValue;
    '48': SpacingValue;
    '52': SpacingValue;
    '56': SpacingValue;
    '60': SpacingValue;
    '64': SpacingValue;
    '72': SpacingValue;
    '80': SpacingValue;
    '96': SpacingValue;
  };

  /** Semantic spacing */
  semantic: {
    /** Page margins */
    pageMargin: SpacingValue;
    /** Section spacing */
    sectionGap: SpacingValue;
    /** Content max width */
    contentMaxWidth: SpacingValue;
    /** Card padding */
    cardPadding: SpacingValue;
    /** Input padding */
    inputPaddingX: SpacingValue;
    inputPaddingY: SpacingValue;
    /** Button padding */
    buttonPaddingX: SpacingValue;
    buttonPaddingY: SpacingValue;
    /** Stack gap (vertical) */
    stackGap: SpacingValue;
    /** Inline gap (horizontal) */
    inlineGap: SpacingValue;
    /** Grid gap */
    gridGap: SpacingValue;
    /** Custom spacing */
    custom?: Record<string, SpacingValue>;
  };
}

// ============================================================================
// TYPOGRAPHY TOKENS
// ============================================================================

export type FontWeightValue = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 'normal' | 'bold';
export type FontSizeValue = `${number}px` | `${number}rem` | `${number}em` | `var(--${string})`;
export type LineHeightValue = number | `${number}px` | `${number}%` | 'normal' | 'none' | `var(--${string})`;
export type LetterSpacingValue = `${number}px` | `${number}em` | 'normal' | `var(--${string})`;

export interface FontStack {
  /** Primary font family */
  family: string;
  /** Fallback fonts */
  fallbacks: string[];
  /** CSS font-family value (computed) */
  value?: string;
}

export interface TextStyle {
  fontFamily?: string;
  fontSize: FontSizeValue;
  fontWeight: FontWeightValue;
  lineHeight: LineHeightValue;
  letterSpacing?: LetterSpacingValue;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: 'none' | 'underline' | 'line-through';
}

export interface TypographyTokens {
  /** Font families */
  families: {
    /** Primary sans-serif font */
    sans: FontStack;
    /** Serif font */
    serif: FontStack;
    /** Monospace font */
    mono: FontStack;
    /** Display/heading font */
    display?: FontStack;
    /** Custom font stacks */
    custom?: Record<string, FontStack>;
  };

  /** Font sizes */
  sizes: {
    xs: FontSizeValue;
    sm: FontSizeValue;
    base: FontSizeValue;
    lg: FontSizeValue;
    xl: FontSizeValue;
    '2xl': FontSizeValue;
    '3xl': FontSizeValue;
    '4xl': FontSizeValue;
    '5xl': FontSizeValue;
    '6xl': FontSizeValue;
    '7xl': FontSizeValue;
    '8xl': FontSizeValue;
    '9xl': FontSizeValue;
  };

  /** Font weights */
  weights: {
    thin: FontWeightValue;
    extralight: FontWeightValue;
    light: FontWeightValue;
    normal: FontWeightValue;
    medium: FontWeightValue;
    semibold: FontWeightValue;
    bold: FontWeightValue;
    extrabold: FontWeightValue;
    black: FontWeightValue;
  };

  /** Line heights */
  lineHeights: {
    none: LineHeightValue;
    tight: LineHeightValue;
    snug: LineHeightValue;
    normal: LineHeightValue;
    relaxed: LineHeightValue;
    loose: LineHeightValue;
  };

  /** Letter spacing */
  letterSpacing: {
    tighter: LetterSpacingValue;
    tight: LetterSpacingValue;
    normal: LetterSpacingValue;
    wide: LetterSpacingValue;
    wider: LetterSpacingValue;
    widest: LetterSpacingValue;
  };

  /** Pre-defined text styles */
  styles: {
    h1: TextStyle;
    h2: TextStyle;
    h3: TextStyle;
    h4: TextStyle;
    h5: TextStyle;
    h6: TextStyle;
    body: TextStyle;
    bodySmall: TextStyle;
    bodyLarge: TextStyle;
    caption: TextStyle;
    overline: TextStyle;
    label: TextStyle;
    button: TextStyle;
    code: TextStyle;
    custom?: Record<string, TextStyle>;
  };
}

// ============================================================================
// SHADOW TOKENS
// ============================================================================

export type ShadowValue = string | 'none' | `var(--${string})`;

export interface ShadowTokens {
  /** Named shadows */
  scale: {
    none: ShadowValue;
    sm: ShadowValue;
    base: ShadowValue;
    md: ShadowValue;
    lg: ShadowValue;
    xl: ShadowValue;
    '2xl': ShadowValue;
    inner: ShadowValue;
  };

  /** Semantic shadows */
  semantic: {
    /** Card shadow */
    card: ShadowValue;
    /** Dropdown/popover shadow */
    dropdown: ShadowValue;
    /** Modal shadow */
    modal: ShadowValue;
    /** Toast/notification shadow */
    toast: ShadowValue;
    /** Button hover shadow */
    buttonHover: ShadowValue;
    /** Focus ring shadow */
    focusRing: ShadowValue;
    /** Custom shadows */
    custom?: Record<string, ShadowValue>;
  };
}

// ============================================================================
// BORDER TOKENS
// ============================================================================

export type BorderRadiusValue = string;
export type BorderWidthValue = string | number;

export interface BorderTokens {
  /** Border radius scale */
  radius: {
    none: BorderRadiusValue;
    sm: BorderRadiusValue;
    base: BorderRadiusValue;
    md: BorderRadiusValue;
    lg: BorderRadiusValue;
    xl: BorderRadiusValue;
    '2xl': BorderRadiusValue;
    '3xl': BorderRadiusValue;
    full: BorderRadiusValue;
  };

  /** Border width scale */
  width: {
    none: BorderWidthValue;
    hairline: BorderWidthValue;
    thin: BorderWidthValue;
    base: BorderWidthValue;
    thick: BorderWidthValue;
  };

  /** Semantic border radius */
  semantic: {
    button: BorderRadiusValue;
    input: BorderRadiusValue;
    card: BorderRadiusValue;
    modal: BorderRadiusValue;
    badge: BorderRadiusValue;
    avatar: BorderRadiusValue;
    custom?: Record<string, BorderRadiusValue>;
  };
}

// ============================================================================
// MOTION/ANIMATION TOKENS
// ============================================================================

export type DurationValue = `${number}ms` | `${number}s` | `var(--${string})`;
export type EasingValue = string | `var(--${string})`;

export interface MotionTokens {
  /** Duration scale */
  duration: {
    instant: DurationValue;
    fast: DurationValue;
    normal: DurationValue;
    slow: DurationValue;
    slower: DurationValue;
    slowest: DurationValue;
  };

  /** Easing functions */
  easing: {
    linear: EasingValue;
    ease: EasingValue;
    easeIn: EasingValue;
    easeOut: EasingValue;
    easeInOut: EasingValue;
    /** For entrances */
    easeOutBack: EasingValue;
    /** For exits */
    easeInBack: EasingValue;
    /** Bouncy */
    bounce: EasingValue;
    /** Spring-like */
    spring: EasingValue;
  };

  /** Reduced motion alternatives */
  reducedMotion: {
    /** Duration for reduced motion */
    duration: DurationValue;
    /** Easing for reduced motion */
    easing: EasingValue;
  };
}

// ============================================================================
// Z-INDEX TOKENS
// ============================================================================

export interface ZIndexTokens {
  /** Z-index scale */
  scale: {
    hide: number;
    base: number;
    dropdown: number;
    sticky: number;
    fixed: number;
    overlay: number;
    modal: number;
    popover: number;
    toast: number;
    tooltip: number;
    maximum: number;
  };
}

// ============================================================================
// OPACITY TOKENS
// ============================================================================

export interface OpacityTokens {
  scale: {
    '0': number;
    '5': number;
    '10': number;
    '20': number;
    '25': number;
    '30': number;
    '40': number;
    '50': number;
    '60': number;
    '70': number;
    '75': number;
    '80': number;
    '90': number;
    '95': number;
    '100': number;
  };

  semantic: {
    disabled: number;
    placeholder: number;
    overlay: number;
    glass: number;
    custom?: Record<string, number>;
  };
}

// ============================================================================
// COMBINED DESIGN TOKENS
// ============================================================================

export interface DesignTokens {
  /** Color tokens */
  colors: ColorTokens;

  /** Spacing tokens */
  spacing: SpacingTokens;

  /** Typography tokens */
  typography: TypographyTokens;

  /** Shadow tokens */
  shadows: ShadowTokens;

  /** Border tokens */
  borders: BorderTokens;

  /** Motion/Animation tokens */
  motion: MotionTokens;

  /** Z-index tokens */
  zIndex: ZIndexTokens;

  /** Opacity tokens */
  opacity: OpacityTokens;

  /** Theme-specific custom tokens */
  custom?: Record<string, unknown>;
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

/**
 * Token path for referencing tokens (e.g., 'colors.semantic.primary')
 */
export type TokenPath = string;

/**
 * Token reference that can be resolved at runtime
 */
export interface TokenReference {
  /** The token path */
  path: TokenPath;
  /** Fallback value if token not found */
  fallback?: string;
  /** Transform to apply */
  transform?: 'alpha' | 'darken' | 'lighten' | 'saturate' | 'desaturate';
  /** Transform amount (0-1) */
  amount?: number;
}

/**
 * CSS custom property mapping
 */
export interface TokenCSSMapping {
  /** Token path */
  token: TokenPath;
  /** CSS custom property name (without --) */
  property: string;
  /** Value format transformation */
  format?: 'hsl' | 'rgb' | 'hex' | 'raw';
}
