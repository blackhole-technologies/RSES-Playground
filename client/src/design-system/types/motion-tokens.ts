/**
 * Motion Design System
 *
 * Comprehensive animation and motion tokens inspired by:
 * - Material Design 3 Motion
 * - Apple Human Interface Guidelines
 * - Framer Motion best practices
 * - WCAG 2.1 motion guidelines
 */

import type { DurationTokenValue, CubicBezierTokenValue, TokenAlias } from './w3c-tokens';

// ============================================================================
// DURATION TOKENS
// ============================================================================

/**
 * Duration scale based on Material Design 3
 */
export interface DurationTokens {
  /** Instant feedback (0ms) */
  instant: DurationTokenValue;
  /** Ultra-fast for micro-interactions (50ms) */
  ultraFast: DurationTokenValue;
  /** Fast for simple state changes (100ms) */
  fast: DurationTokenValue;
  /** Normal for standard transitions (200ms) */
  normal: DurationTokenValue;
  /** Medium for moderate complexity (300ms) */
  medium: DurationTokenValue;
  /** Slow for complex animations (400ms) */
  slow: DurationTokenValue;
  /** Slower for dramatic effects (500ms) */
  slower: DurationTokenValue;
  /** Slowest for elaborate sequences (700ms) */
  slowest: DurationTokenValue;
  /** Extended for page transitions (1000ms) */
  extended: DurationTokenValue;
}

// ============================================================================
// EASING TOKENS
// ============================================================================

/**
 * Easing functions based on motion science
 */
export interface EasingTokens {
  /** Linear - constant speed */
  linear: CubicBezierTokenValue;

  /** Standard easing - natural feel */
  standard: CubicBezierTokenValue;
  standardDecelerate: CubicBezierTokenValue;
  standardAccelerate: CubicBezierTokenValue;

  /** Emphasized easing - expressive */
  emphasized: CubicBezierTokenValue;
  emphasizedDecelerate: CubicBezierTokenValue;
  emphasizedAccelerate: CubicBezierTokenValue;

  /** Material Design 3 easing */
  easeInOut: CubicBezierTokenValue;
  easeOut: CubicBezierTokenValue;
  easeIn: CubicBezierTokenValue;

  /** Apple easing curves */
  appleStandard: CubicBezierTokenValue;
  appleSpring: CubicBezierTokenValue;

  /** Interactive easing */
  bouncy: CubicBezierTokenValue;
  elastic: CubicBezierTokenValue;
  snappy: CubicBezierTokenValue;

  /** Entrance/Exit specific */
  enter: CubicBezierTokenValue;
  exit: CubicBezierTokenValue;
  enterExpressive: CubicBezierTokenValue;
  exitExpressive: CubicBezierTokenValue;
}

// ============================================================================
// SPRING PHYSICS TOKENS
// ============================================================================

/**
 * Spring animation configuration
 */
export interface SpringConfig {
  /** Spring stiffness (tension) */
  stiffness: number;
  /** Spring damping (friction) */
  damping: number;
  /** Object mass */
  mass: number;
  /** Initial velocity */
  velocity?: number;
  /** Rest threshold for stopping */
  restDelta?: number;
  /** Velocity threshold for stopping */
  restSpeed?: number;
}

/**
 * Predefined spring presets
 */
export interface SpringTokens {
  /** Gentle spring for subtle movements */
  gentle: SpringConfig;
  /** Default spring for most interactions */
  default: SpringConfig;
  /** Wobbly spring for playful interactions */
  wobbly: SpringConfig;
  /** Stiff spring for quick responses */
  stiff: SpringConfig;
  /** Slow spring for dramatic reveals */
  slow: SpringConfig;
  /** Molasses for very slow, heavy movements */
  molasses: SpringConfig;
  /** Bouncy for energetic interactions */
  bouncy: SpringConfig;
}

// ============================================================================
// MOTION CHOREOGRAPHY
// ============================================================================

/**
 * Stagger configuration for sequential animations
 */
export interface StaggerConfig {
  /** Delay between each item */
  delay: number;
  /** Starting delay before first item */
  startDelay?: number;
  /** Direction of stagger */
  direction?: 'forward' | 'reverse' | 'center' | 'edges';
  /** Easing for delay curve */
  ease?: CubicBezierTokenValue | TokenAlias;
  /** Maximum number of items to animate */
  maxItems?: number;
}

/**
 * Choreography tokens for coordinated animations
 */
export interface ChoreographyTokens {
  /** List item stagger */
  listStagger: StaggerConfig;
  /** Grid item stagger */
  gridStagger: StaggerConfig;
  /** Card stack stagger */
  cardStagger: StaggerConfig;
  /** Menu item stagger */
  menuStagger: StaggerConfig;
  /** Hero content stagger */
  heroStagger: StaggerConfig;
  /** Form field stagger */
  formStagger: StaggerConfig;
}

// ============================================================================
// TRANSITION PRESETS
// ============================================================================

/**
 * Complete transition configuration
 */
export interface TransitionPreset {
  /** Duration token reference */
  duration: DurationTokenValue | TokenAlias;
  /** Easing token reference */
  easing: CubicBezierTokenValue | TokenAlias | string;
  /** Delay before transition starts */
  delay?: DurationTokenValue | TokenAlias;
  /** Properties to transition */
  properties?: string[];
}

/**
 * Semantic transition tokens
 */
export interface TransitionTokens {
  /** Quick state changes (hover, focus) */
  instant: TransitionPreset;

  /** Micro-interactions (button press, toggle) */
  micro: TransitionPreset;

  /** Standard UI transitions */
  standard: TransitionPreset;

  /** Complex state transitions */
  complex: TransitionPreset;

  /** Page/view transitions */
  page: TransitionPreset;

  /** Expand/collapse transitions */
  expand: TransitionPreset;

  /** Fade in/out */
  fade: TransitionPreset;

  /** Scale transformations */
  scale: TransitionPreset;

  /** Slide movements */
  slide: TransitionPreset;

  /** Color transitions */
  color: TransitionPreset;

  /** Layout shifts */
  layout: TransitionPreset;
}

// ============================================================================
// KEYFRAME ANIMATIONS
// ============================================================================

/**
 * Keyframe definition
 */
export interface Keyframe {
  offset?: number; // 0-1
  transform?: string;
  opacity?: number;
  filter?: string;
  [property: string]: string | number | undefined;
}

/**
 * Animation definition
 */
export interface AnimationDefinition {
  /** Animation name */
  name: string;
  /** Keyframes */
  keyframes: Keyframe[];
  /** Duration */
  duration: DurationTokenValue | TokenAlias;
  /** Easing */
  easing: CubicBezierTokenValue | TokenAlias | string;
  /** Iteration count */
  iterations?: number | 'infinite';
  /** Direction */
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  /** Fill mode */
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  /** Play state */
  playState?: 'running' | 'paused';
  /** Delay */
  delay?: DurationTokenValue | TokenAlias;
}

/**
 * Predefined animations
 */
export interface AnimationTokens {
  /** Entrance animations */
  entrance: {
    fadeIn: AnimationDefinition;
    fadeInUp: AnimationDefinition;
    fadeInDown: AnimationDefinition;
    fadeInLeft: AnimationDefinition;
    fadeInRight: AnimationDefinition;
    scaleIn: AnimationDefinition;
    slideIn: AnimationDefinition;
    bounceIn: AnimationDefinition;
    flipIn: AnimationDefinition;
    zoomIn: AnimationDefinition;
  };

  /** Exit animations */
  exit: {
    fadeOut: AnimationDefinition;
    fadeOutUp: AnimationDefinition;
    fadeOutDown: AnimationDefinition;
    fadeOutLeft: AnimationDefinition;
    fadeOutRight: AnimationDefinition;
    scaleOut: AnimationDefinition;
    slideOut: AnimationDefinition;
    bounceOut: AnimationDefinition;
    flipOut: AnimationDefinition;
    zoomOut: AnimationDefinition;
  };

  /** Attention seekers */
  attention: {
    pulse: AnimationDefinition;
    bounce: AnimationDefinition;
    shake: AnimationDefinition;
    wobble: AnimationDefinition;
    swing: AnimationDefinition;
    rubberBand: AnimationDefinition;
    flash: AnimationDefinition;
    headShake: AnimationDefinition;
    jello: AnimationDefinition;
    heartBeat: AnimationDefinition;
  };

  /** Loading/Progress */
  loading: {
    spin: AnimationDefinition;
    dots: AnimationDefinition;
    bars: AnimationDefinition;
    wave: AnimationDefinition;
    skeleton: AnimationDefinition;
    shimmer: AnimationDefinition;
  };

  /** Background animations */
  background: {
    gradient: AnimationDefinition;
    parallax: AnimationDefinition;
    float: AnimationDefinition;
    morph: AnimationDefinition;
  };
}

// ============================================================================
// REDUCED MOTION
// ============================================================================

/**
 * Reduced motion alternatives
 */
export interface ReducedMotionConfig {
  /** Use instant transitions */
  instantTransitions: boolean;
  /** Disable animations */
  disableAnimations: boolean;
  /** Use opacity only for state changes */
  opacityOnly: boolean;
  /** Maximum allowed duration */
  maxDuration: DurationTokenValue;
  /** Fallback easing */
  fallbackEasing: CubicBezierTokenValue;
  /** Disable parallax effects */
  disableParallax: boolean;
  /** Disable auto-playing animations */
  disableAutoPlay: boolean;
}

/**
 * Motion accessibility settings
 */
export interface MotionAccessibility {
  /** Reduced motion configuration */
  reducedMotion: ReducedMotionConfig;
  /** High contrast motion adjustments */
  highContrast: {
    enhancedBorders: boolean;
    disableBlur: boolean;
    disableShadowAnimations: boolean;
  };
  /** Vestibular disorder considerations */
  vestibularSafe: {
    disableZoom: boolean;
    disableRotation: boolean;
    limitScrollAnimations: boolean;
  };
}

// ============================================================================
// GESTURE MOTION
// ============================================================================

/**
 * Gesture-based motion configuration
 */
export interface GestureMotion {
  /** Drag configuration */
  drag: {
    elasticity: number;
    friction: number;
    maxVelocity: number;
    snapPoints?: number[];
    direction?: 'x' | 'y' | 'both';
  };

  /** Swipe configuration */
  swipe: {
    threshold: number;
    velocity: number;
    direction: 'left' | 'right' | 'up' | 'down' | 'horizontal' | 'vertical';
  };

  /** Pinch/zoom configuration */
  pinch: {
    minScale: number;
    maxScale: number;
    friction: number;
  };

  /** Hover configuration */
  hover: {
    scale?: number;
    lift?: number;
    tilt?: boolean;
    glow?: boolean;
  };

  /** Press/tap configuration */
  press: {
    scale: number;
    duration: DurationTokenValue;
    hapticFeedback?: boolean;
  };
}

// ============================================================================
// SCROLL MOTION
// ============================================================================

/**
 * Scroll-linked motion configuration
 */
export interface ScrollMotion {
  /** Scroll progress triggers */
  progress: {
    start: number; // 0-1
    end: number; // 0-1
    scrub?: boolean | number;
  };

  /** Parallax configuration */
  parallax: {
    speed: number;
    direction: 'up' | 'down' | 'left' | 'right';
    overflow?: boolean;
  };

  /** Reveal animations */
  reveal: {
    threshold: number;
    rootMargin: string;
    once: boolean;
    animation: AnimationDefinition;
  };

  /** Sticky behavior */
  sticky: {
    start: string;
    end: string;
    pinSpacing: boolean;
  };
}

// ============================================================================
// VIEW TRANSITIONS API
// ============================================================================

/**
 * View Transitions API configuration
 */
export interface ViewTransitionConfig {
  /** Enable view transitions */
  enabled: boolean;
  /** Cross-document transitions */
  crossDocument: boolean;
  /** Default transition type */
  defaultType: 'fade' | 'slide' | 'scale' | 'morph';
  /** Named transitions for specific elements */
  named: {
    [viewTransitionName: string]: {
      old: AnimationDefinition;
      new: AnimationDefinition;
    };
  };
  /** Fallback for unsupported browsers */
  fallback: 'instant' | 'fade' | 'none';
}

// ============================================================================
// COMPLETE MOTION SYSTEM
// ============================================================================

/**
 * Complete motion design system
 */
export interface MotionDesignSystem {
  /** Duration tokens */
  duration: DurationTokens;
  /** Easing tokens */
  easing: EasingTokens;
  /** Spring physics tokens */
  spring: SpringTokens;
  /** Choreography tokens */
  choreography: ChoreographyTokens;
  /** Transition tokens */
  transition: TransitionTokens;
  /** Animation tokens */
  animation: AnimationTokens;
  /** Accessibility settings */
  accessibility: MotionAccessibility;
  /** Gesture motion */
  gesture: GestureMotion;
  /** Scroll motion */
  scroll: ScrollMotion;
  /** View transitions */
  viewTransitions: ViewTransitionConfig;
}

// ============================================================================
// DEFAULT MOTION TOKENS
// ============================================================================

export const defaultDurationTokens: DurationTokens = {
  instant: { $type: 'duration', $value: 0, unit: 'ms' },
  ultraFast: { $type: 'duration', $value: 50, unit: 'ms' },
  fast: { $type: 'duration', $value: 100, unit: 'ms' },
  normal: { $type: 'duration', $value: 200, unit: 'ms' },
  medium: { $type: 'duration', $value: 300, unit: 'ms' },
  slow: { $type: 'duration', $value: 400, unit: 'ms' },
  slower: { $type: 'duration', $value: 500, unit: 'ms' },
  slowest: { $type: 'duration', $value: 700, unit: 'ms' },
  extended: { $type: 'duration', $value: 1000, unit: 'ms' },
};

export const defaultEasingTokens: EasingTokens = {
  linear: { $type: 'cubicBezier', $value: [0, 0, 1, 1] },
  standard: { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] },
  standardDecelerate: { $type: 'cubicBezier', $value: [0, 0, 0, 1] },
  standardAccelerate: { $type: 'cubicBezier', $value: [0.3, 0, 1, 1] },
  emphasized: { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] },
  emphasizedDecelerate: { $type: 'cubicBezier', $value: [0.05, 0.7, 0.1, 1] },
  emphasizedAccelerate: { $type: 'cubicBezier', $value: [0.3, 0, 0.8, 0.15] },
  easeInOut: { $type: 'cubicBezier', $value: [0.4, 0, 0.2, 1] },
  easeOut: { $type: 'cubicBezier', $value: [0, 0, 0.2, 1] },
  easeIn: { $type: 'cubicBezier', $value: [0.4, 0, 1, 1] },
  appleStandard: { $type: 'cubicBezier', $value: [0.25, 0.1, 0.25, 1] },
  appleSpring: { $type: 'cubicBezier', $value: [0.5, 1.8, 0.5, 0.8] },
  bouncy: { $type: 'cubicBezier', $value: [0.68, -0.55, 0.265, 1.55] },
  elastic: { $type: 'cubicBezier', $value: [0.5, 1.5, 0.5, 1] },
  snappy: { $type: 'cubicBezier', $value: [0.5, 0, 0.1, 1] },
  enter: { $type: 'cubicBezier', $value: [0, 0, 0.2, 1] },
  exit: { $type: 'cubicBezier', $value: [0.4, 0, 1, 1] },
  enterExpressive: { $type: 'cubicBezier', $value: [0.05, 0.7, 0.1, 1] },
  exitExpressive: { $type: 'cubicBezier', $value: [0.3, 0, 0.8, 0.15] },
};

export const defaultSpringTokens: SpringTokens = {
  gentle: { stiffness: 120, damping: 14, mass: 1 },
  default: { stiffness: 170, damping: 26, mass: 1 },
  wobbly: { stiffness: 180, damping: 12, mass: 1 },
  stiff: { stiffness: 210, damping: 20, mass: 1 },
  slow: { stiffness: 280, damping: 60, mass: 1 },
  molasses: { stiffness: 280, damping: 120, mass: 1 },
  bouncy: { stiffness: 400, damping: 10, mass: 1 },
};
