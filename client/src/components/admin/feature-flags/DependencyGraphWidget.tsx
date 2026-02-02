/**
 * @file DependencyGraphWidget.tsx
 * @description Dashboard widget showing feature flag dependency graph
 * @phase Phase 2 - Admin Widgets
 * @version 0.6.6
 * @created 2026-02-02
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  GitBranch,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureFlag {
  key: string;
  name: string;
  category: string;
  globallyEnabled: boolean;
  dependencies: Array<{
    featureKey: string;
    requiredState: boolean;
  }>;
  dependents: string[];
}

interface DependencyNode {
  key: string;
  name: string;
  enabled: boolean;
  category: string;
  x: number;
  y: number;
  level: number;
  dependencies: string[];
  dependents: string[];
}

interface DependencyEdge {
  from: string;
  to: string;
  required: boolean;
  satisfied: boolean;
}

async function fetchFeatureFlags(): Promise<FeatureFlag[]> {
  const res = await fetch("/api/admin/feature-flags");
  const data = await res.json();
  return data.data || [];
}

function buildDependencyGraph(flags: FeatureFlag[]): {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
} {
  const flagMap = new Map(flags.map((f) => [f.key, f]));
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];

  // Calculate levels (topological sort)
  const levels = new Map<string, number>();
  const visited = new Set<string>();

  function getLevel(key: string): number {
    if (levels.has(key)) return levels.get(key)!;
    if (visited.has(key)) return 0; // Circular dependency
    visited.add(key);

    const flag = flagMap.get(key);
    if (!flag || flag.dependencies.length === 0) {
      levels.set(key, 0);
      return 0;
    }

    const maxDepLevel = Math.max(
      ...flag.dependencies.map((d) => getLevel(d.featureKey))
    );
    const level = maxDepLevel + 1;
    levels.set(key, level);
    return level;
  }

  // Calculate levels for all flags
  for (const flag of flags) {
    getLevel(flag.key);
  }

  // Group flags by level
  const levelGroups = new Map<number, FeatureFlag[]>();
  for (const flag of flags) {
    const level = levels.get(flag.key) || 0;
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(flag);
  }

  // Create nodes with positions
  const levelSpacing = 180;
  const nodeSpacing = 120;

  for (const [level, levelFlags] of levelGroups) {
    const startY = -(levelFlags.length - 1) * nodeSpacing / 2;

    levelFlags.forEach((flag, i) => {
      nodes.push({
        key: flag.key,
        name: flag.name,
        enabled: flag.globallyEnabled,
        category: flag.category,
        x: level * levelSpacing,
        y: startY + i * nodeSpacing,
        level,
        dependencies: flag.dependencies.map((d) => d.featureKey),
        dependents: flag.dependents || [],
      });
    });
  }

  // Create edges
  for (const flag of flags) {
    for (const dep of flag.dependencies) {
      const targetFlag = flagMap.get(dep.featureKey);
      edges.push({
        from: dep.featureKey,
        to: flag.key,
        required: dep.requiredState,
        satisfied: targetFlag ? targetFlag.globallyEnabled === dep.requiredState : false,
      });
    }
  }

  return { nodes, edges };
}

function getCategoryColor(category: string): string {
  switch (category) {
    case "core":
      return "bg-blue-500";
    case "optional":
      return "bg-green-500";
    case "beta":
      return "bg-yellow-500";
    case "experimental":
      return "bg-purple-500";
    case "deprecated":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

interface GraphNodeProps {
  node: DependencyNode;
  isSelected: boolean;
  onSelect: (key: string) => void;
  scale: number;
}

function GraphNode({ node, isSelected, onSelect, scale }: GraphNodeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <g
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => onSelect(node.key)}
            className="cursor-pointer"
          >
            {/* Node background */}
            <rect
              x={-60}
              y={-25}
              width={120}
              height={50}
              rx={8}
              className={cn(
                "transition-all duration-200",
                isSelected
                  ? "fill-primary stroke-primary stroke-2"
                  : "fill-card stroke-border hover:stroke-primary"
              )}
            />
            {/* Status indicator */}
            <circle
              cx={-45}
              cy={0}
              r={6}
              className={cn(
                node.enabled ? "fill-green-500" : "fill-red-500"
              )}
            />
            {/* Category indicator */}
            <rect
              x={-60}
              y={-25}
              width={4}
              height={50}
              rx={2}
              className={getCategoryColor(node.category)}
            />
            {/* Text */}
            <text
              x={0}
              y={-5}
              textAnchor="middle"
              className="fill-foreground text-xs font-medium"
              style={{ fontSize: `${10 / scale}px` }}
            >
              {node.key.length > 12 ? node.key.slice(0, 12) + "..." : node.key}
            </text>
            <text
              x={0}
              y={10}
              textAnchor="middle"
              className="fill-muted-foreground text-xs"
              style={{ fontSize: `${8 / scale}px` }}
            >
              {node.category}
            </text>
          </g>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{node.name}</p>
            <p className="text-xs text-muted-foreground">{node.key}</p>
            <div className="flex items-center gap-2 text-xs">
              {node.enabled ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-red-500" />
              )}
              {node.enabled ? "Enabled" : "Disabled"}
            </div>
            {node.dependencies.length > 0 && (
              <p className="text-xs">
                Depends on: {node.dependencies.length} flags
              </p>
            )}
            {node.dependents.length > 0 && (
              <p className="text-xs">
                Depended by: {node.dependents.length} flags
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface GraphEdgeProps {
  edge: DependencyEdge;
  nodes: Map<string, DependencyNode>;
}

function GraphEdge({ edge, nodes }: GraphEdgeProps) {
  const fromNode = nodes.get(edge.from);
  const toNode = nodes.get(edge.to);

  if (!fromNode || !toNode) return null;

  // Calculate path
  const startX = fromNode.x + 60;
  const startY = fromNode.y;
  const endX = toNode.x - 60;
  const endY = toNode.y;

  const controlX1 = startX + (endX - startX) * 0.4;
  const controlX2 = startX + (endX - startX) * 0.6;

  const path = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        className={cn(
          "transition-all duration-200",
          edge.satisfied
            ? "stroke-green-500/50"
            : "stroke-red-500/50"
        )}
        strokeWidth={2}
        markerEnd={edge.satisfied ? "url(#arrowGreen)" : "url(#arrowRed)"}
      />
    </g>
  );
}

export function DependencyGraphWidget() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [viewMode, setViewMode] = useState<"all" | "enabled" | "disabled">("all");

  const { data: flags, isLoading, error, refetch } = useQuery({
    queryKey: ["feature-flags-graph"],
    queryFn: fetchFeatureFlags,
  });

  const filteredFlags = useMemo(() => {
    if (!flags) return [];
    switch (viewMode) {
      case "enabled":
        return flags.filter((f) => f.globallyEnabled);
      case "disabled":
        return flags.filter((f) => !f.globallyEnabled);
      default:
        return flags;
    }
  }, [flags, viewMode]);

  const graph = useMemo(() => {
    if (!filteredFlags.length) return { nodes: [], edges: [] };
    return buildDependencyGraph(filteredFlags);
  }, [filteredFlags]);

  const nodeMap = useMemo(
    () => new Map(graph.nodes.map((n) => [n.key, n])),
    [graph.nodes]
  );

  const selectedNodeData = selectedNode ? nodeMap.get(selectedNode) : null;

  // Calculate viewBox
  const viewBox = useMemo(() => {
    if (graph.nodes.length === 0) return "-100 -100 200 200";

    const minX = Math.min(...graph.nodes.map((n) => n.x)) - 100;
    const maxX = Math.max(...graph.nodes.map((n) => n.x)) + 100;
    const minY = Math.min(...graph.nodes.map((n) => n.y)) - 100;
    const maxY = Math.max(...graph.nodes.map((n) => n.y)) + 100;

    const width = (maxX - minX) / scale;
    const height = (maxY - minY) / scale;

    return `${minX} ${minY} ${width} ${height}`;
  }, [graph.nodes, scale]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Dependency Graph
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px]" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Dependency Graph
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            Failed to load dependency graph
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasDependencies = graph.edges.length > 0;
  const unsatisfiedDeps = graph.edges.filter((e) => !e.satisfied);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Dependency Graph
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flags</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setScale((s) => Math.min(s + 0.2, 2))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setScale(1);
                refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Warnings */}
        {unsatisfiedDeps.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {unsatisfiedDeps.length} unsatisfied dependencies
              </span>
            </div>
          </div>
        )}

        {/* Graph */}
        {!hasDependencies ? (
          <div className="text-center text-muted-foreground py-16">
            <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No dependencies defined between feature flags</p>
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={viewBox}
              className="w-full h-[400px] bg-muted/20 rounded-lg"
            >
              {/* Markers for arrows */}
              <defs>
                <marker
                  id="arrowGreen"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <path
                    d="M0,0 L0,6 L9,3 z"
                    className="fill-green-500/50"
                  />
                </marker>
                <marker
                  id="arrowRed"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <path
                    d="M0,0 L0,6 L9,3 z"
                    className="fill-red-500/50"
                  />
                </marker>
              </defs>

              {/* Edges */}
              {graph.edges.map((edge, i) => (
                <GraphEdge key={i} edge={edge} nodes={nodeMap} />
              ))}

              {/* Nodes */}
              {graph.nodes.map((node) => (
                <GraphNode
                  key={node.key}
                  node={node}
                  isSelected={selectedNode === node.key}
                  onSelect={setSelectedNode}
                  scale={scale}
                />
              ))}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 p-2 bg-card/90 rounded-lg border text-xs space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Disabled</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-green-500/50" />
                <span>Satisfied</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3 text-red-500/50" />
                <span>Unsatisfied</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected Node Details */}
        {selectedNodeData && (
          <div className="mt-4 p-4 rounded-lg bg-muted/50">
            <h4 className="font-medium mb-2">{selectedNodeData.name}</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <code className="px-2 py-0.5 bg-muted rounded">
                  {selectedNodeData.key}
                </code>
                <Badge variant={selectedNodeData.enabled ? "default" : "secondary"}>
                  {selectedNodeData.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge variant="outline">{selectedNodeData.category}</Badge>
              </div>
              {selectedNodeData.dependencies.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Depends on: </span>
                  {selectedNodeData.dependencies.map((d) => (
                    <Badge
                      key={d}
                      variant="outline"
                      className="mr-1 cursor-pointer"
                      onClick={() => setSelectedNode(d)}
                    >
                      {d}
                    </Badge>
                  ))}
                </div>
              )}
              {selectedNodeData.dependents.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Required by: </span>
                  {selectedNodeData.dependents.map((d) => (
                    <Badge
                      key={d}
                      variant="outline"
                      className="mr-1 cursor-pointer"
                      onClick={() => setSelectedNode(d)}
                    >
                      {d}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DependencyGraphWidget;
