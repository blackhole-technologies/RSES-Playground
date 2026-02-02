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
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Flag className="h-5 w-5" />
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
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Dependencies
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            {/* Stats and Recent Changes Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FeatureFlagStatsWidget />
              <RecentChangesWidget />
            </div>

            {/* Dependency Graph */}
            <DependencyGraphWidget />
          </TabsContent>

          <TabsContent value="dependencies">
            <DependencyGraphWidget />
          </TabsContent>

          <TabsContent value="history">
            <RecentChangesWidget />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
