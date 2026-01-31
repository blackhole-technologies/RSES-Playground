/**
 * @file DependencyGraph.tsx
 * @description Feature dependency visualization component
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FeatureFlag, FeatureCategory } from "@shared/admin/types";
import type { DependencyGraphData, GraphNode, GraphEdge } from "../types";

// =============================================================================
// ICONS
// =============================================================================

const ZoomInIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ResetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

// =============================================================================
// CATEGORY COLORS
// =============================================================================

const categoryColors: Record<FeatureCategory, { fill: string; stroke: string }> = {
  core: { fill: "#dbeafe", stroke: "#3b82f6" },
  optional: { fill: "#dcfce7", stroke: "#22c55e" },
  beta: { fill: "#fef3c7", stroke: "#f59e0b" },
  experimental: { fill: "#f3e8ff", stroke: "#a855f7" },
  deprecated: { fill: "#fee2e2", stroke: "#ef4444" },
};

// =============================================================================
// GRAPH LAYOUT ALGORITHM
// =============================================================================

function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): GraphNode[] {
  // Simple force-directed layout simulation
  const positioned = nodes.map((node, i) => ({
    ...node,
    x: Math.random() * (width - 100) + 50,
    y: Math.random() * (height - 60) + 30,
    vx: 0,
    vy: 0,
  }));

  const nodeMap = new Map(positioned.map((n) => [n.id, n]));

  // Run simulation
  const iterations = 100;
  const kRepel = 5000;
  const kAttract = 0.1;
  const centerX = width / 2;
  const centerY = height / 2;

  for (let i = 0; i < iterations; i++) {
    // Repulsion between all nodes
    for (let j = 0; j < positioned.length; j++) {
      for (let k = j + 1; k < positioned.length; k++) {
        const n1 = positioned[j];
        const n2 = positioned[k];
        const dx = n2.x! - n1.x!;
        const dy = n2.y! - n1.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = kRepel / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        n1.vx! -= fx;
        n1.vy! -= fy;
        n2.vx! += fx;
        n2.vy! += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const dx = target.x! - source.x!;
      const dy = target.y! - source.y!;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = kAttract * dist;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      source.vx! += fx;
      source.vy! += fy;
      target.vx! -= fx;
      target.vy! -= fy;
    }

    // Center attraction
    for (const node of positioned) {
      node.vx! += (centerX - node.x!) * 0.01;
      node.vy! += (centerY - node.y!) * 0.01;
    }

    // Apply velocities with damping
    const damping = 0.85;
    for (const node of positioned) {
      node.x! += node.vx! * damping;
      node.y! += node.vy! * damping;
      node.vx! *= damping;
      node.vy! *= damping;

      // Keep within bounds
      node.x = Math.max(60, Math.min(width - 60, node.x!));
      node.y = Math.max(30, Math.min(height - 30, node.y!));
    }
  }

  return positioned;
}

// =============================================================================
// COMPONENT
// =============================================================================

export interface DependencyGraphProps {
  flags: FeatureFlag[];
  selectedFlagKey?: string | null;
  onSelectFlag?: (key: string) => void;
  height?: number;
}

export function DependencyGraph({
  flags,
  selectedFlagKey,
  onSelectFlag,
  height = 400,
}: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Build graph data
  const graphData = useMemo<DependencyGraphData>(() => {
    const nodes: GraphNode[] = flags.map((flag) => ({
      id: flag.key,
      label: flag.name,
      enabled: flag.globallyEnabled,
      category: flag.category,
    }));

    const edges: GraphEdge[] = [];
    for (const flag of flags) {
      for (const dep of flag.dependencies) {
        edges.push({
          source: dep.featureKey,
          target: flag.key,
          type: dep.requiredState ? "requires" : "optional",
        });
      }
    }

    return { nodes, edges };
  }, [flags]);

  // Layout nodes
  const layoutedNodes = useMemo(() => {
    return layoutGraph(graphData.nodes, graphData.edges, dimensions.width, dimensions.height);
  }, [graphData, dimensions]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [height]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.3));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Get connected nodes for highlighting
  const connectedNodes = useMemo(() => {
    const nodes = new Set<string>();
    if (hoveredNode || selectedFlagKey) {
      const key = hoveredNode || selectedFlagKey;
      nodes.add(key!);
      for (const edge of graphData.edges) {
        if (edge.source === key || edge.target === key) {
          nodes.add(edge.source);
          nodes.add(edge.target);
        }
      }
    }
    return nodes;
  }, [hoveredNode, selectedFlagKey, graphData.edges]);

  const nodeMap = new Map(layoutedNodes.map((n) => [n.id, n]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Dependency Graph</CardTitle>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleZoomIn}>
                    <ZoomInIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom In</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleZoomOut}>
                    <ZoomOutIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom Out</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <ResetIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset View</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={containerRef}
          className="relative overflow-hidden cursor-move"
          style={{ height }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            width="100%"
            height="100%"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            {/* Edges */}
            <g>
              {graphData.edges.map((edge) => {
                const source = nodeMap.get(edge.source);
                const target = nodeMap.get(edge.target);
                if (!source || !target) return null;

                const isHighlighted = connectedNodes.has(edge.source) && connectedNodes.has(edge.target);
                const midX = (source.x! + target.x!) / 2;
                const midY = (source.y! + target.y!) / 2;

                return (
                  <g key={`${edge.source}-${edge.target}`}>
                    <defs>
                      <marker
                        id={`arrow-${edge.source}-${edge.target}`}
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M 0 0 L 10 5 L 0 10 z"
                          fill={isHighlighted ? "#3b82f6" : "#94a3b8"}
                        />
                      </marker>
                    </defs>
                    <line
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={isHighlighted ? "#3b82f6" : "#e2e8f0"}
                      strokeWidth={isHighlighted ? 2 : 1}
                      strokeDasharray={edge.type === "optional" ? "4,4" : undefined}
                      markerEnd={`url(#arrow-${edge.source}-${edge.target})`}
                    />
                  </g>
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {layoutedNodes.map((node) => {
                const colors = categoryColors[node.category as FeatureCategory];
                const isSelected = node.id === selectedFlagKey;
                const isHovered = node.id === hoveredNode;
                const isConnected = connectedNodes.has(node.id);
                const opacity = connectedNodes.size === 0 || isConnected ? 1 : 0.3;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: "pointer", opacity }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFlag?.(node.id);
                    }}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    {/* Node circle */}
                    <circle
                      r={isSelected || isHovered ? 25 : 20}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                    />

                    {/* Enabled indicator */}
                    {node.enabled && (
                      <circle
                        r={4}
                        cx={15}
                        cy={-15}
                        fill="#22c55e"
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    )}

                    {/* Label */}
                    <text
                      textAnchor="middle"
                      dy="35"
                      className="text-xs font-medium fill-current"
                      style={{ pointerEvents: "none" }}
                    >
                      {node.label.length > 12 ? node.label.slice(0, 12) + "..." : node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Legend */}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 p-2 bg-background/80 rounded-md text-xs">
            {Object.entries(categoryColors).map(([category, colors]) => (
              <div key={category} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors.fill, border: `1px solid ${colors.stroke}` }}
                />
                <span className="capitalize">{category}</span>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 rounded-md px-2 py-1">
            Drag to pan, scroll to zoom
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DependencyGraph;
