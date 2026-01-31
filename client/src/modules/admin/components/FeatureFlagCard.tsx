/**
 * @file FeatureFlagCard.tsx
 * @description Feature flag card component for grid/list views
 * @phase Phase 10 - Admin Interface & Feature Toggles
 */

import React, { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
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
import type { FeatureFlag, FeatureCategory } from "@shared/admin/types";

// =============================================================================
// CATEGORY STYLES
// =============================================================================

const categoryStyles: Record<FeatureCategory, { bg: string; text: string; border: string }> = {
  core: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  optional: { bg: "bg-green-100", text: "text-green-800", border: "border-green-200" },
  beta: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" },
  experimental: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" },
  deprecated: { bg: "bg-red-100", text: "text-red-800", border: "border-red-200" },
};

const categoryLabels: Record<FeatureCategory, string> = {
  core: "Core",
  optional: "Optional",
  beta: "Beta",
  experimental: "Experimental",
  deprecated: "Deprecated",
};

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

const PercentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const DependencyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" />
    <path d="M8 3H3v5" />
    <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
    <path d="m15 9 6-6" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// =============================================================================
// COMPONENT
// =============================================================================

export interface FeatureFlagCardProps {
  flag: FeatureFlag;
  selected?: boolean;
  onSelect?: () => void;
  onToggle?: (enabled: boolean) => Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewDetails?: () => void;
  onViewHistory?: () => void;
}

export function FeatureFlagCard({
  flag,
  selected,
  onSelect,
  onToggle,
  onEdit,
  onDelete,
  onViewDetails,
  onViewHistory,
}: FeatureFlagCardProps) {
  const [toggling, setToggling] = useState(false);
  const categoryStyle = categoryStyles[flag.category];

  const handleToggle = async (checked: boolean) => {
    if (!onToggle || !flag.toggleable) return;

    setToggling(true);
    try {
      await onToggle(checked);
    } finally {
      setToggling(false);
    }
  };

  const hasRollout = flag.percentageRollout?.enabled;
  const hasTargeting = flag.targetingRules.length > 0;
  const hasDependencies = flag.dependencies.length > 0;
  const isDeprecated = flag.category === "deprecated";
  const sunsetDate = flag.sunsetDate ? new Date(flag.sunsetDate) : null;
  const isSunsetting = sunsetDate && sunsetDate > new Date();

  return (
    <Card
      className={`relative transition-all ${selected ? "ring-2 ring-primary" : ""} ${
        isDeprecated ? "opacity-75" : ""
      }`}
    >
      {/* Selection checkbox area */}
      {onSelect && (
        <div
          className="absolute top-3 left-3 cursor-pointer"
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
            <CardTitle className="text-base font-semibold truncate">
              {flag.name}
            </CardTitle>
            <CardDescription className="text-xs font-mono text-muted-foreground mt-1">
              {flag.key}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 ml-2">
            {/* Toggle switch */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch
                      checked={flag.globallyEnabled}
                      onCheckedChange={handleToggle}
                      disabled={!flag.toggleable || toggling}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {flag.toggleable
                    ? flag.globallyEnabled
                      ? "Click to disable"
                      : "Click to enable"
                    : "Cannot toggle core feature"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

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
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    Edit
                  </DropdownMenuItem>
                )}
                {onViewHistory && (
                  <DropdownMenuItem onClick={onViewHistory}>
                    View History
                  </DropdownMenuItem>
                )}
                {flag.documentationUrl && (
                  <DropdownMenuItem asChild>
                    <a href={flag.documentationUrl} target="_blank" rel="noopener noreferrer">
                      Documentation <ExternalLinkIcon />
                    </a>
                  </DropdownMenuItem>
                )}
                {onDelete && flag.toggleable && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className={onSelect ? "pl-10" : ""}>
        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {flag.description}
        </p>

        {/* Category badge */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge
            variant="outline"
            className={`${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border}`}
          >
            {categoryLabels[flag.category]}
          </Badge>

          {/* Feature indicators */}
          {hasRollout && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="gap-1">
                    <PercentIcon />
                    {flag.percentageRollout!.percentage}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Percentage rollout enabled
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {hasTargeting && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="gap-1">
                    <TargetIcon />
                    {flag.targetingRules.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {flag.targetingRules.length} targeting rule(s)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {hasDependencies && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="gap-1">
                    <DependencyIcon />
                    {flag.dependencies.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Depends on {flag.dependencies.length} feature(s)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Tags */}
        {flag.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flag.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {flag.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{flag.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className={`text-xs text-muted-foreground ${onSelect ? "pl-10" : ""}`}>
        <div className="flex items-center justify-between w-full">
          <span>
            {flag.owner ? `Owner: ${flag.owner}` : "No owner"}
          </span>

          {isSunsetting && sunsetDate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="destructive" className="text-xs">
                    Sunset: {sunsetDate.toLocaleDateString()}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  This feature is scheduled for removal
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export default FeatureFlagCard;
