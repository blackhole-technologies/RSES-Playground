/**
 * @file use-autolink.ts
 * @description React hooks for workbench autolink functionality.
 * @phase Phase 8 - Backend to Frontend Connection
 */

import { useMutation } from "@tanstack/react-query";
import { workbenchApi } from "@shared/routes";
import { z } from "zod";

// Types inferred from API schemas
type AutolinkInput = z.infer<typeof workbenchApi.autolink.input>;
type AutolinkResponse = z.infer<typeof workbenchApi.autolink.responses[200]>;

type ScanInput = z.infer<typeof workbenchApi.scan.input>;
type ScanResponse = z.infer<typeof workbenchApi.scan.responses[200]>;

type BulkAutolinkInput = z.infer<typeof workbenchApi.bulkAutolink.input>;
type BulkAutolinkResponse = z.infer<typeof workbenchApi.bulkAutolink.responses[200]>;

/**
 * Hook for creating symlinks for a single project.
 *
 * @example
 * ```tsx
 * const autolink = useAutolinkProject();
 *
 * const handleAutolink = () => {
 *   autolink.mutate({
 *     projectPath: '/path/to/project',
 *     configContent: configText,
 *   });
 * };
 * ```
 */
export function useAutolinkProject() {
  return useMutation<AutolinkResponse, Error, AutolinkInput>({
    mutationFn: async (data) => {
      const res = await fetch(workbenchApi.autolink.path, {
        method: workbenchApi.autolink.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(error.message || `Autolink failed: ${res.status}`);
      }

      return workbenchApi.autolink.responses[200].parse(await res.json());
    },
  });
}

/**
 * Hook for scanning a directory and classifying projects.
 *
 * @example
 * ```tsx
 * const scan = useWorkbenchScan();
 *
 * const handleScan = () => {
 *   scan.mutate({
 *     rootPath: '/path/to/projects',
 *     configContent: configText,
 *   });
 * };
 * ```
 */
export function useWorkbenchScan() {
  return useMutation<ScanResponse, Error, ScanInput>({
    mutationFn: async (data) => {
      const res = await fetch(workbenchApi.scan.path, {
        method: workbenchApi.scan.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(error.message || `Scan failed: ${res.status}`);
      }

      return workbenchApi.scan.responses[200].parse(await res.json());
    },
  });
}

/**
 * Hook for creating symlinks for multiple projects at once.
 *
 * @example
 * ```tsx
 * const bulkAutolink = useBulkAutolink();
 *
 * const handleBulkAutolink = () => {
 *   bulkAutolink.mutate({
 *     projectPaths: ['/path/to/project1', '/path/to/project2'],
 *     configContent: configText,
 *   });
 * };
 * ```
 */
export function useBulkAutolink() {
  return useMutation<BulkAutolinkResponse, Error, BulkAutolinkInput>({
    mutationFn: async (data) => {
      const res = await fetch(workbenchApi.bulkAutolink.path, {
        method: workbenchApi.bulkAutolink.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(error.message || `Bulk autolink failed: ${res.status}`);
      }

      return workbenchApi.bulkAutolink.responses[200].parse(await res.json());
    },
  });
}

// Re-export types for consumers
export type { AutolinkInput, AutolinkResponse, ScanInput, ScanResponse, BulkAutolinkInput, BulkAutolinkResponse };
