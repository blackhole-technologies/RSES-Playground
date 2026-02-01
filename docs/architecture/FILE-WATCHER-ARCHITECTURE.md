# RSES CMS File Watcher Architecture

## Overview

The CMS File Watcher is a comprehensive real-time file monitoring system designed for the RSES Content Management System. It provides:

- Multi-directory watching with type-specific handlers
- Event debouncing and throttling strategies
- Symlink state synchronization and healing
- Security anomaly detection
- WebSocket broadcasting
- Prometheus metrics
- Admin API for management
- launchd/systemd integration

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CMS File Watcher Service                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Content    │  │    Config    │  │    Theme     │  │    Module    │ │
│  │   Watcher    │  │   Watcher    │  │   Watcher    │  │   Watcher    │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │                 │         │
│         └────────────┬────┴────────────┬────┴────────────┬────┘         │
│                      │                 │                 │              │
│                      ▼                 ▼                 ▼              │
│              ┌──────────────────────────────────────────────────┐       │
│              │              Event Debouncer Pool                 │       │
│              │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │       │
│              │  │trailing │ │ leading │ │throttle │ │  batch  │ │       │
│              │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ │       │
│              └──────────────────────┬───────────────────────────┘       │
│                                     │                                    │
│                                     ▼                                    │
│              ┌──────────────────────────────────────────────────┐       │
│              │              Security Monitor                     │       │
│              │  • Path traversal detection                       │       │
│              │  • Rate limiting                                  │       │
│              │  • Blocked path enforcement                       │       │
│              │  • Symlink attack prevention                      │       │
│              └──────────────────────┬───────────────────────────┘       │
│                                     │                                    │
│         ┌───────────────────────────┼───────────────────────────┐       │
│         │                           │                           │       │
│         ▼                           ▼                           ▼       │
│  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐ │
│  │    Event     │           │   Symlink    │           │   Metrics    │ │
│  │     Bus      │           │   Manager    │           │  Collector   │ │
│  └──────┬───────┘           └──────┬───────┘           └──────┬───────┘ │
│         │                          │                          │         │
└─────────┼──────────────────────────┼──────────────────────────┼─────────┘
          │                          │                          │
          ▼                          ▼                          ▼
   ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
   │  WebSocket   │           │   Database   │           │  Prometheus  │
   │   Clients    │           │    Sync      │           │   /metrics   │
   └──────────────┘           └──────────────┘           └──────────────┘
```

## Directory Types

| Type | Purpose | Debounce Strategy | Typical Events |
|------|---------|-------------------|----------------|
| `content` | Project directories | Batch (2s) | Auto-classification |
| `config` | RSES config files | Trailing (500ms) | Hot reload |
| `theme` | Theme files | Throttle (100ms) | HMR, CSS inject |
| `module` | Module directories | Trailing (1s) | Module discovery |
| `symlink` | Symlink state | Leading (0ms) | DB sync, healing |
| `media` | Media uploads | Batch (1s) | Thumbnail gen |
| `cache` | Cache invalidation | Throttle (500ms) | Cache clear |
| `custom` | User-defined | Trailing (1s) | Custom handlers |

## Debounce Strategies

### Trailing (Default)
- Fires after delay with no new events
- Good for: Config changes, saves
- Combines rapid successive events

```
Events:  ─●──●──●────────────────────────►
Fired:   ─────────────────●──────────────►
                          └─ After 500ms silence
```

### Leading
- Fires immediately on first event
- Ignores subsequent events during delay
- Good for: Real-time symlink updates

```
Events:  ─●──●──●────────────────────────►
Fired:   ─●──────────────────────────────►
          └─ Immediate, ignore next for delay
```

### Throttle
- Fires at most once per interval
- Good for: Theme hot reload
- Prevents overloading

```
Events:  ─●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●─►
Fired:   ─●─────●─────●─────●─────●─────●►
          └─────┴─────┴─────┴─────┴─────┘
                   100ms intervals
```

### Batch
- Collects events until size or time limit
- Good for: Bulk operations
- Efficient for many small changes

```
Events:  ─●●●●●●●●●●●●────────────────────►
Fired:   ────────────[●●●●●●●●●●●●]───────►
                     └─ Batch of 12 events
```

## Security Features

### Path Traversal Detection
```typescript
// Blocked patterns
"../../../etc/passwd"  // ❌ Path traversal
"./hidden/../secret"   // ❌ Relative traversal
"/allowed/path/file"   // ✓ Absolute allowed path
```

### Rate Limiting
- Default: 100 events/second per path
- Configurable per client
- Automatic throttling

### Blocked Paths
```typescript
const BLOCKED = [
  "/etc", "/var", "/usr", "/bin",
  "/sbin", "/root", "/System"
];
```

### Symlink Attack Prevention
- Maximum symlink depth: 10
- Circular reference detection
- External target validation

## Symlink Management

### State Tracking
```typescript
interface SymlinkState {
  linkPath: string;      // /by-topic/ai/my-project
  targetPath: string;    // ../../projects/my-project
  resolvedTarget: string;// /projects/my-project
  isValid: boolean;      // true if target exists
  category: string;      // by-topic/ai
  lastVerified: number;  // timestamp
  dbRecordId?: number;   // database FK
  syncStatus: "synced" | "pending" | "error";
}
```

### Healing Algorithm
1. Detect broken symlink
2. Extract target name
3. Search configured paths
4. Create new symlink with updated path
5. Update database record
6. Emit WebSocket notification

## WebSocket Integration

### Channels
| Channel | Purpose | Subscribers |
|---------|---------|-------------|
| `files` | All file events | Developers |
| `files:content` | Content only | Editors |
| `files:theme` | Theme only | Theme devs |
| `symlinks` | Symlink state | All |
| `health` | Health updates | Admin |
| `security` | Security events | Admin |
| `admin` | All admin events | Admin |

### Message Types
```typescript
// Server -> Client
type ServerMessage =
  | WSFileEventMessage
  | WSFileBatchMessage
  | WSWatcherHealthMessage
  | WSSecurityAnomalyMessage
  | WSSymlinkStateMessage
  | WSAutoClassifyResultMessage
  | WSConfigReloadMessage
  | WSThemeReloadMessage;

// Client -> Server
type ClientMessage =
  | WSAddWatchRequest
  | WSRemoveWatchRequest
  | WSRescanRequest
  | WSHealSymlinksRequest;
```

## Admin API

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/watchers` | List all watchers |
| GET | `/api/admin/watchers/:path` | Get watcher details |
| POST | `/api/admin/watchers` | Create watcher |
| PATCH | `/api/admin/watchers/:path` | Update watcher |
| DELETE | `/api/admin/watchers/:path` | Remove watcher |
| GET | `/api/admin/health` | Health status |
| GET | `/api/admin/metrics` | Prometheus metrics |
| GET | `/api/admin/symlinks` | List symlinks |
| GET | `/api/admin/symlinks/broken` | List broken |
| POST | `/api/admin/symlinks/heal` | Heal symlinks |
| POST | `/api/admin/start` | Start service |
| POST | `/api/admin/stop` | Stop service |
| POST | `/api/admin/restart` | Restart service |

## Metrics

### Prometheus Metrics

```prometheus
# File events
file_watcher_events_total{event_type,directory_type,watch_root}
file_watcher_event_processing_seconds{event_type,directory_type}
file_watcher_debounced_events_total{directory_type}

# Watcher state
file_watcher_active_count
file_watcher_watched_paths_count{directory_type}
file_watcher_pending_events_count{directory_type}
file_watcher_health_status

# Symlinks
file_watcher_symlinks_tracked_total
file_watcher_broken_symlinks_count
file_watcher_symlinks_healed_total

# Security
file_watcher_security_anomalies_total{type,severity}
file_watcher_rate_limit_violations_total{path_prefix}

# Resources
file_watcher_memory_bytes
file_watcher_errors_total{error_type,directory_type}
```

## Production Deployment

### macOS (launchd)

```bash
# Generate plist
node -e "console.log(require('./file-watcher-cms').generateLaunchdPlist('/opt/rses'))" \
  > /Library/LaunchDaemons/com.rses.cms.filewatcher.plist

# Load and start
sudo launchctl load /Library/LaunchDaemons/com.rses.cms.filewatcher.plist
sudo launchctl start com.rses.cms.filewatcher

# View logs
tail -f /var/log/rses-filewatcher.log
```

### Linux (systemd)

```bash
# Generate service file
node -e "console.log(require('./file-watcher-cms').generateSystemdService('/opt/rses', '/var/lib/rses'))" \
  > /etc/systemd/system/rses-filewatcher.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable rses-filewatcher
sudo systemctl start rses-filewatcher

# View logs
journalctl -u rses-filewatcher -f
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WATCHER_CONFIG_PATH` | Config file path | - |
| `WATCHER_HTTP_PORT` | Health/metrics port | 9090 |
| `NODE_ENV` | Environment | development |
| `LOG_LEVEL` | Log level | info |

## Crash Recovery

The daemon implements exponential backoff for crash recovery:

```
Crash 1: Wait 1s, restart
Crash 2: Wait 2s, restart
Crash 3: Wait 4s, restart
Crash 4: Wait 8s, restart
Crash 5: Wait 16s, restart
Crash 6: Give up, exit with error
```

Crash count resets after 5 minutes of stability.

## Files

| File | Purpose |
|------|---------|
| `server/services/file-watcher-cms.ts` | Main service and types |
| `server/services/file-watcher-metrics.ts` | Prometheus metrics |
| `server/services/file-watcher-daemon.ts` | Standalone daemon |
| `server/ws/file-watcher-types.ts` | WebSocket message types |
| `server/routes/watcher-admin.ts` | Admin API routes |
| `docs/file-watcher-config.example.json` | Example configuration |

## Usage Example

```typescript
import {
  getCMSFileWatcher,
  setupFileWatcherWebSocket,
} from "./services/file-watcher-cms";
import { getWSServer } from "./ws";

// Initialize watcher
const watcher = getCMSFileWatcher({
  directories: [
    {
      path: "/projects",
      type: "content",
      enabled: true,
      debounce: { strategy: "batch", delayMs: 2000 },
    },
  ],
  security: {
    allowedBasePaths: ["/projects", "/home/user"],
  },
});

// Register handlers
watcher.registerHandler("content", async (event) => {
  console.log("Content changed:", event.path);
  // Trigger auto-classification
});

watcher.registerBatchHandler("content", async (batch) => {
  console.log("Batch of", batch.events.length, "events");
  // Process batch efficiently
});

// Setup WebSocket integration
const ws = getWSServer();
if (ws) {
  setupFileWatcherWebSocket(watcher, (msg, channel) => {
    ws.broadcast(msg, channel);
  });
}

// Start watching
await watcher.start();
```

## Testing

```bash
# Unit tests
npm run test -- --grep "file-watcher"

# Integration tests
npm run test:integration -- --grep "watcher"

# Load testing
npm run test:load -- --watcher
```
