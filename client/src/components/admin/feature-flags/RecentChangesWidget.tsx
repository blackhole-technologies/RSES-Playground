/**
 * @file RecentChangesWidget.tsx
 * @description Dashboard widget showing recent feature flag changes
 * @phase Phase 2 - Admin Widgets
 * @version 0.6.6
 * @created 2026-02-02
 */

import { useQuery } from "@tanstack/react-query";
import { useFeatureFlagsRealtime } from "@/hooks/use-feature-flags-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  History,
  ToggleRight,
  ToggleLeft,
  Plus,
  Trash2,
  Settings,
  Users,
  Building2,
  Percent,
  Target,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface RolloutEvent {
  id: string;
  featureKey: string;
  eventType: string;
  timestamp: string;
  userId: string;
  userName?: string;
  siteId?: string;
  targetUserId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

async function fetchRecentEvents(): Promise<RolloutEvent[]> {
  const res = await fetch("/api/admin/feature-flags/history?limit=20");
  const data = await res.json();
  return data.data || [];
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case "created":
      return <Plus className="h-4 w-4 text-green-500" />;
    case "enabled":
      return <ToggleRight className="h-4 w-4 text-green-500" />;
    case "disabled":
      return <ToggleLeft className="h-4 w-4 text-red-500" />;
    case "deleted":
    case "archived":
      return <Trash2 className="h-4 w-4 text-red-500" />;
    case "percentage_changed":
      return <Percent className="h-4 w-4 text-blue-500" />;
    case "targeting_updated":
      return <Target className="h-4 w-4 text-purple-500" />;
    case "override_added":
    case "override_removed":
      return <Building2 className="h-4 w-4 text-yellow-500" />;
    case "dependency_added":
    case "dependency_removed":
      return <Settings className="h-4 w-4 text-gray-500" />;
    default:
      return <Settings className="h-4 w-4 text-gray-500" />;
  }
}

function getEventLabel(eventType: string): string {
  switch (eventType) {
    case "created":
      return "Created";
    case "enabled":
      return "Enabled";
    case "disabled":
      return "Disabled";
    case "deleted":
      return "Deleted";
    case "archived":
      return "Archived";
    case "percentage_changed":
      return "Rollout Changed";
    case "targeting_updated":
      return "Targeting Updated";
    case "override_added":
      return "Override Added";
    case "override_removed":
      return "Override Removed";
    case "dependency_added":
      return "Dependency Added";
    case "dependency_removed":
      return "Dependency Removed";
    case "deprecated":
      return "Deprecated";
    default:
      return eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function getEventVariant(eventType: string): "default" | "secondary" | "destructive" | "outline" {
  switch (eventType) {
    case "created":
    case "enabled":
      return "default";
    case "disabled":
    case "deleted":
    case "archived":
      return "destructive";
    case "override_added":
    case "override_removed":
      return "secondary";
    default:
      return "outline";
  }
}

interface EventItemProps {
  event: RolloutEvent;
}

function EventItem({ event }: EventItemProps) {
  const timeAgo = formatDistanceToNow(new Date(event.timestamp), {
    addSuffix: true,
  });

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="mt-1">{getEventIcon(event.eventType)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm font-medium">{event.featureKey}</code>
          <Badge variant={getEventVariant(event.eventType)} className="text-xs">
            {getEventLabel(event.eventType)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{event.userName || event.userId}</span>
          <span>•</span>
          <span>{timeAgo}</span>
          {event.siteId && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {event.siteId}
              </span>
            </>
          )}
          {event.targetUserId && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {event.targetUserId}
              </span>
            </>
          )}
        </div>
        {event.reason && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            {event.reason}
          </p>
        )}
      </div>
    </div>
  );
}

interface LiveEventItemProps {
  event: {
    type: string;
    timestamp: number;
    data: any;
  };
}

function LiveEventItem({ event }: LiveEventItemProps) {
  const eventType = event.type.replace("feature:", "").replace(":", "_");
  const timeAgo = formatDistanceToNow(new Date(event.timestamp), {
    addSuffix: true,
  });

  const featureKey = event.data?.key || event.data?.featureKey || "unknown";

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <div className="mt-1 relative">
        {getEventIcon(eventType)}
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm font-medium">{featureKey}</code>
          <Badge variant="default" className="text-xs">
            {getEventLabel(eventType)}
          </Badge>
          <Badge variant="outline" className="text-xs animate-pulse">
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{timeAgo}</span>
          {event.data?.changes && (
            <>
              <span>•</span>
              <span>Changed: {event.data.changes.join(", ")}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecentChangesWidget() {
  const {
    data: events,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["feature-flag-history"],
    queryFn: fetchRecentEvents,
    refetchInterval: 60000, // Refresh every minute
  });

  const {
    events: liveEvents,
    isConnected,
    clearEvents,
  } = useFeatureFlagsRealtime(10);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Changes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            Failed to load recent changes
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasEvents = (events && events.length > 0) || liveEvents.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Changes
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Connection status */}
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                isConnected
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              )}
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Offline</span>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                clearEvents();
                refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasEvents ? (
          <div className="text-center text-muted-foreground py-8">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No recent changes</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {/* Live events (newest first) */}
              {liveEvents.map((event, i) => (
                <LiveEventItem key={`live-${i}`} event={event} />
              ))}

              {/* Historical events */}
              {events?.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default RecentChangesWidget;
