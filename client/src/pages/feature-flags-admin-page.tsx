/**
 * @file feature-flags-admin-page.tsx
 * @description Admin page for feature flag management and dashboard
 * @phase Phase 2 - Admin Widgets
 * @version 0.6.6
 * @created 2026-02-02
 */

import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  FeatureFlagStatsWidget,
  DependencyGraphWidget,
  RecentChangesWidget,
} from "@/components/admin/feature-flags";
import {
  ArrowLeft,
  LayoutDashboard,
  Flag,
  GitBranch,
  History,
} from "lucide-react";

export default function FeatureFlagsAdminPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Skip link for keyboard accessibility */}
      <a
        href="#ff-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
      >
        Skip to main content
      </a>
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10" role="banner">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" aria-label="Back to home">
                  <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Flag className="h-5 w-5" aria-hidden="true" />
                  Feature Flags
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage feature flags, rollouts, and experiments
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="ff-main-content" className="container mx-auto px-4 py-6" role="main" aria-label="Feature Flags Administration">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" role="navigation" aria-label="Feature flags sections">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="gap-2">
              <GitBranch className="h-4 w-4" aria-hidden="true" />
              Dependencies
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" aria-hidden="true" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6" role="region" aria-label="Dashboard overview">
            {/* Stats and Recent Changes Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FeatureFlagStatsWidget />
              <RecentChangesWidget />
            </div>

            {/* Dependency Graph */}
            <DependencyGraphWidget />
          </TabsContent>

          <TabsContent value="dependencies" role="region" aria-label="Flag dependencies">
            <DependencyGraphWidget />
          </TabsContent>

          <TabsContent value="history" role="region" aria-label="Recent changes history">
            <RecentChangesWidget />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
