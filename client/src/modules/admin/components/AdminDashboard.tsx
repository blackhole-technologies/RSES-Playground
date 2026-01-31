/**
 * @file AdminDashboard.tsx
 * @description Main admin dashboard component
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React, { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { FeatureFlagList } from "./FeatureFlagList";
import { FeatureFlagDetail } from "./FeatureFlagDetail";
import { SiteCard } from "./SiteCard";
import { DependencyGraph } from "./DependencyGraph";
import {
  SummaryStats,
  FeatureStatsWidget,
  SiteHealthWidget,
  RecentChangesWidget,
  RolloutProgressWidget,
} from "./DashboardWidgets";

import { useFeatureFlags, useRolloutHistory } from "../hooks/use-feature-flags";
import type { FeatureFlag, SiteConfig, RolloutEvent, SiteAction } from "@shared/admin/types";
import type { ViewMode, FeatureFlagFilterState, ConfirmationModalProps } from "../types";

// =============================================================================
// MOCK DATA (Replace with actual API calls)
// =============================================================================

const mockSites: SiteConfig[] = [
  {
    id: "site-1",
    name: "Production US",
    domain: "app.example.com",
    environment: "production",
    region: "us-east-1",
    version: "2.5.1",
    healthStatus: "healthy",
    lastHealthCheck: new Date().toISOString(),
    uptime: 864000,
    enabledFeatures: ["feature_ai_suggestions", "feature_advanced_taxonomy"],
    featureOverrides: {},
    resourceUsage: {
      cpuPercent: 45,
      memoryPercent: 62,
      diskPercent: 38,
      networkInMbps: 125,
      networkOutMbps: 89,
      timestamp: new Date().toISOString(),
    },
    resourceHistory: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
    tags: ["primary", "customer-facing"],
  },
  {
    id: "site-2",
    name: "Production EU",
    domain: "eu.app.example.com",
    environment: "production",
    region: "eu-west-1",
    version: "2.5.1",
    healthStatus: "healthy",
    lastHealthCheck: new Date().toISOString(),
    uptime: 432000,
    enabledFeatures: ["feature_ai_suggestions"],
    featureOverrides: {},
    resourceUsage: {
      cpuPercent: 32,
      memoryPercent: 48,
      diskPercent: 25,
      networkInMbps: 78,
      networkOutMbps: 45,
      timestamp: new Date().toISOString(),
    },
    resourceHistory: [],
    createdAt: "2025-02-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
    tags: ["gdpr-compliant"],
  },
  {
    id: "site-3",
    name: "Staging",
    domain: "staging.example.com",
    environment: "staging",
    region: "us-west-2",
    version: "2.6.0-beta",
    healthStatus: "degraded",
    lastHealthCheck: new Date().toISOString(),
    uptime: 86400,
    enabledFeatures: ["feature_ai_suggestions", "beta_collaborative_editing"],
    featureOverrides: {},
    resourceUsage: {
      cpuPercent: 78,
      memoryPercent: 85,
      diskPercent: 42,
      networkInMbps: 45,
      networkOutMbps: 23,
      timestamp: new Date().toISOString(),
    },
    resourceHistory: [],
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
    tags: ["testing"],
  },
  {
    id: "site-4",
    name: "Development",
    domain: "dev.example.com",
    environment: "development",
    region: "us-west-2",
    version: "2.7.0-dev",
    healthStatus: "healthy",
    lastHealthCheck: new Date().toISOString(),
    uptime: 3600,
    enabledFeatures: ["feature_ai_suggestions", "beta_collaborative_editing", "experimental_quantum_taxonomy"],
    featureOverrides: {},
    resourceUsage: {
      cpuPercent: 15,
      memoryPercent: 28,
      diskPercent: 18,
      networkInMbps: 12,
      networkOutMbps: 8,
      timestamp: new Date().toISOString(),
    },
    resourceHistory: [],
    createdAt: "2025-10-01T00:00:00Z",
    updatedAt: new Date().toISOString(),
    tags: ["internal"],
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function AdminDashboard() {
  const { toast } = useToast();

  // Feature flags state
  const {
    flags,
    loading: flagsLoading,
    error: flagsError,
    loadFlags,
    enableFlag,
    disableFlag,
    deleteFlag,
  } = useFeatureFlags({ autoLoad: true });

  // Rollout history
  const { events: recentEvents, loadMore: loadMoreEvents } = useRolloutHistory();

  // UI state
  const [activeTab, setActiveTab] = useState("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedFlagKey, setSelectedFlagKey] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Filter state
  const [filter, setFilter] = useState<FeatureFlagFilterState>({
    search: "",
    categories: [],
    tags: [],
    enabled: null,
    hasOverrides: null,
    owner: "",
    sortBy: "name",
    sortOrder: "asc",
  });

  // Confirmation dialog state
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: "default" | "destructive";
    onConfirm: () => void;
  } | null>(null);

  // Sites state (using mock data for now)
  const [sites] = useState<SiteConfig[]>(mockSites);

  // Handlers
  const handleFilterChange = useCallback((changes: Partial<FeatureFlagFilterState>) => {
    setFilter((prev) => ({ ...prev, ...changes }));
  }, []);

  const handleToggleFlag = useCallback(async (key: string, enabled: boolean) => {
    try {
      if (enabled) {
        await enableFlag(key);
        toast({ title: "Feature enabled", description: `${key} is now enabled globally` });
      } else {
        await disableFlag(key);
        toast({ title: "Feature disabled", description: `${key} is now disabled globally` });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle feature",
        variant: "destructive",
      });
    }
  }, [enableFlag, disableFlag, toast]);

  const handleDeleteFlag = useCallback((key: string) => {
    const flag = flags.find((f) => f.key === key);
    setConfirmation({
      isOpen: true,
      title: "Delete Feature Flag",
      message: `Are you sure you want to delete "${flag?.name || key}"? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteFlag(key);
          toast({ title: "Feature deleted", description: `${key} has been deleted` });
          setConfirmation(null);
        } catch (error) {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to delete feature",
            variant: "destructive",
          });
        }
      },
    });
  }, [flags, deleteFlag, toast]);

  const handleViewFlag = useCallback((key: string) => {
    setSelectedFlagKey(key);
    setIsDetailOpen(true);
  }, []);

  const handleBulkEnable = useCallback(async (keys: string[]) => {
    try {
      for (const key of keys) {
        await enableFlag(key);
      }
      toast({
        title: "Features enabled",
        description: `${keys.length} features have been enabled`,
      });
      setSelectedKeys([]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to enable features",
        variant: "destructive",
      });
    }
  }, [enableFlag, toast]);

  const handleBulkDisable = useCallback(async (keys: string[]) => {
    try {
      for (const key of keys) {
        await disableFlag(key);
      }
      toast({
        title: "Features disabled",
        description: `${keys.length} features have been disabled`,
      });
      setSelectedKeys([]);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to disable features",
        variant: "destructive",
      });
    }
  }, [disableFlag, toast]);

  const handleSiteAction = useCallback(async (siteId: string, action: SiteAction) => {
    toast({
      title: "Action triggered",
      description: `${action} requested for site ${siteId}`,
    });
    // TODO: Implement actual site actions
  }, [toast]);

  // Get active rollouts for widget
  const activeRollouts = flags
    .filter((f) => f.percentageRollout?.enabled && f.percentageRollout.percentage < 100)
    .map((f) => ({
      featureKey: f.key,
      featureName: f.name,
      currentPercentage: f.percentageRollout!.percentage,
      targetPercentage: 100,
      startedAt: f.updatedAt,
    }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage feature flags and sites</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => loadFlags()}>
                Refresh
              </Button>
              <Button>Create Feature</Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="features">Feature Flags</TabsTrigger>
            <TabsTrigger value="sites">Sites</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <SummaryStats flags={flags} sites={sites} recentEvents={recentEvents} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureStatsWidget flags={flags} />
              <SiteHealthWidget sites={sites} />
              <RecentChangesWidget
                events={recentEvents}
                onViewAll={() => setActiveTab("features")}
              />
            </div>

            {activeRollouts.length > 0 && (
              <RolloutProgressWidget rollouts={activeRollouts} />
            )}

            {/* Quick dependency view */}
            <DependencyGraph
              flags={flags}
              selectedFlagKey={selectedFlagKey}
              onSelectFlag={handleViewFlag}
              height={300}
            />
          </TabsContent>

          {/* Features Tab */}
          <TabsContent value="features">
            <FeatureFlagList
              flags={flags}
              loading={flagsLoading}
              error={flagsError}
              filter={filter}
              onFilterChange={handleFilterChange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
              onToggleFlag={handleToggleFlag}
              onEditFlag={(key) => console.log("Edit:", key)}
              onDeleteFlag={handleDeleteFlag}
              onViewFlag={handleViewFlag}
              onViewHistory={(key) => console.log("History:", key)}
              onBulkEnable={handleBulkEnable}
              onBulkDisable={handleBulkDisable}
              onBulkDelete={(keys) => console.log("Bulk delete:", keys)}
            />
          </TabsContent>

          {/* Sites Tab */}
          <TabsContent value="sites">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sites.map((site) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  onAction={(action) => handleSiteAction(site.id, action)}
                  onViewDetails={() => console.log("View site:", site.id)}
                />
              ))}
            </div>
          </TabsContent>

          {/* Dependencies Tab */}
          <TabsContent value="dependencies">
            <DependencyGraph
              flags={flags}
              selectedFlagKey={selectedFlagKey}
              onSelectFlag={handleViewFlag}
              height={600}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Feature Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedFlagKey && (
            <FeatureFlagDetail
              flagKey={selectedFlagKey}
              onClose={() => setIsDetailOpen(false)}
              onEdit={() => console.log("Edit flag")}
              onToggle={(enabled) => handleToggleFlag(selectedFlagKey, enabled)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmation?.isOpen || false}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmation?.variant === "destructive" ? "destructive" : "default"}
              onClick={confirmation?.onConfirm}
            >
              {confirmation?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminDashboard;
