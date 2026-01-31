/**
 * @file SiteCard.tsx
 * @description Site card component for multi-site dashboard
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SiteConfig, SiteHealthStatus, SiteAction } from "@shared/admin/types";

// =============================================================================
// ICONS
// =============================================================================

const MoreIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

// =============================================================================
// HEALTH STATUS STYLES
// =============================================================================

const healthStyles: Record<SiteHealthStatus, { bg: string; text: string; indicator: string }> = {
  healthy: { bg: "bg-green-100", text: "text-green-800", indicator: "bg-green-500" },
  degraded: { bg: "bg-yellow-100", text: "text-yellow-800", indicator: "bg-yellow-500" },
  unhealthy: { bg: "bg-red-100", text: "text-red-800", indicator: "bg-red-500" },
  unknown: { bg: "bg-gray-100", text: "text-gray-800", indicator: "bg-gray-500" },
};

const environmentStyles: Record<string, string> = {
  development: "bg-blue-100 text-blue-800",
  staging: "bg-orange-100 text-orange-800",
  production: "bg-green-100 text-green-800",
};

// =============================================================================
// COMPONENT
// =============================================================================

export interface SiteCardProps {
  site: SiteConfig;
  selected?: boolean;
  onSelect?: () => void;
  onAction?: (action: SiteAction) => void;
  onViewDetails?: () => void;
}

export function SiteCard({
  site,
  selected,
  onSelect,
  onAction,
  onViewDetails,
}: SiteCardProps) {
  const healthStyle = healthStyles[site.healthStatus];
  const envStyle = environmentStyles[site.environment];
  const resourceUsage = site.resourceUsage;

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const formatLastCheck = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <Card
      className={`relative transition-all hover:shadow-md ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      {/* Selection checkbox area */}
      {onSelect && (
        <div
          className="absolute top-3 left-3 cursor-pointer z-10"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-muted-foreground"
            }`}
          >
            {selected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      )}

      <CardHeader className={onSelect ? "pl-10" : ""}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Health indicator */}
              <div className={`w-2 h-2 rounded-full ${healthStyle.indicator}`} />
              <CardTitle className="text-base font-semibold truncate">
                {site.name}
              </CardTitle>
            </div>
            <CardDescription className="flex items-center gap-1 mt-1">
              <GlobeIcon />
              <span className="truncate">{site.domain}</span>
            </CardDescription>
          </div>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onViewDetails && (
                <DropdownMenuItem onClick={onViewDetails}>
                  View Details
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onAction && (
                <>
                  <DropdownMenuItem onClick={() => onAction("restart")}>
                    <RefreshIcon />
                    <span className="ml-2">Restart</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction("clear_cache")}>
                    <TrashIcon />
                    <span className="ml-2">Clear Cache</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction("sync_config")}>
                    <SettingsIcon />
                    <span className="ml-2">Sync Config</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction("deploy")}>
                    <RocketIcon />
                    <span className="ml-2">Deploy</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className={`space-y-4 ${onSelect ? "pl-10" : ""}`}>
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={envStyle}>
            {site.environment}
          </Badge>
          <Badge variant="outline" className={healthStyle.bg + " " + healthStyle.text}>
            {site.healthStatus}
          </Badge>
          <Badge variant="secondary">{site.region}</Badge>
        </div>

        {/* Resource usage */}
        {resourceUsage && (
          <div className="space-y-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">CPU</span>
                      <span>{resourceUsage.cpuPercent.toFixed(1)}%</span>
                    </div>
                    <Progress
                      value={resourceUsage.cpuPercent}
                      className="h-1.5"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  CPU Usage: {resourceUsage.cpuPercent.toFixed(1)}%
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Memory</span>
                      <span>{resourceUsage.memoryPercent.toFixed(1)}%</span>
                    </div>
                    <Progress
                      value={resourceUsage.memoryPercent}
                      className="h-1.5"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Memory Usage: {resourceUsage.memoryPercent.toFixed(1)}%
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Disk</span>
                      <span>{resourceUsage.diskPercent.toFixed(1)}%</span>
                    </div>
                    <Progress
                      value={resourceUsage.diskPercent}
                      className="h-1.5"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Disk Usage: {resourceUsage.diskPercent.toFixed(1)}%
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Version and features */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>v{site.version}</span>
          <span>{site.enabledFeatures.length} features</span>
        </div>
      </CardContent>

      <CardFooter className={`text-xs text-muted-foreground border-t pt-4 ${onSelect ? "pl-10" : ""}`}>
        <div className="flex items-center justify-between w-full">
          <span>Uptime: {formatUptime(site.uptime)}</span>
          {site.lastHealthCheck && (
            <span>Checked: {formatLastCheck(site.lastHealthCheck)}</span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export default SiteCard;
