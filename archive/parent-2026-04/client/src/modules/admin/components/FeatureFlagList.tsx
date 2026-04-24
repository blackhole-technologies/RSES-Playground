/**
 * @file FeatureFlagList.tsx
 * @description Feature flag list component with filtering and bulk actions
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureFlagCard } from "./FeatureFlagCard";
import type { FeatureFlag, FeatureCategory } from "@shared/admin/types";
import type { ViewMode, SortOption, SortOrder, FeatureFlagFilterState } from "../types";

// =============================================================================
// ICONS
// =============================================================================

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const GridIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const ListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// =============================================================================
// CONSTANTS
// =============================================================================

const categories: { value: FeatureCategory; label: string }[] = [
  { value: "core", label: "Core" },
  { value: "optional", label: "Optional" },
  { value: "beta", label: "Beta" },
  { value: "experimental", label: "Experimental" },
  { value: "deprecated", label: "Deprecated" },
];

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "category", label: "Category" },
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
  { value: "usage", label: "Usage" },
];

// =============================================================================
// COMPONENT
// =============================================================================

export interface FeatureFlagListProps {
  flags: FeatureFlag[];
  loading?: boolean;
  error?: string | null;

  // Filter state
  filter: FeatureFlagFilterState;
  onFilterChange: (filter: Partial<FeatureFlagFilterState>) => void;

  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;

  // Selection
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;

  // Actions
  onCreateFlag?: () => void;
  onToggleFlag?: (key: string, enabled: boolean) => Promise<void>;
  onEditFlag?: (key: string) => void;
  onDeleteFlag?: (key: string) => void;
  onViewFlag?: (key: string) => void;
  onViewHistory?: (key: string) => void;

  // Bulk actions
  onBulkEnable?: (keys: string[]) => Promise<void>;
  onBulkDisable?: (keys: string[]) => Promise<void>;
  onBulkDelete?: (keys: string[]) => Promise<void>;
}

export function FeatureFlagList({
  flags,
  loading,
  error,
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  selectedKeys,
  onSelectionChange,
  onCreateFlag,
  onToggleFlag,
  onEditFlag,
  onDeleteFlag,
  onViewFlag,
  onViewHistory,
  onBulkEnable,
  onBulkDisable,
  onBulkDelete,
}: FeatureFlagListProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Get unique tags from all flags
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    flags.forEach((f) => f.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [flags]);

  // Filter and sort flags
  const filteredFlags = useMemo(() => {
    let result = [...flags];

    // Apply filters
    if (filter.search) {
      const search = filter.search.toLowerCase();
      result = result.filter(
        (f) =>
          f.key.toLowerCase().includes(search) ||
          f.name.toLowerCase().includes(search) ||
          f.description.toLowerCase().includes(search)
      );
    }

    if (filter.categories.length > 0) {
      result = result.filter((f) => filter.categories.includes(f.category));
    }

    if (filter.tags.length > 0) {
      result = result.filter((f) => f.tags.some((t) => filter.tags.includes(t)));
    }

    if (filter.enabled !== null) {
      result = result.filter((f) => f.globallyEnabled === filter.enabled);
    }

    if (filter.owner) {
      result = result.filter((f) => f.owner === filter.owner);
    }

    // Apply sorting
    result.sort((a, b) => {
      let cmp = 0;
      switch (filter.sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "updatedAt":
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          cmp = 0;
      }
      return filter.sortOrder === "desc" ? -cmp : cmp;
    });

    return result;
  }, [flags, filter]);

  const toggleSelectAll = () => {
    if (selectedKeys.length === filteredFlags.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(filteredFlags.map((f) => f.key));
    }
  };

  const toggleSelect = (key: string) => {
    if (selectedKeys.includes(key)) {
      onSelectionChange(selectedKeys.filter((k) => k !== key));
    } else {
      onSelectionChange([...selectedKeys, key]);
    }
  };

  const activeFiltersCount =
    filter.categories.length +
    filter.tags.length +
    (filter.enabled !== null ? 1 : 0) +
    (filter.owner ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <SearchIcon />
            <Input
              placeholder="Search features..."
              value={filter.search}
              onChange={(e) => onFilterChange({ search: e.target.value })}
              className="pl-8"
            />
          </div>

          {/* Filter toggle */}
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => onViewModeChange("grid")}
            >
              <GridIcon />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-l-none"
              onClick={() => onViewModeChange("list")}
            >
              <ListIcon />
            </Button>
          </div>

          {/* Create button */}
          {onCreateFlag && (
            <Button onClick={onCreateFlag}>
              <PlusIcon />
              Create Flag
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 p-4 border rounded-lg bg-muted/50">
          {/* Category filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Categories</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {filter.categories.length === 0
                    ? "All"
                    : `${filter.categories.length} selected`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {categories.map((cat) => (
                  <DropdownMenuCheckboxItem
                    key={cat.value}
                    checked={filter.categories.includes(cat.value)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onFilterChange({ categories: [...filter.categories, cat.value] });
                      } else {
                        onFilterChange({
                          categories: filter.categories.filter((c) => c !== cat.value),
                        });
                      }
                    }}
                  >
                    {cat.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Tags filter */}
          {availableTags.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Tags</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {filter.tags.length === 0 ? "All" : `${filter.tags.length} selected`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {availableTags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag}
                      checked={filter.tags.includes(tag)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onFilterChange({ tags: [...filter.tags, tag] });
                        } else {
                          onFilterChange({ tags: filter.tags.filter((t) => t !== tag) });
                        }
                      }}
                    >
                      {tag}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Enabled filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Status</label>
            <Select
              value={filter.enabled === null ? "all" : filter.enabled ? "enabled" : "disabled"}
              onValueChange={(value) => {
                onFilterChange({
                  enabled: value === "all" ? null : value === "enabled",
                });
              }}
            >
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Sort by</label>
            <div className="flex gap-1">
              <Select
                value={filter.sortBy}
                onValueChange={(value) => onFilterChange({ sortBy: value as SortOption })}
              >
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onFilterChange({ sortOrder: filter.sortOrder === "asc" ? "desc" : "asc" })
                }
              >
                {filter.sortOrder === "asc" ? "ASC" : "DESC"}
              </Button>
            </div>
          </div>

          {/* Clear filters */}
          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onFilterChange({
                  categories: [],
                  tags: [],
                  enabled: null,
                  owner: "",
                })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Selection actions */}
      {selectedKeys.length > 0 && (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-primary/5">
          <Checkbox
            checked={selectedKeys.length === filteredFlags.length}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedKeys.length} selected
          </span>
          <div className="flex-1" />
          {onBulkEnable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkEnable(selectedKeys)}
            >
              Enable
            </Button>
          )}
          {onBulkDisable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkDisable(selectedKeys)}
            >
              Disable
            </Button>
          )}
          {onBulkDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onBulkDelete(selectedKeys)}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onSelectionChange([])}>
            Cancel
          </Button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredFlags.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">
            {flags.length === 0
              ? "No feature flags yet. Create your first one!"
              : "No flags match your filters."}
          </p>
          {flags.length === 0 && onCreateFlag && (
            <Button className="mt-4" onClick={onCreateFlag}>
              <PlusIcon />
              Create Flag
            </Button>
          )}
        </div>
      )}

      {/* Flag list */}
      {!loading && filteredFlags.length > 0 && (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-2"
          }
        >
          {filteredFlags.map((flag) => (
            <FeatureFlagCard
              key={flag.key}
              flag={flag}
              selected={selectedKeys.includes(flag.key)}
              onSelect={() => toggleSelect(flag.key)}
              onToggle={onToggleFlag ? (enabled) => onToggleFlag(flag.key, enabled) : undefined}
              onEdit={onEditFlag ? () => onEditFlag(flag.key) : undefined}
              onDelete={onDeleteFlag ? () => onDeleteFlag(flag.key) : undefined}
              onViewDetails={onViewFlag ? () => onViewFlag(flag.key) : undefined}
              onViewHistory={onViewHistory ? () => onViewHistory(flag.key) : undefined}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {!loading && filteredFlags.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredFlags.length} of {flags.length} feature flags
        </p>
      )}
    </div>
  );
}

export default FeatureFlagList;
