/**
 * @file index.ts
 * @description Admin Module Client Types
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

// Re-export all shared types
export * from "@shared/admin/types";

// =============================================================================
// CLIENT-SPECIFIC TYPES
// =============================================================================

/**
 * Feature flag list view mode
 */
export type ViewMode = "grid" | "list" | "table";

/**
 * Feature flag sort options
 */
export type SortOption = "name" | "category" | "createdAt" | "updatedAt" | "usage";
export type SortOrder = "asc" | "desc";

/**
 * Filter state for feature flags
 */
export interface FeatureFlagFilterState {
  search: string;
  categories: string[];
  tags: string[];
  enabled: boolean | null;
  hasOverrides: boolean | null;
  owner: string;
  sortBy: SortOption;
  sortOrder: SortOrder;
}

/**
 * Site filter state
 */
export interface SiteFilterState {
  search: string;
  environments: string[];
  healthStatus: string[];
  regions: string[];
  tags: string[];
  sortBy: "name" | "health" | "uptime" | "updatedAt";
  sortOrder: SortOrder;
}

/**
 * Dashboard widget position
 */
export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Widget drag state
 */
export interface DragState {
  isDragging: boolean;
  widgetId: string | null;
  startPosition: { x: number; y: number } | null;
}

/**
 * Confirmation modal props
 */
export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "destructive" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  requireConfirmation?: boolean;
  confirmationText?: string;
}

/**
 * Toast notification
 */
export interface ToastNotification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
}

/**
 * Bulk action
 */
export interface BulkAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "destructive";
  confirmRequired?: boolean;
  confirmMessage?: string;
}

/**
 * Table column definition
 */
export interface TableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (item: T) => React.ReactNode;
}

/**
 * Pagination state
 */
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  total?: number;
  message?: string;
}

/**
 * API error response
 */
export interface ApiError {
  message: string;
  field?: string;
  errors?: Array<{ path: string; message: string }>;
}

// =============================================================================
// CHART DATA TYPES
// =============================================================================

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
}

/**
 * Chart data for usage visualization
 */
export interface UsageChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }>;
}

/**
 * Resource usage chart data
 */
export interface ResourceChartData {
  cpu: TimeSeriesDataPoint[];
  memory: TimeSeriesDataPoint[];
  disk: TimeSeriesDataPoint[];
  network: {
    in: TimeSeriesDataPoint[];
    out: TimeSeriesDataPoint[];
  };
}

// =============================================================================
// DEPENDENCY GRAPH TYPES
// =============================================================================

/**
 * Graph node for visualization
 */
export interface GraphNode {
  id: string;
  label: string;
  enabled: boolean;
  category: string;
  x?: number;
  y?: number;
}

/**
 * Graph edge for visualization
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: "requires" | "optional";
}

/**
 * Complete graph data
 */
export interface DependencyGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// =============================================================================
// FORM TYPES
// =============================================================================

/**
 * Feature flag form data
 */
export interface FeatureFlagFormData {
  key: string;
  name: string;
  description: string;
  category: string;
  globallyEnabled: boolean;
  toggleable: boolean;
  defaultState: boolean;
  tags: string[];
  owner: string;
  documentationUrl: string;
  issueKey: string;
  percentageRollout: {
    enabled: boolean;
    percentage: number;
    bucketBy: string[];
  };
  targetingRules: Array<{
    id: string;
    attribute: string;
    operator: string;
    value: string | string[];
    variation: boolean;
  }>;
  dependencies: Array<{
    featureKey: string;
    requiredState: boolean;
  }>;
}

/**
 * Site override form data
 */
export interface SiteOverrideFormData {
  enabled: boolean;
  percentageRollout?: {
    enabled: boolean;
    percentage: number;
  };
  targetingRules?: Array<{
    id: string;
    attribute: string;
    operator: string;
    value: string | string[];
    variation: boolean;
  }>;
}

/**
 * User override form data
 */
export interface UserOverrideFormData {
  enabled: boolean;
  reason?: string;
  expiresAt?: string;
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/**
 * Admin context state
 */
export interface AdminContextState {
  // Feature flags
  flags: import("@shared/admin/types").FeatureFlag[];
  selectedFlagKey: string | null;
  flagFilter: FeatureFlagFilterState;
  flagsLoading: boolean;
  flagsError: string | null;

  // Sites
  sites: import("@shared/admin/types").SiteConfig[];
  selectedSiteId: string | null;
  siteFilter: SiteFilterState;
  sitesLoading: boolean;
  sitesError: string | null;

  // UI state
  viewMode: ViewMode;
  selectedItems: string[];
  isDrawerOpen: boolean;
  drawerContent: "flag" | "site" | "override" | null;

  // Confirmation
  confirmation: ConfirmationModalProps | null;
}

/**
 * Admin context actions
 */
export interface AdminContextActions {
  // Feature flags
  loadFlags: () => Promise<void>;
  createFlag: (data: FeatureFlagFormData) => Promise<void>;
  updateFlag: (key: string, data: Partial<FeatureFlagFormData>) => Promise<void>;
  deleteFlag: (key: string) => Promise<void>;
  enableFlag: (key: string) => Promise<void>;
  disableFlag: (key: string) => Promise<void>;
  selectFlag: (key: string | null) => void;
  setFlagFilter: (filter: Partial<FeatureFlagFilterState>) => void;

  // Sites
  loadSites: () => Promise<void>;
  selectSite: (id: string | null) => void;
  setSiteFilter: (filter: Partial<SiteFilterState>) => void;

  // Overrides
  setSiteOverride: (siteId: string, featureKey: string, data: SiteOverrideFormData) => Promise<void>;
  deleteSiteOverride: (siteId: string, featureKey: string) => Promise<void>;
  setUserOverride: (userId: string, featureKey: string, data: UserOverrideFormData) => Promise<void>;
  deleteUserOverride: (userId: string, featureKey: string) => Promise<void>;

  // UI
  setViewMode: (mode: ViewMode) => void;
  toggleItemSelection: (id: string) => void;
  selectAllItems: (ids: string[]) => void;
  clearSelection: () => void;
  openDrawer: (content: "flag" | "site" | "override") => void;
  closeDrawer: () => void;

  // Confirmation
  showConfirmation: (config: Omit<ConfirmationModalProps, "isOpen" | "onConfirm" | "onCancel">, onConfirm: () => void) => void;
  hideConfirmation: () => void;

  // Bulk operations
  bulkEnable: (keys: string[]) => Promise<void>;
  bulkDisable: (keys: string[]) => Promise<void>;
  bulkDelete: (keys: string[]) => Promise<void>;
}
