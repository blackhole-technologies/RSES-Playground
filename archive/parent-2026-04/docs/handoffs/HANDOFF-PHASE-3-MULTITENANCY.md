# RSES CMS Handoff - Phase 3: Multi-tenancy

**Date**: 2026-02-02
**Version**: 0.7.0
**Status**: Site Isolation for Feature Flags Complete

---

## Overview

Implemented multi-tenancy support for feature flags with site isolation using AsyncLocalStorage context.

---

## New Files

| File | Purpose |
|------|---------|
| `server/services/feature-flags/site-scoped.ts` | Site-scoped feature flags service |
| `server/services/feature-flags/site-routes.ts` | Tenant-isolated API routes |

---

## Architecture

### Site Scoping Strategy

```
Global Flag: "dark_mode"
Site A Override: "site:site-a:dark_mode"
Site B Override: "site:site-b:dark_mode"
```

**Key prefixing**: Site-specific flags use `site:{siteId}:{key}` format.

### Evaluation Priority

1. Site-specific flag (highest priority)
2. Global flag (fallback)

### Inheritance

- Global flags automatically available to all sites
- Sites can override global flags by creating site-specific versions
- Deleting site-specific flag restores global flag behavior

---

## API Endpoints

### Site-Scoped Routes (`/api/site/feature-flags`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List flags for current site |
| GET | `/:key` | Get flag (site or inherited global) |
| POST | `/` | Create site-scoped flag |
| PUT | `/:key` | Update flag (creates override if global) |
| DELETE | `/:key` | Delete site-specific flag only |
| POST | `/:key/enable` | Enable flag for site |
| POST | `/:key/disable` | Disable flag for site |
| POST | `/evaluate` | Evaluate flag with site context |
| POST | `/evaluate-batch` | Batch evaluate |
| GET | `/enabled/list` | Get enabled flags for site |
| GET | `/:key/user-overrides` | Get user overrides |
| PUT | `/:key/user-overrides/:userId` | Set user override |
| GET | `/:key/stats` | Get usage stats |
| GET | `/:key/history` | Get rollout history |
| POST | `/cache/clear` | Clear site cache |

### Headers

```
X-Site-ID: {siteId}  # Required for site-scoped routes
```

---

## Usage Examples

### Create Site-Specific Flag

```typescript
// POST /api/site/feature-flags
{
  "key": "new_checkout",
  "name": "New Checkout Flow",
  "description": "Beta checkout for this site",
  "category": "beta",
  "globallyEnabled": true,
  "scope": "site"  // "site" | "network" | "global"
}
```

### Override Global Flag

```typescript
// PUT /api/site/feature-flags/dark_mode
{
  "globallyEnabled": false
}
// Creates site:site-a:dark_mode with globallyEnabled=false
```

### Evaluate with Site Context

```typescript
// POST /api/site/feature-flags/evaluate
{
  "featureKey": "dark_mode",
  "context": {
    "userId": "user-123"
  }
}
// Automatically includes siteId from request context
```

---

## Service API

```typescript
import { getSiteScopedFeatureFlagsService } from "./services/feature-flags";

// Within request context (site context available)
const service = getSiteScopedFeatureFlagsService();

// All operations auto-scope to current site
const flags = await service.getAllFlags();
const isEnabled = await service.isEnabled("dark_mode");
const result = await service.evaluate("checkout_v2");

// Create site-specific flag
await service.createFlag(
  { key: "site_promo", name: "Site Promo", ... },
  { scope: "site" }
);

// Override global flag for this site
await service.disableFlag("global_feature"); // Creates site override
```

---

## Tenant Isolation

### Middleware Stack

```
1. createTenantIsolationMiddleware() - Creates isolation context
2. enforceSiteIsolation() - Validates cross-site access
3. requireSiteContext() - Ensures X-Site-ID header
```

### Security

- All site-scoped routes require valid site context
- Cannot access other sites' flags
- Global flags readable but override requires site context
- Audit logging for all operations

---

## Response Format

### List Flags

```json
{
  "data": [
    {
      "key": "dark_mode",
      "name": "Dark Mode",
      "siteId": null,
      "inherited": true,
      "globallyEnabled": true,
      ...
    },
    {
      "key": "site_promo",
      "name": "Site Promo",
      "siteId": "site-a",
      "inherited": false,
      "globallyEnabled": true,
      ...
    }
  ],
  "total": 2,
  "siteId": "site-a"
}
```

---

## Migration Notes

### Existing Flags

- All existing flags become "global" flags
- No migration required
- Sites can override as needed

### Dual API

- `/api/admin/feature-flags/*` - Global admin operations
- `/api/site/feature-flags/*` - Site-scoped operations

---

## Build

```
Build: ✅
Version: 0.7.0
```

---

*Phase 3 Multi-tenancy: 2026-02-02*
