/**
 * @file FeatureFlagDetail.tsx
 * @description Feature flag detail panel with tabs
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React, { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFeatureFlag } from "../hooks/use-feature-flags";
import type { FeatureCategory } from "@shared/admin/types";

// =============================================================================
// ICONS
// =============================================================================

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const HistoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// =============================================================================
// CATEGORY STYLES
// =============================================================================

const categoryStyles: Record<FeatureCategory, string> = {
  core: "bg-blue-100 text-blue-800",
  optional: "bg-green-100 text-green-800",
  beta: "bg-yellow-100 text-yellow-800",
  experimental: "bg-purple-100 text-purple-800",
  deprecated: "bg-red-100 text-red-800",
};

// =============================================================================
// COMPONENT
// =============================================================================

export interface FeatureFlagDetailProps {
  flagKey: string;
  onClose?: () => void;
  onEdit?: () => void;
  onToggle?: (enabled: boolean) => Promise<void>;
}

export function FeatureFlagDetail({
  flagKey,
  onClose,
  onEdit,
  onToggle,
}: FeatureFlagDetailProps) {
  const {
    flag,
    loading,
    error,
    siteOverrides,
    userOverrides,
    history,
    stats,
    dependencies,
    loadOverrides,
    loadHistory,
    loadStats,
    checkCanEnable,
    checkCanDisable,
  } = useFeatureFlag(flagKey);

  useEffect(() => {
    if (flag) {
      loadOverrides();
      loadHistory(20);
      loadStats("day");
      if (flag.globallyEnabled) {
        checkCanDisable();
      } else {
        checkCanEnable();
      }
    }
  }, [flag, loadOverrides, loadHistory, loadStats, checkCanEnable, checkCanDisable]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !flag) {
    return (
      <div className="p-6">
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10 text-destructive">
          {error || "Feature flag not found"}
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{flag.name}</h2>
            <Badge variant="outline" className={categoryStyles[flag.category]}>
              {flag.category}
            </Badge>
          </div>
          <p className="text-sm font-mono text-muted-foreground">{flag.key}</p>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <EditIcon />
              Edit
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <CloseIcon />
            </Button>
          )}
        </div>
      </div>

      {/* Toggle section */}
      <div className="flex items-center justify-between p-6 border-b bg-muted/30">
        <div className="space-y-1">
          <p className="font-medium">Global Status</p>
          <p className="text-sm text-muted-foreground">
            {flag.toggleable
              ? flag.globallyEnabled
                ? "This feature is enabled globally"
                : "This feature is disabled globally"
              : "This is a core feature and cannot be toggled"}
          </p>
          {dependencies && !dependencies.canEnable && dependencies.blockedBy.length > 0 && (
            <p className="text-sm text-destructive">
              Blocked by: {dependencies.blockedBy.join(", ")}
            </p>
          )}
          {dependencies && dependencies.wouldBreak.length > 0 && (
            <p className="text-sm text-amber-600">
              Warning: Disabling would break: {dependencies.wouldBreak.join(", ")}
            </p>
          )}
        </div>
        <Switch
          checked={flag.globallyEnabled}
          disabled={!flag.toggleable}
          onCheckedChange={onToggle}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="targeting">Targeting</TabsTrigger>
          <TabsTrigger value="overrides">
            Overrides ({siteOverrides.length + userOverrides.length})
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="flex-1 overflow-auto p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{flag.description}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Toggleable</span>
                  <span>{flag.toggleable ? "Yes" : "No"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default State</span>
                  <span>{flag.defaultState ? "Enabled" : "Disabled"}</span>
                </div>
                {flag.percentageRollout?.enabled && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rollout</span>
                    <span>{flag.percentageRollout.percentage}%</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span>{flag.owner || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(flag.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{formatDate(flag.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {flag.dependencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Dependencies</CardTitle>
                <CardDescription>
                  Features this flag depends on
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {flag.dependencies.map((dep) => (
                    <div key={dep.featureKey} className="flex items-center justify-between p-2 border rounded">
                      <code className="text-sm">{dep.featureKey}</code>
                      <Badge variant={dep.requiredState ? "default" : "secondary"}>
                        {dep.requiredState ? "Must be ON" : "Must be OFF"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {flag.tags.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {flag.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Targeting Tab */}
        <TabsContent value="targeting" className="flex-1 overflow-auto p-6 space-y-6">
          {flag.percentageRollout?.enabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Percentage Rollout</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${flag.percentageRollout.percentage}%` }}
                    />
                  </div>
                  <span className="font-mono">{flag.percentageRollout.percentage}%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Bucketed by: {flag.percentageRollout.bucketBy.join(", ")}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Targeting Rules ({flag.targetingRules.length})</CardTitle>
              <CardDescription>
                Rules are evaluated in order; first match wins
              </CardDescription>
            </CardHeader>
            <CardContent>
              {flag.targetingRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No targeting rules configured</p>
              ) : (
                <div className="space-y-2">
                  {flag.targetingRules.map((rule, i) => (
                    <div key={rule.id} className="flex items-center gap-3 p-3 border rounded">
                      <span className="text-muted-foreground text-sm">{i + 1}.</span>
                      <div className="flex-1">
                        <code className="text-sm">
                          {rule.attribute} {rule.operator} {JSON.stringify(rule.value)}
                        </code>
                      </div>
                      <Badge variant={rule.variation ? "default" : "secondary"}>
                        {rule.variation ? <CheckIcon /> : <XIcon />}
                        {rule.variation ? "Enable" : "Disable"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overrides Tab */}
        <TabsContent value="overrides" className="flex-1 overflow-auto p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Site Overrides ({siteOverrides.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {siteOverrides.length === 0 ? (
                <p className="text-sm text-muted-foreground">No site overrides</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rollout</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteOverrides.map((override) => (
                      <TableRow key={override.siteId}>
                        <TableCell className="font-mono">{override.siteId}</TableCell>
                        <TableCell>
                          <Badge variant={override.enabled ? "default" : "secondary"}>
                            {override.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {override.percentageRollout?.enabled
                            ? `${override.percentageRollout.percentage}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(override.updatedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">User Overrides ({userOverrides.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {userOverrides.length === 0 ? (
                <p className="text-sm text-muted-foreground">No user overrides</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userOverrides.map((override) => (
                      <TableRow key={override.userId}>
                        <TableCell className="font-mono">{override.userId}</TableCell>
                        <TableCell>
                          <Badge variant={override.enabled ? "default" : "secondary"}>
                            {override.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {override.reason || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {override.expiresAt ? formatDate(override.expiresAt) : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 overflow-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Rollout History</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet</p>
              ) : (
                <div className="space-y-3">
                  {history.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-3 border rounded">
                      <div className="mt-1">
                        <HistoryIcon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{event.eventType.replace("_", " ")}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(event.timestamp)}
                          </span>
                        </div>
                        {event.reason && (
                          <p className="text-sm text-muted-foreground mt-1">{event.reason}</p>
                        )}
                        {event.siteId && (
                          <p className="text-xs text-muted-foreground">Site: {event.siteId}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="stats" className="flex-1 overflow-auto p-6 space-y-6">
          {stats ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-2xl font-bold">{stats.evaluations.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Total Evaluations</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-2xl font-bold">{stats.uniqueUsers.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Unique Users</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-2xl font-bold">{stats.avgEvaluationTimeMs.toFixed(2)}ms</p>
                    <p className="text-sm text-muted-foreground">Avg Eval Time</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Evaluation Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Enabled</span>
                        <span className="text-sm">{stats.enabledEvaluations}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{
                            width: `${(stats.enabledEvaluations / stats.evaluations) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Disabled</span>
                        <span className="text-sm">{stats.disabledEvaluations}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-500"
                          style={{
                            width: `${(stats.disabledEvaluations / stats.evaluations) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average</span>
                    <span>{stats.avgEvaluationTimeMs.toFixed(2)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">P95</span>
                    <span>{stats.p95EvaluationTimeMs.toFixed(2)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">P99</span>
                    <span>{stats.p99EvaluationTimeMs.toFixed(2)}ms</span>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-muted-foreground">No statistics available yet</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default FeatureFlagDetail;
