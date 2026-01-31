/**
 * @file use-feature-flags.ts
 * @description React hooks for feature flag management
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  FeatureFlag,
  EvaluationContext,
  EvaluationResult,
  SiteFeatureOverride,
  UserFeatureOverride,
  FeatureUsageStats,
  RolloutEvent,
} from "@shared/admin/types";
import type { DependencyResolution } from "@shared/admin/schema";
import type {
  FeatureFlagFilterState,
  FeatureFlagFormData,
  SiteOverrideFormData,
  UserOverrideFormData,
  PaginationState,
} from "../types";

const API_BASE = "/api/admin";

// =============================================================================
// API HELPERS
// =============================================================================

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// =============================================================================
// FEATURE FLAGS HOOK
// =============================================================================

export interface UseFeatureFlagsOptions {
  autoLoad?: boolean;
  filter?: Partial<FeatureFlagFilterState>;
}

export interface UseFeatureFlagsReturn {
  flags: FeatureFlag[];
  loading: boolean;
  error: string | null;
  pagination: PaginationState;

  // Actions
  loadFlags: (filter?: Partial<FeatureFlagFilterState>) => Promise<void>;
  createFlag: (data: FeatureFlagFormData) => Promise<FeatureFlag>;
  updateFlag: (key: string, data: Partial<FeatureFlagFormData>) => Promise<FeatureFlag>;
  deleteFlag: (key: string) => Promise<void>;
  enableFlag: (key: string) => Promise<FeatureFlag>;
  disableFlag: (key: string) => Promise<FeatureFlag>;

  // Pagination
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export function useFeatureFlags(options: UseFeatureFlagsOptions = {}): UseFeatureFlagsReturn {
  const { autoLoad = true, filter: initialFilter } = options;

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 20,
    total: 0,
  });

  const loadFlags = useCallback(async (filter?: Partial<FeatureFlagFilterState>) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (filter?.search) params.set("search", filter.search);
      if (filter?.categories?.length) params.set("categories", filter.categories.join(","));
      if (filter?.tags?.length) params.set("tags", filter.tags.join(","));
      if (filter?.enabled !== null && filter?.enabled !== undefined) {
        params.set("enabled", String(filter.enabled));
      }
      if (filter?.owner) params.set("owner", filter.owner);

      params.set("limit", String(pagination.pageSize));
      params.set("offset", String((pagination.page - 1) * pagination.pageSize));

      const response = await fetchJson<{ data: FeatureFlag[]; total: number }>(
        `${API_BASE}/feature-flags?${params.toString()}`
      );

      setFlags(response.data);
      setPagination((prev) => ({ ...prev, total: response.total }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  const createFlag = useCallback(async (data: FeatureFlagFormData): Promise<FeatureFlag> => {
    const flag = await fetchJson<FeatureFlag>(`${API_BASE}/feature-flags`, {
      method: "POST",
      body: JSON.stringify(data),
    });

    setFlags((prev) => [flag, ...prev]);
    return flag;
  }, []);

  const updateFlag = useCallback(async (key: string, data: Partial<FeatureFlagFormData>): Promise<FeatureFlag> => {
    const flag = await fetchJson<FeatureFlag>(`${API_BASE}/feature-flags/${key}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });

    setFlags((prev) => prev.map((f) => (f.key === key ? flag : f)));
    return flag;
  }, []);

  const deleteFlag = useCallback(async (key: string): Promise<void> => {
    await fetchJson<void>(`${API_BASE}/feature-flags/${key}`, {
      method: "DELETE",
    });

    setFlags((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const enableFlag = useCallback(async (key: string): Promise<FeatureFlag> => {
    const flag = await fetchJson<FeatureFlag>(`${API_BASE}/feature-flags/${key}/enable`, {
      method: "POST",
    });

    setFlags((prev) => prev.map((f) => (f.key === key ? flag : f)));
    return flag;
  }, []);

  const disableFlag = useCallback(async (key: string): Promise<FeatureFlag> => {
    const flag = await fetchJson<FeatureFlag>(`${API_BASE}/feature-flags/${key}/disable`, {
      method: "POST",
    });

    setFlags((prev) => prev.map((f) => (f.key === key ? flag : f)));
    return flag;
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  useEffect(() => {
    if (autoLoad) {
      loadFlags(initialFilter);
    }
  }, [autoLoad, loadFlags, initialFilter]);

  return {
    flags,
    loading,
    error,
    pagination,
    loadFlags,
    createFlag,
    updateFlag,
    deleteFlag,
    enableFlag,
    disableFlag,
    setPage,
    setPageSize,
  };
}

// =============================================================================
// SINGLE FEATURE FLAG HOOK
// =============================================================================

export interface UseFeatureFlagReturn {
  flag: FeatureFlag | null;
  loading: boolean;
  error: string | null;

  // Related data
  siteOverrides: SiteFeatureOverride[];
  userOverrides: UserFeatureOverride[];
  history: RolloutEvent[];
  stats: FeatureUsageStats | null;
  dependencies: DependencyResolution | null;

  // Actions
  loadFlag: () => Promise<void>;
  loadOverrides: () => Promise<void>;
  loadHistory: (limit?: number) => Promise<void>;
  loadStats: (period?: "hour" | "day" | "week" | "month") => Promise<void>;
  checkCanEnable: () => Promise<DependencyResolution>;
  checkCanDisable: () => Promise<DependencyResolution>;
}

export function useFeatureFlag(key: string | null): UseFeatureFlagReturn {
  const [flag, setFlag] = useState<FeatureFlag | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [siteOverrides, setSiteOverrides] = useState<SiteFeatureOverride[]>([]);
  const [userOverrides, setUserOverrides] = useState<UserFeatureOverride[]>([]);
  const [history, setHistory] = useState<RolloutEvent[]>([]);
  const [stats, setStats] = useState<FeatureUsageStats | null>(null);
  const [dependencies, setDependencies] = useState<DependencyResolution | null>(null);

  const loadFlag = useCallback(async () => {
    if (!key) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson<FeatureFlag>(`${API_BASE}/feature-flags/${key}`);
      setFlag(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feature flag");
    } finally {
      setLoading(false);
    }
  }, [key]);

  const loadOverrides = useCallback(async () => {
    if (!key) return;

    try {
      const [siteRes, userRes] = await Promise.all([
        fetchJson<{ data: SiteFeatureOverride[] }>(`${API_BASE}/feature-flags/${key}/site-overrides`),
        fetchJson<{ data: UserFeatureOverride[] }>(`${API_BASE}/feature-flags/${key}/user-overrides`),
      ]);

      setSiteOverrides(siteRes.data);
      setUserOverrides(userRes.data);
    } catch (err) {
      console.error("Failed to load overrides:", err);
    }
  }, [key]);

  const loadHistory = useCallback(async (limit = 50) => {
    if (!key) return;

    try {
      const response = await fetchJson<{ data: RolloutEvent[] }>(
        `${API_BASE}/feature-flags/${key}/history?limit=${limit}`
      );
      setHistory(response.data);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, [key]);

  const loadStats = useCallback(async (period: "hour" | "day" | "week" | "month" = "day") => {
    if (!key) return;

    try {
      const data = await fetchJson<FeatureUsageStats>(
        `${API_BASE}/feature-flags/${key}/stats?period=${period}`
      );
      setStats(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, [key]);

  const checkCanEnable = useCallback(async (): Promise<DependencyResolution> => {
    if (!key) throw new Error("No key provided");

    const data = await fetchJson<DependencyResolution>(
      `${API_BASE}/feature-flags/${key}/can-enable`
    );
    setDependencies(data);
    return data;
  }, [key]);

  const checkCanDisable = useCallback(async (): Promise<DependencyResolution> => {
    if (!key) throw new Error("No key provided");

    const data = await fetchJson<DependencyResolution>(
      `${API_BASE}/feature-flags/${key}/can-disable`
    );
    setDependencies(data);
    return data;
  }, [key]);

  useEffect(() => {
    if (key) {
      loadFlag();
    } else {
      setFlag(null);
      setSiteOverrides([]);
      setUserOverrides([]);
      setHistory([]);
      setStats(null);
      setDependencies(null);
    }
  }, [key, loadFlag]);

  return {
    flag,
    loading,
    error,
    siteOverrides,
    userOverrides,
    history,
    stats,
    dependencies,
    loadFlag,
    loadOverrides,
    loadHistory,
    loadStats,
    checkCanEnable,
    checkCanDisable,
  };
}

// =============================================================================
// FEATURE EVALUATION HOOK
// =============================================================================

export interface UseFeatureEvaluationReturn {
  isEnabled: boolean;
  variant: string | null;
  loading: boolean;
  error: string | null;
  result: EvaluationResult | null;
  evaluate: () => Promise<void>;
}

export function useFeatureEvaluation(
  featureKey: string,
  context: EvaluationContext
): UseFeatureEvaluationReturn {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson<EvaluationResult>(`${API_BASE}/feature-flags/evaluate`, {
        method: "POST",
        body: JSON.stringify({ featureKey, context }),
      });

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evaluate feature");
    } finally {
      setLoading(false);
    }
  }, [featureKey, context]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  return {
    isEnabled: result?.enabled ?? false,
    variant: result?.variant ?? null,
    loading,
    error,
    result,
    evaluate,
  };
}

// =============================================================================
// OVERRIDES HOOKS
// =============================================================================

export interface UseSiteOverrideReturn {
  setSiteOverride: (siteId: string, featureKey: string, data: SiteOverrideFormData) => Promise<SiteFeatureOverride>;
  deleteSiteOverride: (siteId: string, featureKey: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useSiteOverride(): UseSiteOverrideReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSiteOverride = useCallback(async (
    siteId: string,
    featureKey: string,
    data: SiteOverrideFormData
  ): Promise<SiteFeatureOverride> => {
    setLoading(true);
    setError(null);

    try {
      return await fetchJson<SiteFeatureOverride>(
        `${API_BASE}/feature-flags/${featureKey}/site-overrides/${siteId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to set override";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSiteOverride = useCallback(async (siteId: string, featureKey: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await fetchJson<void>(
        `${API_BASE}/feature-flags/${featureKey}/site-overrides/${siteId}`,
        { method: "DELETE" }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete override";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { setSiteOverride, deleteSiteOverride, loading, error };
}

export interface UseUserOverrideReturn {
  setUserOverride: (userId: string, featureKey: string, data: UserOverrideFormData) => Promise<UserFeatureOverride>;
  deleteUserOverride: (userId: string, featureKey: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useUserOverride(): UseUserOverrideReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUserOverride = useCallback(async (
    userId: string,
    featureKey: string,
    data: UserOverrideFormData
  ): Promise<UserFeatureOverride> => {
    setLoading(true);
    setError(null);

    try {
      return await fetchJson<UserFeatureOverride>(
        `${API_BASE}/feature-flags/${featureKey}/user-overrides/${userId}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to set override";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteUserOverride = useCallback(async (userId: string, featureKey: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await fetchJson<void>(
        `${API_BASE}/feature-flags/${featureKey}/user-overrides/${userId}`,
        { method: "DELETE" }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete override";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { setUserOverride, deleteUserOverride, loading, error };
}

// =============================================================================
// ROLLOUT HISTORY HOOK
// =============================================================================

export interface UseRolloutHistoryReturn {
  events: RolloutEvent[];
  loading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

export function useRolloutHistory(featureKey?: string): UseRolloutHistoryReturn {
  const [events, setEvents] = useState<RolloutEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadMore = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = featureKey
        ? `${API_BASE}/feature-flags/${featureKey}/history?limit=50&offset=${offset}`
        : `${API_BASE}/feature-flags/history?limit=50&offset=${offset}`;

      const response = await fetchJson<{ data: RolloutEvent[]; total: number }>(url);

      setEvents((prev) => [...prev, ...response.data]);
      setOffset((prev) => prev + response.data.length);
      setHasMore(response.data.length === 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [featureKey, offset]);

  useEffect(() => {
    setEvents([]);
    setOffset(0);
    setHasMore(true);
    loadMore();
  }, [featureKey]);

  return { events, loading, error, loadMore, hasMore };
}
