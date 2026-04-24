/**
 * Micro-Frontend Architecture Types
 *
 * Supports independently deployable UI modules with:
 * - Module Federation
 * - Design token scoping
 * - Runtime composition
 * - Shared dependencies
 */

// ============================================================================
// MICRO-FRONTEND CONFIGURATION
// ============================================================================

/**
 * Core micro-frontend definition
 */
export interface MicroFrontend {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Version (semver) */
  version: string;
  /** Entry point URL or module path */
  entry: string;
  /** Module scope for isolation */
  scope: string;
  /** Shared dependencies */
  shared: SharedDependency[];
  /** Route configuration */
  routes: RouteConfig[];
  /** Exposed components */
  exposes: ExposeConfig[];
  /** Required remotes */
  remotes: RemoteConfig[];
  /** Design token configuration */
  tokens?: MicroFrontendTokenConfig;
  /** Lifecycle hooks */
  lifecycle?: MicroFrontendLifecycle;
  /** Metadata */
  metadata?: MicroFrontendMetadata;
}

/**
 * Shared dependency configuration
 */
export interface SharedDependency {
  /** Package name */
  name: string;
  /** Singleton (only one instance) */
  singleton?: boolean;
  /** Required version range */
  requiredVersion?: string;
  /** Strict version matching */
  strictVersion?: boolean;
  /** Eager loading */
  eager?: boolean;
  /** Share scope */
  shareScope?: string;
}

/**
 * Route configuration
 */
export interface RouteConfig {
  /** Route path pattern */
  path: string;
  /** Component to render */
  component: string;
  /** Exact path matching */
  exact?: boolean;
  /** Route guards */
  guards?: RouteGuard[];
  /** Lazy loading configuration */
  lazy?: LazyRouteConfig;
  /** Nested routes */
  children?: RouteConfig[];
  /** Route metadata */
  meta?: RouteMetadata;
}

export interface RouteGuard {
  /** Guard type */
  type: 'auth' | 'permission' | 'feature' | 'custom';
  /** Guard configuration */
  config: Record<string, unknown>;
  /** Redirect on failure */
  redirect?: string;
}

export interface LazyRouteConfig {
  /** Prefetch strategy */
  prefetch?: 'hover' | 'viewport' | 'idle' | 'none';
  /** Minimum delay before loading indicator */
  delay?: number;
  /** Timeout for loading */
  timeout?: number;
  /** Error boundary component */
  errorBoundary?: string;
  /** Loading component */
  loading?: string;
}

export interface RouteMetadata {
  /** Page title */
  title?: string;
  /** Required permissions */
  permissions?: string[];
  /** Feature flags */
  features?: string[];
  /** Analytics tracking */
  analytics?: {
    pageView?: boolean;
    category?: string;
  };
}

/**
 * Expose configuration (what this MFE provides)
 */
export interface ExposeConfig {
  /** Public name */
  name: string;
  /** Internal module path */
  module: string;
  /** Component type */
  type: 'component' | 'hook' | 'utility' | 'store' | 'service';
  /** TypeScript types path */
  types?: string;
  /** Documentation */
  docs?: string;
}

/**
 * Remote configuration (what this MFE consumes)
 */
export interface RemoteConfig {
  /** Remote name (scope) */
  name: string;
  /** Remote entry URL */
  url: string;
  /** Required modules */
  modules: string[];
  /** Fallback for offline */
  fallback?: 'cache' | 'stub' | 'none';
  /** Version constraints */
  version?: string;
}

// ============================================================================
// DESIGN TOKEN SCOPING
// ============================================================================

/**
 * Micro-frontend token configuration
 */
export interface MicroFrontendTokenConfig {
  /** Token scope strategy */
  scope: TokenScopeStrategy;
  /** Override host tokens */
  overrides?: Record<string, unknown>;
  /** Custom tokens for this MFE */
  custom?: Record<string, unknown>;
  /** Token inheritance */
  inherit?: TokenInheritance;
  /** CSS custom property prefix */
  prefix?: string;
}

export type TokenScopeStrategy =
  | 'inherit' // Use host tokens
  | 'isolated' // Use own tokens only
  | 'merged' // Merge with host tokens
  | 'shadow'; // Use shadow DOM isolation

export interface TokenInheritance {
  /** Inherit specific token groups */
  include?: string[];
  /** Exclude specific token groups */
  exclude?: string[];
  /** Deep merge behavior */
  deep?: boolean;
}

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

/**
 * Micro-frontend lifecycle hooks
 */
export interface MicroFrontendLifecycle {
  /** Called before mount */
  bootstrap?: () => Promise<void>;
  /** Called on mount */
  mount?: (container: HTMLElement, props: MountProps) => Promise<MountResult>;
  /** Called on unmount */
  unmount?: (container: HTMLElement) => Promise<void>;
  /** Called on update */
  update?: (props: MountProps) => Promise<void>;
  /** Error handler */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Communication handler */
  onMessage?: (message: CrossMFEMessage) => void;
}

export interface MountProps {
  /** Container element */
  container: HTMLElement;
  /** Base path for routing */
  basePath: string;
  /** Host application data */
  hostData?: Record<string, unknown>;
  /** Design tokens from host */
  tokens?: Record<string, unknown>;
  /** Event bus for communication */
  eventBus?: EventBus;
  /** Shared state */
  sharedState?: SharedState;
}

export interface MountResult {
  /** Cleanup function */
  unmount: () => void;
  /** Update props function */
  update: (props: Partial<MountProps>) => void;
}

export interface ErrorInfo {
  componentStack?: string;
  source: string;
  timestamp: number;
}

// ============================================================================
// CROSS-MFE COMMUNICATION
// ============================================================================

/**
 * Cross micro-frontend message
 */
export interface CrossMFEMessage {
  /** Source MFE ID */
  source: string;
  /** Target MFE ID (or '*' for broadcast) */
  target: string;
  /** Message type */
  type: string;
  /** Message payload */
  payload: unknown;
  /** Correlation ID for request/response */
  correlationId?: string;
  /** Message timestamp */
  timestamp: number;
}

/**
 * Event bus for MFE communication
 */
export interface EventBus {
  /** Emit an event */
  emit: (event: string, payload: unknown) => void;
  /** Subscribe to an event */
  on: (event: string, handler: (payload: unknown) => void) => () => void;
  /** Subscribe once */
  once: (event: string, handler: (payload: unknown) => void) => () => void;
  /** Request/response pattern */
  request: <T>(event: string, payload: unknown, timeout?: number) => Promise<T>;
  /** Register response handler */
  respond: <T, R>(event: string, handler: (payload: T) => R | Promise<R>) => () => void;
}

/**
 * Shared state between MFEs
 */
export interface SharedState {
  /** Get state value */
  get: <T>(key: string) => T | undefined;
  /** Set state value */
  set: <T>(key: string, value: T) => void;
  /** Subscribe to state changes */
  subscribe: <T>(key: string, handler: (value: T) => void) => () => void;
  /** Delete state value */
  delete: (key: string) => void;
  /** Get all keys */
  keys: () => string[];
}

// ============================================================================
// LOADING STRATEGIES
// ============================================================================

/**
 * MFE loading configuration
 */
export interface LoadingStrategy {
  /** Loading mode */
  mode: 'eager' | 'lazy' | 'prefetch' | 'ondemand';
  /** Priority (0-100) */
  priority?: number;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Cache configuration */
  cache?: CacheConfig;
  /** Timeout in ms */
  timeout?: number;
}

export interface RetryConfig {
  /** Maximum retries */
  maxAttempts: number;
  /** Delay between retries */
  delay: number;
  /** Exponential backoff */
  backoff?: boolean;
}

export interface CacheConfig {
  /** Cache strategy */
  strategy: 'network-first' | 'cache-first' | 'stale-while-revalidate';
  /** Cache TTL in seconds */
  ttl?: number;
  /** Cache key generator */
  keyGenerator?: (mfe: MicroFrontend) => string;
}

// ============================================================================
// COMPOSITION PATTERNS
// ============================================================================

/**
 * Layout slot for MFE composition
 */
export interface LayoutSlot {
  /** Slot name */
  name: string;
  /** Allowed MFE types */
  allowedTypes?: string[];
  /** Maximum components */
  maxComponents?: number;
  /** Default component */
  default?: string;
  /** Slot styling */
  style?: {
    layout?: 'stack' | 'grid' | 'flex';
    gap?: string;
    padding?: string;
  };
}

/**
 * Application shell configuration
 */
export interface ApplicationShell {
  /** Shell ID */
  id: string;
  /** Layout configuration */
  layout: ShellLayout;
  /** Header configuration */
  header?: ShellRegion;
  /** Sidebar configuration */
  sidebar?: ShellRegion;
  /** Footer configuration */
  footer?: ShellRegion;
  /** Main content area */
  main: ShellRegion;
  /** Global overlays */
  overlays?: ShellRegion;
}

export interface ShellLayout {
  /** Layout type */
  type: 'holy-grail' | 'dashboard' | 'sidebar' | 'stacked' | 'custom';
  /** CSS grid template */
  gridTemplate?: string;
  /** Responsive variants */
  responsive?: Record<string, Partial<ShellLayout>>;
}

export interface ShellRegion {
  /** Region ID */
  id: string;
  /** MFE to render */
  mfe?: string;
  /** Static component */
  component?: string;
  /** Visibility conditions */
  visible?: RegionVisibility;
  /** Region styling */
  style?: Record<string, string>;
}

export interface RegionVisibility {
  /** Route patterns */
  routes?: string[];
  /** User roles */
  roles?: string[];
  /** Feature flags */
  features?: string[];
  /** Breakpoints */
  breakpoints?: string[];
}

// ============================================================================
// METADATA & DISCOVERY
// ============================================================================

/**
 * Micro-frontend metadata
 */
export interface MicroFrontendMetadata {
  /** Description */
  description?: string;
  /** Team owner */
  team?: string;
  /** Repository URL */
  repository?: string;
  /** Documentation URL */
  documentation?: string;
  /** Tags for discovery */
  tags?: string[];
  /** Dependencies graph */
  dependencies?: DependencyGraph;
  /** Health check endpoint */
  healthCheck?: string;
  /** Bundle size info */
  bundleSize?: BundleInfo;
}

export interface DependencyGraph {
  /** Direct dependencies */
  direct: string[];
  /** Peer dependencies */
  peer: string[];
  /** Optional dependencies */
  optional: string[];
}

export interface BundleInfo {
  /** Total size in bytes */
  total: number;
  /** Gzipped size */
  gzip: number;
  /** Brotli size */
  brotli: number;
  /** Chunks */
  chunks: ChunkInfo[];
}

export interface ChunkInfo {
  /** Chunk name */
  name: string;
  /** Chunk size */
  size: number;
  /** Is async chunk */
  async: boolean;
  /** Modules in chunk */
  modules: string[];
}

/**
 * MFE registry for discovery
 */
export interface MicroFrontendRegistry {
  /** List all registered MFEs */
  list: () => MicroFrontend[];
  /** Get MFE by ID */
  get: (id: string) => MicroFrontend | undefined;
  /** Register new MFE */
  register: (mfe: MicroFrontend) => void;
  /** Unregister MFE */
  unregister: (id: string) => void;
  /** Search MFEs */
  search: (query: MFESearchQuery) => MicroFrontend[];
  /** Get MFE health */
  health: (id: string) => Promise<MFEHealth>;
}

export interface MFESearchQuery {
  /** Name filter */
  name?: string;
  /** Tag filter */
  tags?: string[];
  /** Team filter */
  team?: string;
  /** Type filter */
  type?: string;
}

export interface MFEHealth {
  /** MFE ID */
  id: string;
  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Last check timestamp */
  lastCheck: number;
  /** Response time */
  responseTime?: number;
  /** Error message */
  error?: string;
}
