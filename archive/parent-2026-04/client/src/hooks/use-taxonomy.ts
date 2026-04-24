/**
 * @file use-taxonomy.ts
 * @description React hooks for the RSES Taxonomy/Vocabulary API.
 *
 * @phase CMS Transformation - Auto-Link Integration
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  vocabularyApi,
  termApi,
  classificationApi,
  taxonomyStatsApi,
  buildTaxonomyUrl,
  type VocabularyDTO,
  type TermDTO,
  type ClassificationResultDTO,
  type BatchClassificationResultDTO,
  type ReclassificationPlanDTO,
} from "@shared/taxonomy-routes";

// ============================================================================
// API FETCH HELPERS
// ============================================================================

async function taxonomyFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `Request failed: ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// ============================================================================
// VOCABULARY HOOKS
// ============================================================================

/**
 * Extended vocabulary type with stats.
 */
export interface VocabularyWithStats extends VocabularyDTO {
  termCount: number;
  contentCount: number;
}

/**
 * Hook to list all vocabularies with stats.
 */
export function useVocabularies() {
  return useQuery<VocabularyWithStats[]>({
    queryKey: ["taxonomy", "vocabularies"],
    queryFn: () => taxonomyFetch(vocabularyApi.list.path),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get a single vocabulary.
 */
export function useVocabulary(id: string) {
  return useQuery<VocabularyDTO>({
    queryKey: ["taxonomy", "vocabularies", id],
    queryFn: () =>
      taxonomyFetch(buildTaxonomyUrl(vocabularyApi.get.path, { id })),
    enabled: !!id,
  });
}

/**
 * Hook to sync vocabularies from RSES config.
 */
export function useSyncVocabularies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      taxonomyFetch(vocabularyApi.sync.path, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy", "vocabularies"] });
    },
  });
}

// ============================================================================
// TERM HOOKS
// ============================================================================

/**
 * Options for listing terms.
 */
export interface TermListOptions {
  parentId?: string | null;
  includeChildren?: boolean;
  sortBy?: "value" | "label" | "contentCount" | "createdAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/**
 * Hook to list terms in a vocabulary.
 */
export function useTerms(vocabularyId: string, options?: TermListOptions) {
  return useQuery<{ terms: TermDTO[]; total: number }>({
    queryKey: ["taxonomy", "vocabularies", vocabularyId, "terms", options],
    queryFn: () => {
      const path = buildTaxonomyUrl(termApi.list.path, { vocabularyId });
      const params = new URLSearchParams();
      if (options?.parentId !== undefined) {
        params.set("parentId", options.parentId === null ? "null" : options.parentId);
      }
      if (options?.includeChildren) params.set("includeChildren", "true");
      if (options?.sortBy) params.set("sortBy", options.sortBy);
      if (options?.sortOrder) params.set("sortOrder", options.sortOrder);
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      const queryString = params.toString();
      return taxonomyFetch(`${path}${queryString ? `?${queryString}` : ""}`);
    },
    enabled: !!vocabularyId,
  });
}

/**
 * Term tree node.
 */
export interface TermTreeNode {
  term: TermDTO;
  children: TermTreeNode[];
}

/**
 * Hook to get term tree for a vocabulary.
 */
export function useTermTree(vocabularyId: string) {
  return useQuery<TermTreeNode[]>({
    queryKey: ["taxonomy", "vocabularies", vocabularyId, "terms", "tree"],
    queryFn: () =>
      taxonomyFetch(buildTaxonomyUrl(termApi.tree.path, { vocabularyId })),
    enabled: !!vocabularyId,
  });
}

/**
 * Hook to get a single term with content refs.
 */
export function useTerm(vocabularyId: string, termId: string) {
  return useQuery<TermDTO & { contentRefs: any[] }>({
    queryKey: ["taxonomy", "vocabularies", vocabularyId, "terms", termId],
    queryFn: () =>
      taxonomyFetch(buildTaxonomyUrl(termApi.get.path, { vocabularyId, termId })),
    enabled: !!vocabularyId && !!termId,
  });
}

/**
 * Hook to search terms across vocabularies.
 */
export function useTermSearch(
  query: string,
  options?: {
    vocabularyIds?: string[];
    matchType?: "exact" | "prefix" | "contains";
    limit?: number;
  }
) {
  return useQuery<Array<TermDTO & { vocabularyName: string }>>({
    queryKey: ["taxonomy", "terms", "search", query, options],
    queryFn: () => {
      const params = new URLSearchParams({ q: query });
      if (options?.vocabularyIds) {
        params.set("vocabularyIds", options.vocabularyIds.join(","));
      }
      if (options?.matchType) params.set("matchType", options.matchType);
      if (options?.limit) params.set("limit", String(options.limit));
      return taxonomyFetch(`${termApi.search.path}?${params}`);
    },
    enabled: query.length >= 1,
    staleTime: 10000,
  });
}

// ============================================================================
// CLASSIFICATION HOOKS
// ============================================================================

/**
 * Hook to classify a single content item.
 */
export function useClassify() {
  const queryClient = useQueryClient();

  return useMutation<
    ClassificationResultDTO & { symlinksCreated: any[] },
    Error,
    {
      contentPath: string;
      contentName?: string;
      attributes?: Record<string, string>;
      options?: {
        force?: boolean;
        vocabularies?: string[];
        dryRun?: boolean;
        createSymlinks?: boolean;
      };
    }
  >({
    mutationFn: (data) =>
      taxonomyFetch(classificationApi.classify.path, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["taxonomy", "vocabularies"] });
      queryClient.invalidateQueries({ queryKey: ["taxonomy", "stats"] });
    },
  });
}

/**
 * Hook to batch classify content.
 */
export function useBatchClassify() {
  const queryClient = useQueryClient();

  return useMutation<
    BatchClassificationResultDTO & { results: ClassificationResultDTO[] },
    Error,
    {
      contents: Array<{
        path: string;
        name?: string;
        attributes?: Record<string, string>;
      }>;
      options?: {
        force?: boolean;
        vocabularies?: string[];
        dryRun?: boolean;
        createSymlinks?: boolean;
      };
    }
  >({
    mutationFn: (data) =>
      taxonomyFetch(classificationApi.batch.path, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
    },
  });
}

/**
 * Hook to scan and classify a directory.
 */
export function useScanAndClassify() {
  const queryClient = useQueryClient();

  return useMutation<
    BatchClassificationResultDTO & { directoriesScanned: number },
    Error,
    {
      rootPath: string;
      maxDepth?: number;
      options?: {
        force?: boolean;
        dryRun?: boolean;
        createSymlinks?: boolean;
      };
    }
  >({
    mutationFn: (data) =>
      taxonomyFetch(classificationApi.scan.path, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
    },
  });
}

/**
 * Hook to create a re-classification plan.
 */
export function useCreateReclassificationPlan() {
  return useMutation<ReclassificationPlanDTO, Error, { newConfigContent: string }>({
    mutationFn: (data) =>
      taxonomyFetch(classificationApi.planReclassification.path, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

/**
 * Hook to execute a re-classification plan.
 */
export function useExecuteReclassificationPlan() {
  const queryClient = useQueryClient();

  return useMutation<BatchClassificationResultDTO, Error, { planId: string }>({
    mutationFn: ({ planId }) =>
      taxonomyFetch(
        buildTaxonomyUrl(classificationApi.executeReclassification.path, { planId }),
        { method: "POST" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
    },
  });
}

// ============================================================================
// CONTENT HOOKS
// ============================================================================

/**
 * Hook to get content by term.
 */
export function useContentByTerm(
  vocabularyId: string,
  termId: string,
  options?: {
    limit?: number;
    offset?: number;
    sortBy?: "name" | "classifiedAt" | "confidence";
    sortOrder?: "asc" | "desc";
  }
) {
  return useQuery<{ content: any[]; total: number }>({
    queryKey: ["taxonomy", "vocabularies", vocabularyId, "terms", termId, "content", options],
    queryFn: () => {
      const path = buildTaxonomyUrl(
        "/api/taxonomy/vocabularies/:vocabularyId/terms/:termId/content",
        { vocabularyId, termId }
      );
      const params = new URLSearchParams();
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.sortBy) params.set("sortBy", options.sortBy);
      if (options?.sortOrder) params.set("sortOrder", options.sortOrder);
      const queryString = params.toString();
      return taxonomyFetch(`${path}${queryString ? `?${queryString}` : ""}`);
    },
    enabled: !!vocabularyId && !!termId,
  });
}

// ============================================================================
// STATS HOOKS
// ============================================================================

/**
 * Taxonomy overview stats.
 */
export interface TaxonomyStats {
  vocabularyCount: number;
  termCount: number;
  classifiedContentCount: number;
  symlinkCount: number;
  lastClassificationAt: string | null;
  configVersion: number | null;
}

/**
 * Hook to get overall taxonomy statistics.
 */
export function useTaxonomyStats() {
  return useQuery<TaxonomyStats>({
    queryKey: ["taxonomy", "stats"],
    queryFn: () => taxonomyFetch(taxonomyStatsApi.overview.path),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Vocabulary stats with most used terms.
 */
export interface VocabularyStats {
  id: string;
  name: string;
  termCount: number;
  contentCount: number;
  avgTermsPerContent: number;
  mostUsedTerms: Array<{
    termId: string;
    termValue: string;
    contentCount: number;
  }>;
}

/**
 * Hook to get vocabulary statistics.
 */
export function useVocabularyStats() {
  return useQuery<VocabularyStats[]>({
    queryKey: ["taxonomy", "stats", "vocabularies"],
    queryFn: () => taxonomyFetch(taxonomyStatsApi.byVocabulary.path),
    staleTime: 60000,
  });
}

// ============================================================================
// INITIALIZATION HOOK
// ============================================================================

/**
 * Hook to initialize the taxonomy engine.
 */
export function useInitTaxonomy() {
  const queryClient = useQueryClient();

  return useMutation<
    { message: string; success: boolean },
    Error,
    {
      rsesConfigContent: string;
      symlinkBaseDir: string;
      enableAutoSymlinks?: boolean;
    }
  >({
    mutationFn: (data) =>
      taxonomyFetch("/api/taxonomy/init", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
    },
  });
}

// ============================================================================
// COMBINED HOOK FOR EASY ACCESS
// ============================================================================

/**
 * Combined hook providing access to all taxonomy functionality.
 */
export function useTaxonomy() {
  return {
    // Vocabularies
    useVocabularies,
    useVocabulary,
    useSyncVocabularies,
    // Terms
    useTerms,
    useTermTree,
    useTerm,
    useTermSearch,
    // Classification
    useClassify,
    useBatchClassify,
    useScanAndClassify,
    useCreateReclassificationPlan,
    useExecuteReclassificationPlan,
    // Content
    useContentByTerm,
    // Stats
    useTaxonomyStats,
    useVocabularyStats,
    // Init
    useInitTaxonomy,
  };
}

export default useTaxonomy;
