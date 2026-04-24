/**
 * @file FeatureFlagStatsWidget.tsx
 * @description Dashboard widget showing feature flag statistics
 * @phase Phase 2 - Admin Widgets
 * @version 0.6.6
 * @created 2026-02-02
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Flag,
  ToggleLeft,
  ToggleRight,
  Users,
  Building2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureFlagStats {
  totalFlags: number;
  enabledFlags: number;
  disabledFlags: number;
  betaFlags: number;
  experimentalFlags: number;
  deprecatedFlags: number;
  flagsWithOverrides: number;
  totalSiteOverrides: number;
  totalUserOverrides: number;
  topFeaturesByUsage: Array<{ key: string; evaluations: number }>;
  cacheStats?: {
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
  };
}

async function fetchFeatureFlagStats(): Promise<FeatureFlagStats> {
  // Fetch all flags
  const flagsRes = await fetch("/api/admin/feature-flags");
  const flagsData = await flagsRes.json();
  const flags = flagsData.data || [];

  // Fetch top features
  const topRes = await fetch("/api/admin/feature-flags/top?period=day&limit=5");
  const topData = await topRes.json();

  // Fetch cache status
  const cacheRes = await fetch("/api/admin/feature-flags/cache/status");
  const cacheData = await cacheRes.json();

  // Calculate stats
  const enabledFlags = flags.filter((f: any) => f.globallyEnabled).length;
  const disabledFlags = flags.length - enabledFlags;
  const betaFlags = flags.filter((f: any) => f.category === "beta").length;
  const experimentalFlags = flags.filter((f: any) => f.category === "experimental").length;
  const deprecatedFlags = flags.filter((f: any) => f.category === "deprecated").length;

  // Cache stats
  let cacheStats = undefined;
  if (cacheData.enabled && cacheData.stats) {
    const { hits, misses, avgLatencyMs } = cacheData.stats;
    const total = hits + misses;
    cacheStats = {
      hits,
      misses,
      hitRate: total > 0 ? (hits / total) * 100 : 0,
      avgLatencyMs,
    };
  }

  return {
    totalFlags: flags.length,
    enabledFlags,
    disabledFlags,
    betaFlags,
    experimentalFlags,
    deprecatedFlags,
    flagsWithOverrides: 0, // Would need additional API call
    totalSiteOverrides: 0,
    totalUserOverrides: 0,
    topFeaturesByUsage: topData.data || [],
    cacheStats,
  };
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  trendValue,
  variant = "default",
}: StatCardProps) {
  const variantColors = {
    default: "text-muted-foreground",
    success: "text-green-500",
    warning: "text-yellow-500",
    danger: "text-red-500",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={cn("p-2 rounded-lg bg-background", variantColors[variant])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground truncate">
          {title}
        </p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">{value}</p>
          {trend && trendValue && (
            <span
              className={cn(
                "text-xs flex items-center gap-0.5",
                trend === "up" && "text-green-500",
                trend === "down" && "text-red-500",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trend === "up" && <TrendingUp className="h-3 w-3" />}
              {trend === "down" && <TrendingDown className="h-3 w-3" />}
              {trendValue}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

export function FeatureFlagStatsWidget() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["feature-flag-stats"],
    queryFn: fetchFeatureFlagStats,
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Feature Flag Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Feature Flag Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            Failed to load statistics
          </div>
        </CardContent>
      </Card>
    );
  }

  const enabledPercentage =
    stats.totalFlags > 0
      ? Math.round((stats.enabledFlags / stats.totalFlags) * 100)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          Feature Flag Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Flags"
            value={stats.totalFlags}
            icon={<Flag className="h-4 w-4" />}
          />
          <StatCard
            title="Enabled"
            value={stats.enabledFlags}
            icon={<ToggleRight className="h-4 w-4" />}
            variant="success"
            description={`${enabledPercentage}% of total`}
          />
          <StatCard
            title="Disabled"
            value={stats.disabledFlags}
            icon={<ToggleLeft className="h-4 w-4" />}
            variant="default"
          />
          <StatCard
            title="Beta/Experimental"
            value={stats.betaFlags + stats.experimentalFlags}
            icon={<Activity className="h-4 w-4" />}
            variant="warning"
          />
        </div>

        {/* Category Breakdown */}
        <div>
          <h4 className="text-sm font-medium mb-3">Category Breakdown</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Beta</span>
              <div className="flex items-center gap-2">
                <Progress
                  value={stats.totalFlags > 0 ? (stats.betaFlags / stats.totalFlags) * 100 : 0}
                  className="w-24 h-2"
                />
                <Badge variant="secondary">{stats.betaFlags}</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Experimental</span>
              <div className="flex items-center gap-2">
                <Progress
                  value={stats.totalFlags > 0 ? (stats.experimentalFlags / stats.totalFlags) * 100 : 0}
                  className="w-24 h-2"
                />
                <Badge variant="secondary">{stats.experimentalFlags}</Badge>
              </div>
            </div>
            {stats.deprecatedFlags > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                  Deprecated
                </span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={(stats.deprecatedFlags / stats.totalFlags) * 100}
                    className="w-24 h-2"
                  />
                  <Badge variant="destructive">{stats.deprecatedFlags}</Badge>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cache Stats */}
        {stats.cacheStats && (
          <div>
            <h4 className="text-sm font-medium mb-3">Edge Cache</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Hit Rate</p>
                <p className="text-xl font-bold">
                  {stats.cacheStats.hitRate.toFixed(1)}%
                </p>
                <Progress value={stats.cacheStats.hitRate} className="mt-2 h-1" />
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Avg Latency</p>
                <p className="text-xl font-bold">
                  {stats.cacheStats.avgLatencyMs.toFixed(1)}ms
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.cacheStats.hits.toLocaleString()} hits / {stats.cacheStats.misses.toLocaleString()} misses
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Features */}
        {stats.topFeaturesByUsage.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Top Features (24h)</h4>
            <div className="space-y-2">
              {stats.topFeaturesByUsage.slice(0, 5).map((feature, i) => (
                <div
                  key={feature.key}
                  className="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">
                      #{i + 1}
                    </span>
                    <code className="text-sm">{feature.key}</code>
                  </div>
                  <Badge variant="outline">
                    {feature.evaluations.toLocaleString()} evals
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FeatureFlagStatsWidget;
