/**
 * @file DashboardWidgets.tsx
 * @description Dashboard widgets for admin interface
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FeatureFlag, SiteConfig, RolloutEvent, FeatureUsageStats, SiteHealthStatus } from "@shared/admin/types";

// =============================================================================
// ICONS
// =============================================================================

const FlagIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

const ServerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const TrendUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const TrendDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

// =============================================================================
// FEATURE STATS WIDGET
// =============================================================================

export interface FeatureStatsWidgetProps {
  flags: FeatureFlag[];
}

export function FeatureStatsWidget({ flags }: FeatureStatsWidgetProps) {
  const totalFlags = flags.length;
  const enabledFlags = flags.filter((f) => f.globallyEnabled).length;
  const betaFlags = flags.filter((f) => f.category === "beta").length;
  const experimentalFlags = flags.filter((f) => f.category === "experimental").length;
  const deprecatedFlags = flags.filter((f) => f.category === "deprecated").length;

  const enabledPercentage = totalFlags > 0 ? (enabledFlags / totalFlags) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Feature Flags</CardTitle>
        <FlagIcon />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{totalFlags}</div>
        <p className="text-xs text-muted-foreground">
          {enabledFlags} enabled ({enabledPercentage.toFixed(0)}%)
        </p>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Beta</span>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              {betaFlags}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Experimental</span>
            <Badge variant="secondary" className="bg-purple-100 text-purple-800">
              {experimentalFlags}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Deprecated</span>
            <Badge variant="secondary" className="bg-red-100 text-red-800">
              {deprecatedFlags}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// SITE HEALTH WIDGET
// =============================================================================

export interface SiteHealthWidgetProps {
  sites: SiteConfig[];
}

const healthColors: Record<SiteHealthStatus, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-400",
};

export function SiteHealthWidget({ sites }: SiteHealthWidgetProps) {
  const healthCounts = sites.reduce(
    (acc, site) => {
      acc[site.healthStatus] = (acc[site.healthStatus] || 0) + 1;
      return acc;
    },
    {} as Record<SiteHealthStatus, number>
  );

  const totalSites = sites.length;
  const healthyPercentage = totalSites > 0 ? ((healthCounts.healthy || 0) / totalSites) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Site Health</CardTitle>
        <ServerIcon />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{totalSites} Sites</div>
        <p className="text-xs text-muted-foreground">
          {healthyPercentage.toFixed(0)}% healthy
        </p>
        <div className="mt-4 flex gap-1">
          {(["healthy", "degraded", "unhealthy", "unknown"] as SiteHealthStatus[]).map((status) => {
            const count = healthCounts[status] || 0;
            const width = totalSites > 0 ? (count / totalSites) * 100 : 0;
            if (width === 0) return null;
            return (
              <div
                key={status}
                className={`h-2 rounded ${healthColors[status]}`}
                style={{ width: `${width}%` }}
                title={`${status}: ${count}`}
              />
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {(["healthy", "degraded", "unhealthy", "unknown"] as SiteHealthStatus[]).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${healthColors[status]}`} />
              <span className="capitalize">{status}</span>
              <span className="text-muted-foreground ml-auto">{healthCounts[status] || 0}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// RECENT CHANGES WIDGET
// =============================================================================

export interface RecentChangesWidgetProps {
  events: RolloutEvent[];
  onViewAll?: () => void;
}

const eventTypeLabels: Record<string, { label: string; color: string }> = {
  created: { label: "Created", color: "bg-blue-100 text-blue-800" },
  enabled: { label: "Enabled", color: "bg-green-100 text-green-800" },
  disabled: { label: "Disabled", color: "bg-gray-100 text-gray-800" },
  percentage_changed: { label: "Rollout", color: "bg-yellow-100 text-yellow-800" },
  targeting_updated: { label: "Targeting", color: "bg-purple-100 text-purple-800" },
  override_added: { label: "Override", color: "bg-orange-100 text-orange-800" },
  override_removed: { label: "Override Removed", color: "bg-orange-100 text-orange-800" },
  deprecated: { label: "Deprecated", color: "bg-red-100 text-red-800" },
};

export function RecentChangesWidget({ events, onViewAll }: RecentChangesWidgetProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Recent Changes</CardTitle>
        <ActivityIcon />
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent changes</p>
        ) : (
          <div className="space-y-3">
            {events.slice(0, 5).map((event) => {
              const typeInfo = eventTypeLabels[event.eventType] || {
                label: event.eventType,
                color: "bg-gray-100 text-gray-800",
              };
              return (
                <div key={event.id} className="flex items-start gap-2">
                  <Badge variant="outline" className={`text-xs ${typeInfo.color}`}>
                    {typeInfo.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{event.featureKey}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(event.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {onViewAll && events.length > 0 && (
          <button
            onClick={onViewAll}
            className="mt-4 text-sm text-primary hover:underline"
          >
            View all changes
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// FEATURE ADOPTION WIDGET
// =============================================================================

export interface FeatureAdoptionWidgetProps {
  stats: Array<{
    featureKey: string;
    featureName: string;
    adoptionRate: number;
    trend: "up" | "down" | "stable";
  }>;
}

export function FeatureAdoptionWidget({ stats }: FeatureAdoptionWidgetProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Feature Adoption</CardTitle>
        <UsersIcon />
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No adoption data available</p>
        ) : (
          <div className="space-y-4">
            {stats.slice(0, 5).map((stat) => (
              <div key={stat.featureKey} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[150px]">{stat.featureName}</span>
                  <div className="flex items-center gap-1">
                    <span>{stat.adoptionRate}%</span>
                    {stat.trend === "up" && <TrendUpIcon />}
                    {stat.trend === "down" && <TrendDownIcon />}
                  </div>
                </div>
                <Progress value={stat.adoptionRate} className="h-1.5" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ROLLOUT PROGRESS WIDGET
// =============================================================================

export interface RolloutProgressWidgetProps {
  rollouts: Array<{
    featureKey: string;
    featureName: string;
    currentPercentage: number;
    targetPercentage: number;
    startedAt: string;
  }>;
}

export function RolloutProgressWidget({ rollouts }: RolloutProgressWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Active Rollouts</CardTitle>
        <CardDescription>Features being gradually rolled out</CardDescription>
      </CardHeader>
      <CardContent>
        {rollouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active rollouts</p>
        ) : (
          <div className="space-y-4">
            {rollouts.map((rollout) => (
              <div key={rollout.featureKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{rollout.featureName}</span>
                  <span className="text-sm text-muted-foreground">
                    {rollout.currentPercentage}% / {rollout.targetPercentage}%
                  </span>
                </div>
                <div className="relative">
                  <Progress value={rollout.currentPercentage} className="h-2" />
                  <div
                    className="absolute top-0 h-2 border-r-2 border-primary"
                    style={{ left: `${rollout.targetPercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// RESOURCE USAGE WIDGET
// =============================================================================

export interface ResourceUsageWidgetProps {
  data: {
    cpu: number;
    memory: number;
    disk: number;
    network: { in: number; out: number };
  };
  siteName?: string;
}

export function ResourceUsageWidget({ data, siteName }: ResourceUsageWidgetProps) {
  const getProgressColor = (value: number) => {
    if (value < 60) return "bg-green-500";
    if (value < 80) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {siteName ? `${siteName} Resources` : "Resource Usage"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>CPU</span>
            <span className="font-mono">{data.cpu.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(data.cpu)}`}
              style={{ width: `${data.cpu}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Memory</span>
            <span className="font-mono">{data.memory.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(data.memory)}`}
              style={{ width: `${data.memory}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Disk</span>
            <span className="font-mono">{data.disk.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(data.disk)}`}
              style={{ width: `${data.disk}%` }}
            />
          </div>
        </div>

        <div className="pt-2 border-t">
          <div className="flex justify-between text-sm">
            <span>Network</span>
            <span className="font-mono text-xs">
              IN: {data.network.in.toFixed(1)} Mbps | OUT: {data.network.out.toFixed(1)} Mbps
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// SUMMARY STATS CARDS
// =============================================================================

export interface SummaryStatsProps {
  flags: FeatureFlag[];
  sites: SiteConfig[];
  recentEvents: RolloutEvent[];
}

export function SummaryStats({ flags, sites, recentEvents }: SummaryStatsProps) {
  const enabledFlags = flags.filter((f) => f.globallyEnabled).length;
  const healthySites = sites.filter((s) => s.healthStatus === "healthy").length;
  const todayEvents = recentEvents.filter((e) => {
    const eventDate = new Date(e.timestamp);
    const today = new Date();
    return eventDate.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Features</CardTitle>
          <FlagIcon />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{flags.length}</div>
          <p className="text-xs text-muted-foreground">
            <span className="text-green-600">{enabledFlags} enabled</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Sites</CardTitle>
          <ServerIcon />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{sites.length}</div>
          <p className="text-xs text-muted-foreground">
            <span className="text-green-600">{healthySites} healthy</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Changes Today</CardTitle>
          <ActivityIcon />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{todayEvents}</div>
          <p className="text-xs text-muted-foreground">
            Flag updates
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Rollouts</CardTitle>
          <UsersIcon />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {flags.filter((f) => f.percentageRollout?.enabled && f.percentageRollout.percentage < 100).length}
          </div>
          <p className="text-xs text-muted-foreground">
            In progress
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default {
  FeatureStatsWidget,
  SiteHealthWidget,
  RecentChangesWidget,
  FeatureAdoptionWidget,
  RolloutProgressWidget,
  ResourceUsageWidget,
  SummaryStats,
};
