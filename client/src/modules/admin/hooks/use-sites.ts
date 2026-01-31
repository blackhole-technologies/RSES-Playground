/**
 * @file use-sites.ts
 * @description React hooks for multi-site management
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import { useState, useCallback, useEffect } from "react";
import type {
  SiteConfig,
  SiteAction,
  BulkOperation,
  ResourceUsage,
  SiteHealthStatus,
} from "@shared/admin/types";
import type { SiteFilterState, PaginationState } from "../types";

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
// SITES HOOK
// =============================================================================

export interface UseSitesOptions {
  autoLoad?: boolean;
  filter?: Partial<SiteFilterState>;
}

export interface UseSitesReturn {
  sites: SiteConfig[];
  loading: boolean;
  error: string | null;
  pagination: PaginationState;

  // Actions
  loadSites: (filter?: Partial<SiteFilterState>) => Promise<void>;
  refreshSites: () => Promise<void>;

  // Site actions
  performAction: (siteId: string, action: SiteAction) => Promise<void>;
  bulkAction: (siteIds: string[], action: SiteAction) => Promise<void>;

  // Pagination
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export function useSites(options: UseSitesOptions = {}): UseSitesReturn {
  const { autoLoad = true, filter: initialFilter } = options;

  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 20,
    total: 0,
  });

  const loadSites = useCallback(async (filter?: Partial<SiteFilterState>) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (filter?.search) params.set("search", filter.search);
      if (filter?.environments?.length) params.set("environments", filter.environments.join(","));
      if (filter?.healthStatus?.length) params.set("healthStatus", filter.healthStatus.join(","));
      if (filter?.regions?.length) params.set("regions", filter.regions.join(","));
      if (filter?.tags?.length) params.set("tags", filter.tags.join(","));

      params.set("limit", String(pagination.pageSize));
      params.set("offset", String((pagination.page - 1) * pagination.pageSize));

      const response = await fetchJson<{ data: SiteConfig[]; total: number }>(
        `${API_BASE}/sites?${params.toString()}`
      );

      setSites(response.data);
      setPagination((prev) => ({ ...prev, total: response.total }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  const refreshSites = useCallback(async () => {
    await loadSites(initialFilter);
  }, [loadSites, initialFilter]);

  const performAction = useCallback(async (siteId: string, action: SiteAction) => {
    await fetchJson(`${API_BASE}/sites/${siteId}/actions/${action}`, {
      method: "POST",
    });

    // Refresh site data
    await refreshSites();
  }, [refreshSites]);

  const bulkAction = useCallback(async (siteIds: string[], action: SiteAction) => {
    await fetchJson(`${API_BASE}/sites/bulk-action`, {
      method: "POST",
      body: JSON.stringify({ siteIds, action }),
    });

    // Refresh site data
    await refreshSites();
  }, [refreshSites]);

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  useEffect(() => {
    if (autoLoad) {
      loadSites(initialFilter);
    }
  }, [autoLoad, loadSites, initialFilter]);

  return {
    sites,
    loading,
    error,
    pagination,
    loadSites,
    refreshSites,
    performAction,
    bulkAction,
    setPage,
    setPageSize,
  };
}

// =============================================================================
// SINGLE SITE HOOK
// =============================================================================

export interface UseSiteReturn {
  site: SiteConfig | null;
  loading: boolean;
  error: string | null;

  // Related data
  metrics: ResourceUsage[];
  featureOverrides: Array<{ featureKey: string; enabled: boolean }>;

  // Actions
  loadSite: () => Promise<void>;
  loadMetrics: (period?: "hour" | "day" | "week") => Promise<void>;
  loadFeatureOverrides: () => Promise<void>;
  performAction: (action: SiteAction) => Promise<void>;
  updateSite: (updates: Partial<SiteConfig>) => Promise<void>;
}

export function useSite(siteId: string | null): UseSiteReturn {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<ResourceUsage[]>([]);
  const [featureOverrides, setFeatureOverrides] = useState<Array<{ featureKey: string; enabled: boolean }>>([]);

  const loadSite = useCallback(async () => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson<SiteConfig>(`${API_BASE}/sites/${siteId}`);
      setSite(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load site");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const loadMetrics = useCallback(async (period: "hour" | "day" | "week" = "day") => {
    if (!siteId) return;

    try {
      const data = await fetchJson<{ data: ResourceUsage[] }>(
        `${API_BASE}/sites/${siteId}/metrics?period=${period}`
      );
      setMetrics(data.data);
    } catch (err) {
      console.error("Failed to load metrics:", err);
    }
  }, [siteId]);

  const loadFeatureOverrides = useCallback(async () => {
    if (!siteId) return;

    try {
      const data = await fetchJson<{ data: Array<{ featureKey: string; enabled: boolean }> }>(
        `${API_BASE}/sites/${siteId}/feature-overrides`
      );
      setFeatureOverrides(data.data);
    } catch (err) {
      console.error("Failed to load feature overrides:", err);
    }
  }, [siteId]);

  const performAction = useCallback(async (action: SiteAction) => {
    if (!siteId) throw new Error("No site selected");

    await fetchJson(`${API_BASE}/sites/${siteId}/actions/${action}`, {
      method: "POST",
    });

    await loadSite();
  }, [siteId, loadSite]);

  const updateSite = useCallback(async (updates: Partial<SiteConfig>) => {
    if (!siteId) throw new Error("No site selected");

    const data = await fetchJson<SiteConfig>(`${API_BASE}/sites/${siteId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });

    setSite(data);
  }, [siteId]);

  useEffect(() => {
    if (siteId) {
      loadSite();
    } else {
      setSite(null);
      setMetrics([]);
      setFeatureOverrides([]);
    }
  }, [siteId, loadSite]);

  return {
    site,
    loading,
    error,
    metrics,
    featureOverrides,
    loadSite,
    loadMetrics,
    loadFeatureOverrides,
    performAction,
    updateSite,
  };
}

// =============================================================================
// SITE HEALTH HOOK
// =============================================================================

export interface UseSiteHealthReturn {
  healthData: Array<{
    siteId: string;
    siteName: string;
    status: SiteHealthStatus;
    uptime: number;
    lastCheck: string;
  }>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSiteHealth(siteIds?: string[]): UseSiteHealthReturn {
  const [healthData, setHealthData] = useState<UseSiteHealthReturn["healthData"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = siteIds?.length ? `?siteIds=${siteIds.join(",")}` : "";
      const data = await fetchJson<{ data: UseSiteHealthReturn["healthData"] }>(
        `${API_BASE}/sites/health${params}`
      );
      setHealthData(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load health data");
    } finally {
      setLoading(false);
    }
  }, [siteIds]);

  useEffect(() => {
    refresh();

    // Auto-refresh every 30 seconds
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { healthData, loading, error, refresh };
}

// =============================================================================
// SITE COMPARISON HOOK
// =============================================================================

export interface UseSiteComparisonReturn {
  sites: SiteConfig[];
  loading: boolean;
  error: string | null;

  // Comparison data
  featureDifferences: Array<{
    featureKey: string;
    siteStates: Record<string, boolean>;
  }>;
  configDifferences: Array<{
    key: string;
    siteValues: Record<string, unknown>;
  }>;

  addSite: (siteId: string) => Promise<void>;
  removeSite: (siteId: string) => void;
  compare: () => Promise<void>;
}

export function useSiteComparison(initialSiteIds: string[] = []): UseSiteComparisonReturn {
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [featureDifferences, setFeatureDifferences] = useState<UseSiteComparisonReturn["featureDifferences"]>([]);
  const [configDifferences, setConfigDifferences] = useState<UseSiteComparisonReturn["configDifferences"]>([]);

  const addSite = useCallback(async (siteId: string) => {
    if (sites.find((s) => s.id === siteId)) return;

    setLoading(true);
    try {
      const site = await fetchJson<SiteConfig>(`${API_BASE}/sites/${siteId}`);
      setSites((prev) => [...prev, site]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add site");
    } finally {
      setLoading(false);
    }
  }, [sites]);

  const removeSite = useCallback((siteId: string) => {
    setSites((prev) => prev.filter((s) => s.id !== siteId));
  }, []);

  const compare = useCallback(async () => {
    if (sites.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchJson<{
        featureDifferences: UseSiteComparisonReturn["featureDifferences"];
        configDifferences: UseSiteComparisonReturn["configDifferences"];
      }>(`${API_BASE}/sites/compare`, {
        method: "POST",
        body: JSON.stringify({ siteIds: sites.map((s) => s.id) }),
      });

      setFeatureDifferences(response.featureDifferences);
      setConfigDifferences(response.configDifferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compare sites");
    } finally {
      setLoading(false);
    }
  }, [sites]);

  useEffect(() => {
    for (const siteId of initialSiteIds) {
      addSite(siteId);
    }
  }, []);

  useEffect(() => {
    if (sites.length >= 2) {
      compare();
    }
  }, [sites.length, compare]);

  return {
    sites,
    loading,
    error,
    featureDifferences,
    configDifferences,
    addSite,
    removeSite,
    compare,
  };
}
