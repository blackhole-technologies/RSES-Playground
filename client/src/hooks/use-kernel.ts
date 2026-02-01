/**
 * @file use-kernel.ts
 * @description React hooks for kernel module management.
 *
 * Provides CRUD operations and real-time status for kernel modules
 * using TanStack React Query for server state management.
 *
 * @module hooks/use-kernel
 * @phase Phase 2 - Admin UI
 * @created 2026-02-01
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Module tier classification.
 */
export type ModuleTier = "kernel" | "core" | "optional" | "third-party";

/**
 * Module lifecycle state.
 */
export type ModuleState =
  | "registered"
  | "initializing"
  | "ready"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed"
  | "unloaded";

/**
 * Module health status.
 */
export interface ModuleHealth {
  status: "healthy" | "degraded" | "unhealthy";
  message?: string;
  timestamp?: string;
  metrics?: Record<string, number>;
}

/**
 * Module dependency declaration.
 */
export interface ModuleDependency {
  moduleId: string;
  version: string;
  optional?: boolean;
  reason?: string;
}

/**
 * Module event declarations.
 */
export interface ModuleEvents {
  emits?: string[];
  listens?: string[];
}

/**
 * Kernel module summary (list view).
 */
export interface KernelModuleSummary {
  id: string;
  name: string;
  version: string;
  tier: ModuleTier;
  state: ModuleState;
  enabled: boolean;
  health?: ModuleHealth;
}

/**
 * Kernel module details (full view).
 */
export interface KernelModuleDetails extends KernelModuleSummary {
  description: string;
  dependencies: ModuleDependency[];
  events?: ModuleEvents;
}

/**
 * Kernel health response.
 */
export interface KernelHealth {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  modules: Record<string, ModuleHealth>;
}

/**
 * Kernel event from history.
 */
export interface KernelEvent {
  type: string;
  data: unknown;
  timestamp: string;
  source?: string;
  correlationId?: string;
}

/**
 * Module config schema field info.
 */
export interface ModuleConfigField {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "enum" | "unknown";
  required: boolean;
  default?: unknown;
  description?: string;
}

/**
 * Module configuration response.
 */
export interface ModuleConfigResponse {
  moduleId: string;
  config: Record<string, unknown>;
  schema: ModuleConfigField[];
  hasSchema: boolean;
  supportsHotReload: boolean;
}

// =============================================================================
// API PATHS
// =============================================================================

const API_PATHS = {
  modules: "/api/kernel/modules",
  module: (id: string) => `/api/kernel/modules/${id}`,
  moduleConfig: (id: string) => `/api/kernel/modules/${id}/config`,
  enable: (id: string) => `/api/kernel/modules/${id}/enable`,
  disable: (id: string) => `/api/kernel/modules/${id}/disable`,
  install: "/api/kernel/modules/install",
  uninstall: (id: string) => `/api/kernel/modules/${id}/uninstall`,
  health: "/api/kernel/health",
  events: "/api/kernel/events",
} as const;

// =============================================================================
// QUERY KEYS
// =============================================================================

export const kernelKeys = {
  all: ["kernel"] as const,
  modules: () => [...kernelKeys.all, "modules"] as const,
  module: (id: string) => [...kernelKeys.modules(), id] as const,
  moduleConfig: (id: string) => [...kernelKeys.modules(), id, "config"] as const,
  health: () => [...kernelKeys.all, "health"] as const,
  events: (limit?: number) => [...kernelKeys.all, "events", limit] as const,
};

// =============================================================================
// FETCH HELPERS
// =============================================================================

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new Error(error.message || error.error || "Request failed");
  }

  return response.json();
}

// =============================================================================
// HOOKS - QUERIES
// =============================================================================

/**
 * Fetch all kernel modules.
 */
export function useKernelModules() {
  return useQuery({
    queryKey: kernelKeys.modules(),
    queryFn: async () => {
      const data = await fetchJson<{ modules: KernelModuleSummary[] }>(
        API_PATHS.modules
      );
      return data.modules;
    },
    staleTime: 5000, // Refresh every 5 seconds
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });
}

/**
 * Fetch a single module's details.
 */
export function useKernelModule(id: string | null) {
  return useQuery({
    queryKey: kernelKeys.module(id || ""),
    queryFn: async () => {
      if (!id) return null;
      return fetchJson<KernelModuleDetails>(API_PATHS.module(id));
    },
    enabled: !!id,
  });
}

/**
 * Fetch kernel health status.
 */
export function useKernelHealth() {
  return useQuery({
    queryKey: kernelKeys.health(),
    queryFn: () => fetchJson<KernelHealth>(API_PATHS.health),
    staleTime: 5000,
    refetchInterval: 15000, // Auto-refresh every 15 seconds
  });
}

/**
 * Fetch kernel event history.
 */
export function useKernelEvents(limit: number = 50) {
  return useQuery({
    queryKey: kernelKeys.events(limit),
    queryFn: async () => {
      const data = await fetchJson<{ events: KernelEvent[] }>(
        `${API_PATHS.events}?limit=${limit}`
      );
      return data.events;
    },
    staleTime: 2000,
    refetchInterval: 5000,
  });
}

// =============================================================================
// HOOKS - MUTATIONS
// =============================================================================

/**
 * Enable a module.
 */
export function useEnableModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (moduleId: string) => {
      return fetchJson<{ success: boolean; message: string }>(
        API_PATHS.enable(moduleId),
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kernelKeys.modules() });
      queryClient.invalidateQueries({ queryKey: kernelKeys.health() });
    },
  });
}

/**
 * Disable a module.
 */
export function useDisableModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      moduleId,
      force = false,
    }: {
      moduleId: string;
      force?: boolean;
    }) => {
      return fetchJson<{ success: boolean; message: string }>(
        API_PATHS.disable(moduleId),
        {
          method: "POST",
          body: JSON.stringify({ force }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kernelKeys.modules() });
      queryClient.invalidateQueries({ queryKey: kernelKeys.health() });
    },
  });
}

/**
 * Fetch module configuration.
 */
export function useModuleConfig(id: string | null) {
  return useQuery({
    queryKey: kernelKeys.moduleConfig(id || ""),
    queryFn: async () => {
      if (!id) return null;
      return fetchJson<ModuleConfigResponse>(API_PATHS.moduleConfig(id));
    },
    enabled: !!id,
  });
}

/**
 * Update module configuration.
 */
export function useUpdateModuleConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      moduleId,
      config,
    }: {
      moduleId: string;
      config: Record<string, unknown>;
    }) => {
      return fetchJson<{
        success: boolean;
        config: Record<string, unknown>;
        hotReloaded: boolean;
        persisted: boolean;
        message: string;
      }>(API_PATHS.moduleConfig(moduleId), {
        method: "PUT",
        body: JSON.stringify({ config }),
      });
    },
    onSuccess: (_, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: kernelKeys.moduleConfig(moduleId) });
      queryClient.invalidateQueries({ queryKey: kernelKeys.module(moduleId) });
    },
  });
}

/**
 * Install a new module.
 */
export function useInstallModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      moduleId,
      moduleCode,
    }: {
      moduleId: string;
      moduleCode: string;
    }) => {
      return fetchJson<{
        success: boolean;
        moduleId: string;
        name: string;
        version: string;
        message: string;
      }>(API_PATHS.install, {
        method: "POST",
        body: JSON.stringify({ moduleId, moduleCode }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kernelKeys.modules() });
      queryClient.invalidateQueries({ queryKey: kernelKeys.health() });
    },
  });
}

/**
 * Uninstall a module.
 */
export function useUninstallModule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      moduleId,
      force = false,
    }: {
      moduleId: string;
      force?: boolean;
    }) => {
      return fetchJson<{
        success: boolean;
        message: string;
      }>(API_PATHS.uninstall(moduleId), {
        method: "DELETE",
        body: JSON.stringify({ force }),
      });
    },
    onSuccess: (_, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: kernelKeys.modules() });
      queryClient.invalidateQueries({ queryKey: kernelKeys.health() });
      queryClient.invalidateQueries({ queryKey: kernelKeys.module(moduleId) });
    },
  });
}

// =============================================================================
// UTILITY HOOKS
// =============================================================================

/**
 * Check if kernel is available (ENABLE_KERNEL=true on server).
 */
export function useKernelAvailable() {
  return useQuery({
    queryKey: ["kernel-available"],
    queryFn: async () => {
      try {
        const response = await fetch(API_PATHS.health, {
          credentials: "include",
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    staleTime: 60000, // Check once per minute
    retry: false,
  });
}

/**
 * Get module status color for UI.
 */
export function getModuleStateColor(state: ModuleState): string {
  switch (state) {
    case "running":
      return "text-green-500";
    case "starting":
    case "initializing":
      return "text-yellow-500";
    case "stopping":
    case "stopped":
      return "text-gray-500";
    case "failed":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
}

/**
 * Get health status color for UI.
 */
export function getHealthColor(status: ModuleHealth["status"]): string {
  switch (status) {
    case "healthy":
      return "text-green-500";
    case "degraded":
      return "text-yellow-500";
    case "unhealthy":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
}

/**
 * Get tier badge color for UI.
 */
export function getTierColor(tier: ModuleTier): string {
  switch (tier) {
    case "kernel":
      return "bg-purple-100 text-purple-800";
    case "core":
      return "bg-blue-100 text-blue-800";
    case "optional":
      return "bg-green-100 text-green-800";
    case "third-party":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}
