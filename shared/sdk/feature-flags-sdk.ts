/**
 * @file feature-flags-sdk.ts
 * @description Feature Flag SDK for external services
 * @phase Phase 3 - Multi-tenancy & Security
 * @version 0.8.0
 *
 * Usage:
 * ```typescript
 * import { FeatureFlagClient } from '@rses/sdk';
 *
 * const client = new FeatureFlagClient({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://your-cms.com/api',
 *   siteId: 'your-site-id',
 * });
 *
 * // Check a feature
 * const enabled = await client.isEnabled('dark_mode', { userId: '123' });
 *
 * // Get all flags
 * const flags = await client.getAllFlags({ userId: '123' });
 *
 * // Subscribe to real-time updates
 * client.subscribe('dark_mode', (enabled) => {
 *   console.log('dark_mode changed:', enabled);
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface FeatureFlagClientConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL of the feature flag API */
  baseUrl: string;
  /** Site ID for multi-tenant isolation */
  siteId?: string;
  /** Default user context */
  defaultContext?: EvaluationContext;
  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  cacheTtlMs?: number;
  /** Enable WebSocket for real-time updates */
  enableRealtime?: boolean;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Offline mode fallback values */
  offlineDefaults?: Record<string, boolean>;
  /** Event handlers */
  onError?: (error: Error) => void;
  onFlagChange?: (key: string, enabled: boolean) => void;
}

export interface EvaluationContext {
  /** User identifier */
  userId?: string;
  /** User email */
  email?: string;
  /** User attributes for targeting */
  attributes?: Record<string, string | number | boolean>;
  /** Device type */
  deviceType?: "desktop" | "mobile" | "tablet";
  /** Geographic region */
  region?: string;
  /** Additional custom context */
  custom?: Record<string, unknown>;
}

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationResult {
  key: string;
  enabled: boolean;
  reason: string;
  variant?: string;
  metadata?: Record<string, unknown>;
}

export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
}

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

// ============================================================================
// Feature Flag Client
// ============================================================================

export class FeatureFlagClient {
  private config: Required<FeatureFlagClientConfig>;
  private cache = new Map<string, CacheEntry>();
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<(enabled: boolean) => void>>();
  private allFlagsSubscribers = new Set<(flags: Map<string, boolean>) => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: FeatureFlagClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      siteId: config.siteId || "",
      defaultContext: config.defaultContext || {},
      cacheTtlMs: config.cacheTtlMs ?? 60000,
      enableRealtime: config.enableRealtime ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
      retry: config.retry ?? { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000 },
      offlineDefaults: config.offlineDefaults ?? {},
      onError: config.onError ?? console.error,
      onFlagChange: config.onFlagChange ?? (() => {}),
    };

    if (this.config.enableRealtime) {
      this.connectWebSocket();
    }
  }

  // ==========================================================================
  // Core API
  // ==========================================================================

  /**
   * Check if a feature flag is enabled.
   */
  async isEnabled(key: string, context?: EvaluationContext): Promise<boolean> {
    // Check cache first
    const cached = this.getFromCache(key);
    if (cached !== null) {
      return cached;
    }

    try {
      const result = await this.evaluate(key, context);
      this.setCache(key, result.enabled);
      return result.enabled;
    } catch (error) {
      // Fallback to offline defaults
      if (key in this.config.offlineDefaults) {
        return this.config.offlineDefaults[key];
      }
      throw error;
    }
  }

  /**
   * Check if a feature flag is enabled (synchronous, cache-only).
   * Returns offline default if not cached.
   */
  isEnabledSync(key: string): boolean {
    const cached = this.getFromCache(key);
    if (cached !== null) {
      return cached;
    }
    return this.config.offlineDefaults[key] ?? false;
  }

  /**
   * Get detailed evaluation result for a feature flag.
   */
  async evaluate(key: string, context?: EvaluationContext): Promise<EvaluationResult> {
    const mergedContext = { ...this.config.defaultContext, ...context };

    const response = await this.request<EvaluationResult>("POST", "/feature-flags/evaluate", {
      key,
      context: mergedContext,
    });

    return response;
  }

  /**
   * Evaluate multiple feature flags at once.
   */
  async evaluateAll(
    keys: string[],
    context?: EvaluationContext
  ): Promise<Map<string, EvaluationResult>> {
    const mergedContext = { ...this.config.defaultContext, ...context };

    const response = await this.request<{ results: EvaluationResult[] }>(
      "POST",
      "/feature-flags/evaluate-batch",
      { keys, context: mergedContext }
    );

    const results = new Map<string, EvaluationResult>();
    for (const result of response.results) {
      results.set(result.key, result);
      this.setCache(result.key, result.enabled);
    }

    return results;
  }

  /**
   * Get all feature flags for the current site.
   */
  async getAllFlags(context?: EvaluationContext): Promise<FeatureFlag[]> {
    const mergedContext = { ...this.config.defaultContext, ...context };

    const response = await this.request<{ flags: FeatureFlag[] }>("POST", "/feature-flags/all", {
      context: mergedContext,
    });

    // Cache all flags
    for (const flag of response.flags) {
      this.setCache(flag.key, flag.enabled);
    }

    return response.flags;
  }

  /**
   * Pre-fetch and cache specific flags.
   */
  async prefetch(keys: string[], context?: EvaluationContext): Promise<void> {
    await this.evaluateAll(keys, context);
  }

  // ==========================================================================
  // Real-time Subscriptions
  // ==========================================================================

  /**
   * Subscribe to changes for a specific feature flag.
   */
  subscribe(key: string, callback: (enabled: boolean) => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);

    // Send initial value if cached
    const cached = this.getFromCache(key);
    if (cached !== null) {
      callback(cached);
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  /**
   * Subscribe to all flag changes.
   */
  subscribeAll(callback: (flags: Map<string, boolean>) => void): () => void {
    this.allFlagsSubscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this.allFlagsSubscribers.delete(callback);
    };
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Clear the entire cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific flag.
   */
  clearCacheEntry(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Force refresh a flag value.
   */
  async refresh(key: string, context?: EvaluationContext): Promise<boolean> {
    this.clearCacheEntry(key);
    return this.isEnabled(key, context);
  }

  /**
   * Force refresh all flags.
   */
  async refreshAll(context?: EvaluationContext): Promise<void> {
    this.clearCache();
    await this.getAllFlags(context);
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Disconnect and cleanup resources.
   */
  destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cache.clear();
    this.subscribers.clear();
    this.allFlagsSubscribers.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getFromCache(key: string): boolean | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCache(key: string, value: boolean): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (this.config.siteId) {
      headers["X-Site-ID"] = this.config.siteId;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new FeatureFlagError(
            errorBody.message || `HTTP ${response.status}`,
            response.status,
            errorBody.code
          );
        }

        return response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (error instanceof FeatureFlagError && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Exponential backoff
        if (attempt < this.config.retry.maxAttempts - 1) {
          const delay = Math.min(
            this.config.retry.baseDelayMs * Math.pow(2, attempt),
            this.config.retry.maxDelayMs
          );
          await this.sleep(delay);
        }
      }
    }

    this.config.onError(lastError!);
    throw lastError;
  }

  private connectWebSocket(): void {
    if (typeof WebSocket === "undefined") {
      console.warn("[FeatureFlagClient] WebSocket not available in this environment");
      return;
    }

    const wsUrl = this.config.baseUrl
      .replace(/^http/, "ws")
      .replace(/\/api$/, "/ws");

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Subscribe to feature flag channel
        this.ws?.send(
          JSON.stringify({
            type: "subscribe",
            channel: "feature-flags",
            siteId: this.config.siteId,
            apiKey: this.config.apiKey,
          })
        );
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "feature-flag-update") {
            this.handleFlagUpdate(message.key, message.enabled);
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Error will trigger onclose
      };
    } catch (error) {
      console.error("[FeatureFlagClient] WebSocket connection failed:", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      this.config.retry.baseDelayMs * Math.pow(2, this.reconnectAttempts),
      this.config.retry.maxDelayMs
    );

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  private handleFlagUpdate(key: string, enabled: boolean): void {
    // Update cache
    this.setCache(key, enabled);

    // Notify specific subscribers
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(enabled);
        } catch (error) {
          console.error("[FeatureFlagClient] Subscriber error:", error);
        }
      }
    }

    // Notify all-flags subscribers
    const allFlags = new Map<string, boolean>();
    for (const [k, entry] of this.cache.entries()) {
      if (Date.now() <= entry.expiresAt) {
        allFlags.set(k, entry.value);
      }
    }
    for (const callback of this.allFlagsSubscribers) {
      try {
        callback(allFlags);
      } catch (error) {
        console.error("[FeatureFlagClient] Subscriber error:", error);
      }
    }

    // Call global handler
    this.config.onFlagChange(key, enabled);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class FeatureFlagError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "FeatureFlagError";
  }
}

// ============================================================================
// React Hook (if using React)
// ============================================================================

/**
 * React hook for feature flags.
 * Note: This is a simplified version. For full React integration,
 * create a context provider.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { enabled, loading } = useFeatureFlag(client, 'dark_mode');
 *
 *   if (loading) return <Spinner />;
 *   return enabled ? <DarkMode /> : <LightMode />;
 * }
 * ```
 */
export function createUseFeatureFlag(client: FeatureFlagClient) {
  return function useFeatureFlag(
    key: string,
    context?: EvaluationContext
  ): { enabled: boolean; loading: boolean; error: Error | null } {
    // This is a placeholder - actual implementation requires React
    // Import React hooks in the actual implementation
    throw new Error(
      "useFeatureFlag requires React. Import from @rses/sdk/react instead."
    );
  };
}

// ============================================================================
// Server-Side Helpers
// ============================================================================

/**
 * Create a middleware that attaches feature flag client to requests.
 */
export function createFeatureFlagMiddleware(client: FeatureFlagClient) {
  return (req: any, res: any, next: () => void) => {
    req.featureFlags = client;
    next();
  };
}

/**
 * Server-side feature flag helper with request context.
 */
export async function getServerFeatureFlag(
  client: FeatureFlagClient,
  key: string,
  req: { user?: { id: string }; headers?: Record<string, string> }
): Promise<boolean> {
  const context: EvaluationContext = {};

  if (req.user?.id) {
    context.userId = req.user.id;
  }

  return client.isEnabled(key, context);
}
