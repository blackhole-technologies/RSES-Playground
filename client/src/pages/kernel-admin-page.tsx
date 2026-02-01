/**
 * @file kernel-admin-page.tsx
 * @description Admin page for kernel module management.
 *
 * Provides a UI for:
 * - Viewing all modules and their status
 * - Enabling/disabling modules
 * - Viewing kernel health
 * - Browsing event history
 *
 * @module pages/kernel-admin-page
 * @phase Phase 2 - Admin UI
 * @created 2026-02-01
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  useKernelModules,
  useKernelModule,
  useKernelHealth,
  useKernelEvents,
  useEnableModule,
  useDisableModule,
  useKernelAvailable,
  getModuleStateColor,
  getHealthColor,
  getTierColor,
  type KernelModuleSummary,
  type ModuleTier,
} from "@/hooks/use-kernel";
import { useKernelEventsWS, type KernelEvent } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  ArrowLeft,
  Box,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  RefreshCw,
  ChevronRight,
  Power,
  PowerOff,
  GitBranch,
  Radio,
  Wifi,
  WifiOff,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// KERNEL NOT AVAILABLE COMPONENT
// =============================================================================

function KernelNotAvailable() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PowerOff className="h-5 w-5 text-muted-foreground" />
            Kernel Not Available
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <p className="mb-4">
            The kernel module system is not enabled on the server.
          </p>
          <p className="text-sm">
            To enable the kernel, start the server with:
          </p>
          <pre className="mt-2 p-2 bg-muted rounded text-xs">
            ENABLE_KERNEL=true npm run dev
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// HEALTH OVERVIEW COMPONENT
// =============================================================================

function HealthOverview() {
  const { data: health, isLoading, error } = useKernelHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <XCircle className="h-5 w-5" />
            Health Check Failed
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Unable to fetch kernel health status.
        </CardContent>
      </Card>
    );
  }

  const healthIcon = {
    healthy: <CheckCircle2 className="h-6 w-6 text-green-500" />,
    degraded: <AlertTriangle className="h-6 w-6 text-yellow-500" />,
    unhealthy: <XCircle className="h-6 w-6 text-red-500" />,
  };

  const moduleCount = Object.keys(health.modules).length;
  const healthyCount = Object.values(health.modules).filter(
    (m) => m.status === "healthy"
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {healthIcon[health.status]}
          <div>
            <p className="text-lg font-semibold capitalize">{health.status}</p>
            <p className="text-sm text-muted-foreground">
              {healthyCount}/{moduleCount} modules healthy
            </p>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            <Clock className="h-4 w-4 inline mr-1" />
            {new Date(health.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MODULE CARD COMPONENT
// =============================================================================

interface ModuleCardProps {
  module: KernelModuleSummary;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isToggling: boolean;
}

function ModuleCard({
  module,
  onSelect,
  onToggle,
  isToggling,
}: ModuleCardProps) {
  const stateColor = getModuleStateColor(module.state);
  const tierColor = getTierColor(module.tier);

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onSelect(module.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Box className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{module.name}</span>
              <Badge variant="outline" className={cn("text-xs", tierColor)}>
                {module.tier}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              v{module.version}
            </p>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm capitalize", stateColor)}>
                {module.state}
              </span>
              {module.health && (
                <span
                  className={cn(
                    "text-sm",
                    getHealthColor(module.health.status)
                  )}
                >
                  ({module.health.status})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={module.enabled && module.state === "running"}
              disabled={isToggling || module.tier === "kernel"}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onCheckedChange={(checked) => {
                onToggle(module.id, checked);
              }}
            />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MODULE LIST COMPONENT
// =============================================================================

interface ModuleListProps {
  tier?: ModuleTier;
  onSelect: (id: string) => void;
}

function ModuleList({ tier, onSelect }: ModuleListProps) {
  const { data: modules, isLoading, error, refetch } = useKernelModules();
  const enableModule = useEnableModule();
  const disableModule = useDisableModule();
  const { toast } = useToast();

  const [confirmDisable, setConfirmDisable] = useState<{
    id: string;
    name: string;
    tier: ModuleTier;
  } | null>(null);

  const handleToggle = (moduleId: string, enabled: boolean) => {
    const module = modules?.find((m) => m.id === moduleId);
    if (!module) return;

    if (enabled) {
      enableModule.mutate(moduleId, {
        onSuccess: (data) => {
          toast({
            title: "Module enabled",
            description: `${module.name} has been enabled successfully.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Failed to enable module",
            description: error instanceof Error ? error.message : "An error occurred",
            variant: "destructive",
          });
        },
      });
    } else {
      // Show confirmation for core modules
      if (module.tier === "core") {
        setConfirmDisable({ id: moduleId, name: module.name, tier: module.tier });
      } else {
        disableModule.mutate({ moduleId }, {
          onSuccess: () => {
            toast({
              title: "Module disabled",
              description: `${module.name} has been disabled.`,
            });
          },
          onError: (error) => {
            toast({
              title: "Failed to disable module",
              description: error instanceof Error ? error.message : "An error occurred",
              variant: "destructive",
            });
          },
        });
      }
    }
  };

  const handleConfirmDisable = () => {
    if (confirmDisable) {
      const moduleName = confirmDisable.name;
      disableModule.mutate({
        moduleId: confirmDisable.id,
        force: confirmDisable.tier === "core",
      }, {
        onSuccess: () => {
          toast({
            title: "Core module disabled",
            description: `${moduleName} has been forcefully disabled.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Failed to disable module",
            description: error instanceof Error ? error.message : "An error occurred",
            variant: "destructive",
          });
        },
      });
      setConfirmDisable(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-muted-foreground">Failed to load modules</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const filteredModules = tier
    ? modules?.filter((m) => m.tier === tier)
    : modules;

  if (!filteredModules?.length) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No modules found
        </CardContent>
      </Card>
    );
  }

  const isToggling = enableModule.isPending || disableModule.isPending;

  return (
    <>
      <div className="space-y-3">
        {filteredModules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            onSelect={onSelect}
            onToggle={handleToggle}
            isToggling={isToggling}
          />
        ))}
      </div>

      <AlertDialog
        open={!!confirmDisable}
        onOpenChange={() => setConfirmDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Core Module?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDisable?.name}</strong> is a core module.
              Disabling it may affect system functionality. Other modules may
              depend on it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisable}
              className="bg-red-500 hover:bg-red-600"
            >
              Disable Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// MODULE DETAIL SHEET
// =============================================================================

interface ModuleDetailSheetProps {
  moduleId: string | null;
  onClose: () => void;
}

function ModuleDetailSheet({ moduleId, onClose }: ModuleDetailSheetProps) {
  const { data: module, isLoading } = useKernelModule(moduleId);

  return (
    <Sheet open={!!moduleId} onOpenChange={() => onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            {isLoading ? "Loading..." : module?.name || "Module Details"}
          </SheetTitle>
          <SheetDescription>
            {module?.description || "View module configuration and status"}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : module ? (
          <ScrollArea className="h-[calc(100vh-200px)] mt-6">
            <div className="space-y-6 pr-4">
              {/* Status */}
              <div>
                <h4 className="text-sm font-medium mb-2">Status</h4>
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={getTierColor(module.tier)}
                  >
                    {module.tier}
                  </Badge>
                  <span
                    className={cn(
                      "capitalize",
                      getModuleStateColor(module.state)
                    )}
                  >
                    {module.state}
                  </span>
                  {module.health && (
                    <span
                      className={cn(getHealthColor(module.health.status))}
                    >
                      {module.health.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Version */}
              <div>
                <h4 className="text-sm font-medium mb-2">Version</h4>
                <p className="text-muted-foreground">{module.version}</p>
              </div>

              {/* Dependencies */}
              {module.dependencies?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Dependencies</h4>
                  <div className="space-y-2">
                    {module.dependencies.map((dep) => (
                      <div
                        key={dep.moduleId}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span>{dep.moduleId}</span>
                        <Badge variant="secondary" className="text-xs">
                          {dep.version}
                        </Badge>
                        {dep.optional && (
                          <Badge variant="outline" className="text-xs">
                            optional
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Events */}
              {module.events && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Events</h4>
                  {module.events.emits && module.events.emits.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-muted-foreground mb-1">
                        Emits:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {module.events.emits.map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {module.events.listens && module.events.listens.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Listens:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {module.events.listens.map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Health Details */}
              {module.health && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Health Details</h4>
                  <p className="text-sm text-muted-foreground">
                    {module.health.message || "No additional details"}
                  </p>
                  {module.health.timestamp && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last check:{" "}
                      {new Date(module.health.timestamp).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="mt-6 text-center text-muted-foreground">
            Module not found
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// DEPENDENCY GRAPH COMPONENT
// =============================================================================

interface GraphNode {
  id: string;
  name: string;
  tier: ModuleTier;
  state: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  optional: boolean;
}

function DependencyGraph({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: modules, isLoading, error } = useKernelModules();
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);

  // Fetch dependency details for all modules
  useEffect(() => {
    if (!modules || modules.length === 0) return;

    const fetchDependencies = async () => {
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // Position modules in a circle
      const centerX = 200;
      const centerY = 150;
      const radius = 120;

      // Group by tier for better layout
      const tierOrder: Record<ModuleTier, number> = { kernel: 0, core: 1, optional: 2, "third-party": 3 };
      const sortedModules = [...modules].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

      sortedModules.forEach((mod, i) => {
        const angle = (2 * Math.PI * i) / sortedModules.length - Math.PI / 2;
        nodes.push({
          id: mod.id,
          name: mod.name,
          tier: mod.tier,
          state: mod.state,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        });
      });

      // Fetch details for each module to get dependencies
      for (const mod of modules) {
        try {
          const response = await fetch(`/api/kernel/modules/${mod.id}`, {
            credentials: "include",
          });
          if (response.ok) {
            const details = await response.json();
            if (details.dependencies) {
              for (const dep of details.dependencies) {
                edges.push({
                  from: mod.id,
                  to: dep.moduleId,
                  optional: dep.optional || false,
                });
              }
            }
          }
        } catch {
          // Skip failed fetches
        }
      }

      setGraphData({ nodes, edges });
    };

    fetchDependencies();
  }, [modules]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !modules) {
    return (
      <div className="text-center text-muted-foreground p-6">
        Failed to load module dependencies
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Building graph...</span>
      </div>
    );
  }

  const { nodes, edges } = graphData;

  // Get node position by ID
  const getNode = (id: string) => nodes.find((n) => n.id === id);

  // Color by tier
  const getTierFill = (tier: ModuleTier) => {
    switch (tier) {
      case "kernel": return "#a855f7"; // purple
      case "core": return "#3b82f6"; // blue
      case "optional": return "#22c55e"; // green
      case "third-party": return "#f97316"; // orange
      default: return "#6b7280"; // gray
    }
  };

  const getStateOpacity = (state: string) => {
    return state === "running" ? 1 : 0.5;
  };

  return (
    <div className="relative">
      <svg
        viewBox="0 0 400 300"
        className="w-full h-[300px] bg-muted/20 rounded-lg"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
          </marker>
          <marker
            id="arrowhead-optional"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" fillOpacity="0.4" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromNode = getNode(edge.from);
          const toNode = getNode(edge.to);
          if (!fromNode || !toNode) return null;

          // Calculate edge endpoints (offset from center to edge of circle)
          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nodeRadius = 25;

          const startX = fromNode.x + (dx / dist) * nodeRadius;
          const startY = fromNode.y + (dy / dist) * nodeRadius;
          const endX = toNode.x - (dx / dist) * (nodeRadius + 5);
          const endY = toNode.y - (dy / dist) * (nodeRadius + 5);

          return (
            <line
              key={`edge-${i}`}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke="#6b7280"
              strokeWidth={edge.optional ? 1 : 2}
              strokeDasharray={edge.optional ? "4 2" : "none"}
              strokeOpacity={edge.optional ? 0.4 : 0.7}
              markerEnd={edge.optional ? "url(#arrowhead-optional)" : "url(#arrowhead)"}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => (
          <g
            key={node.id}
            className="cursor-pointer"
            onClick={() => onSelect(node.id)}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={25}
              fill={getTierFill(node.tier)}
              fillOpacity={getStateOpacity(node.state)}
              stroke={node.state === "running" ? "#fff" : "#6b7280"}
              strokeWidth={2}
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fill="white"
              fontSize="10"
              fontWeight="bold"
            >
              {node.name.slice(0, 4)}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-purple-500" />
          <span>Kernel</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Core</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          <span>Optional</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-orange-500" />
          <span>Third-party</span>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <span className="w-4 border-t-2 border-gray-500" />
          <span>Required</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 border-t border-gray-500 border-dashed" />
          <span>Optional</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// LIVE EVENT LOG COMPONENT (WebSocket-powered)
// =============================================================================

/**
 * Get icon for kernel event type.
 */
function getEventIcon(type: string) {
  if (type.includes("started") || type.includes("enabled")) {
    return <Power className="h-4 w-4 text-green-500" />;
  }
  if (type.includes("stopped") || type.includes("disabled")) {
    return <PowerOff className="h-4 w-4 text-yellow-500" />;
  }
  if (type.includes("failed")) {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }
  if (type.includes("health")) {
    return <Activity className="h-4 w-4 text-blue-500" />;
  }
  if (type.includes("registered") || type.includes("loaded")) {
    return <Box className="h-4 w-4 text-purple-500" />;
  }
  if (type.includes("system:ready")) {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
  if (type.includes("system:shutdown")) {
    return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  }
  return <Zap className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Format event type for display.
 */
function formatEventType(type: string): string {
  return type
    .replace("kernel:", "")
    .replace("module:", "")
    .replace("system:", "⚙ ");
}

/**
 * Live event log with WebSocket connection.
 */
function LiveEventLog() {
  const {
    events,
    isConnected,
    clearEvents,
  } = useKernelEventsWS(100);
  const { data: historicalEvents, isLoading, refetch } = useKernelEvents(50);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && events.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  // Combine live and historical events
  const allEvents = events.length > 0
    ? events
    : (historicalEvents || []).map((e) => ({
        type: e.type as KernelEvent["type"],
        timestamp: new Date(e.timestamp).getTime(),
        data: e.data as KernelEvent["data"],
      }));

  return (
    <div className="space-y-4">
      {/* Connection status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Radio className="h-4 w-4 text-green-500 animate-pulse" />
              <span className="text-sm text-green-600">Live</span>
              <Wifi className="h-4 w-4 text-green-500" />
            </>
          ) : (
            <>
              <Radio className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Disconnected</span>
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            </>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            {events.length} live events
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearEvents()}
            disabled={events.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh History
          </Button>
        </div>
      </div>

      {/* Events list */}
      {isLoading && events.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : allEvents.length === 0 ? (
        <div className="text-center text-muted-foreground p-6">
          <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Waiting for kernel events...</p>
          <p className="text-xs mt-1">
            Events will appear here in real-time when modules change state.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]" ref={scrollRef}>
          <div className="space-y-2 pr-4">
            {allEvents.map((event, index) => (
              <div
                key={`${event.type}-${event.timestamp}-${index}`}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg transition-colors",
                  index === 0 && events.length > 0
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-muted/50"
                )}
              >
                {getEventIcon(event.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">
                      {formatEventType(event.type)}
                    </span>
                    {event.data?.moduleId && (
                      <Badge variant="outline" className="text-xs">
                        {event.data.moduleId}
                      </Badge>
                    )}
                    {event.data?.moduleName && (
                      <span className="text-xs text-muted-foreground">
                        {event.data.moduleName}
                      </span>
                    )}
                    {event.data?.status && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          event.data.status === "healthy" && "text-green-600",
                          event.data.status === "degraded" && "text-yellow-600",
                          event.data.status === "unhealthy" && "text-red-600"
                        )}
                      >
                        {event.data.status}
                      </Badge>
                    )}
                    {event.data?.error && (
                      <span className="text-xs text-red-500 truncate max-w-[200px]">
                        {event.data.error}
                      </span>
                    )}
                  </div>
                  {event.data?.message && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {event.data.message}
                    </p>
                  )}
                  {event.data?.bootTimeMs !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Boot time: {event.data.bootTimeMs}ms, {event.data.modulesLoaded} modules
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// =============================================================================
// LEGACY EVENT LOG (HTTP polling fallback)
// =============================================================================

function EventLog() {
  const { data: events, isLoading, error } = useKernelEvents(50);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error || !events) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Failed to load events
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No events recorded
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-4">
        {events.map((event, index) => (
          <div
            key={`${event.type}-${index}`}
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
          >
            <Zap className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{event.type}</span>
                {event.source && (
                  <Badge variant="outline" className="text-xs">
                    {event.source}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {JSON.stringify(event.data)}
              </p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function KernelAdminPage() {
  const { data: isAvailable, isLoading: checkingAvailability } =
    useKernelAvailable();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  if (checkingAvailability) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-[60vh]">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="container mx-auto p-6">
        <KernelNotAvailable />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/editor">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground -ml-2">
                <ArrowLeft className="h-4 w-4" />
                Editor
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Power className="h-6 w-6" />
            Kernel Administration
          </h1>
          <p className="text-muted-foreground">
            Manage modules, monitor health, and view events
          </p>
        </div>
      </div>

      <div className="grid gap-6 mb-6">
        <HealthOverview />
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Modules</TabsTrigger>
          <TabsTrigger value="core">Core</TabsTrigger>
          <TabsTrigger value="optional">Optional</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-1">
            <Radio className="h-3 w-3" />
            Live Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <ModuleList onSelect={setSelectedModuleId} />
        </TabsContent>

        <TabsContent value="core">
          <ModuleList tier="core" onSelect={setSelectedModuleId} />
        </TabsContent>

        <TabsContent value="optional">
          <ModuleList tier="optional" onSelect={setSelectedModuleId} />
        </TabsContent>

        <TabsContent value="dependencies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Module Dependencies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DependencyGraph onSelect={setSelectedModuleId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Live Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LiveEventLog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ModuleDetailSheet
        moduleId={selectedModuleId}
        onClose={() => setSelectedModuleId(null)}
      />
    </div>
  );
}
