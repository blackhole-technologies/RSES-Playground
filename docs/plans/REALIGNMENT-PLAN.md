# REALIGNMENT-PLAN.md - RSES CMS Phase 1 Foundation Alignment

**Version:** 1.0.0
**Date:** 2026-02-01
**Current Alignment:** 35%
**Target Alignment:** 100%

---

## Executive Summary

The project has significant infrastructure built but suffers from **integration gaps**. Core components exist in isolation. The kernel system (unplanned) represents positive drift that should be formalized as Phase 0.

---

## Phase 0: Pre-Foundation (KERNEL - Unplanned Positive Drift)

**Status:** COMPLETE (formalize designation)

The kernel system was built ahead of plan. Formalize as Phase 0.

### Existing Components

| Component | Path | Lines | Status |
|-----------|------|-------|--------|
| DI Container | `/server/kernel/container.ts` | ~300 | Complete |
| Event Bus | `/server/kernel/events.ts` | ~400 | Complete |
| Module Registry | `/server/kernel/registry.ts` | ~500 | Complete |
| API Gateway | `/server/kernel/gateway.ts` | ~400 | Complete |
| Bootstrap | `/server/kernel/bootstrap.ts` | ~690 | Complete |
| WS Bridge | `/server/kernel/ws-bridge.ts` | ~100 | Complete |

### Integration Points

```
/server/kernel/index.ts        <- Main export
/server/kernel-integration.ts  <- Express integration (OPTIONAL via ENABLE_KERNEL=true)
```

### Task 0.1: Formalize Kernel as Foundation

**No code changes needed** - Document kernel as official Phase 0 deliverable.

---

## Phase 1: Foundation Infrastructure (P0)

### Requirement 1: Site Context Middleware (AsyncLocalStorage)

**Status:** EXISTS but NOT INTEGRATED

#### Existing Code

```
/server/multisite/site/site-context.ts (559 lines)
```

**Key Exports:**
- `siteContextStorage` - AsyncLocalStorage instance
- `getSiteContext()` - Get current context (throws if none)
- `tryGetSiteContext()` - Get context or undefined
- `runWithSiteContext()` - Run function with context
- `createSiteContextMiddleware()` - Express middleware factory
- `SiteScopedRepository` - Base class for site-scoped data

**Dependencies Required:**
- `NetworkDatabase` - Site config lookup
- `ShardRouter` - Database pool routing
- `FeatureService` - Feature flag resolution
- `CacheService` - Scoped caching
- `Logger` - Logging

#### Integration Tasks

| Task | File | Changes | Priority |
|------|------|---------|----------|
| 1.1 | `/server/index.ts` | Import and wire middleware after auth | P0 |
| 1.2 | `/server/multisite/types.ts` | Create/verify type exports | P0 |
| 1.3 | `/server/services/network-db.ts` | Implement NetworkDatabase adapter | P0 |
| 1.4 | `/server/services/shard-router.ts` | Implement ShardRouter adapter | P1 |

**Integration Point (server/index.ts line ~111):**

```typescript
// After: app.use("/api/auth", authRoutes);
// Add:
import { createSiteContextMiddleware } from "./multisite/site/site-context";
import { networkDb, shardRouter, featureService, cacheService } from "./services";

app.use(createSiteContextMiddleware({
  networkDb,
  shardRouter,
  featureService,
  cacheService,
  logger: createModuleLogger("site-context"),
}));
```

---

### Requirement 2: Domain Routing and Resolution

**Status:** EXISTS but NOT INTEGRATED

#### Existing Code

```
/server/multisite/routing/domain-router.ts (707 lines)
```

**Key Exports:**
- `DomainRouter` - Main routing service
- `EdgeDomainRouter` - CDN/edge worker variant
- `DomainRegistry` interface - Persistence abstraction
- `DNSProvider` interface - DNS operations

**Features Implemented:**
- Subdomain pattern matching (preview-*, branch--)
- Custom domain registration
- DNS verification (CNAME + TXT)
- Domain caching
- SSL status tracking

#### Integration Tasks

| Task | File | Changes | Priority |
|------|------|---------|----------|
| 2.1 | `/server/services/domain-registry.ts` | Implement DomainRegistry with DB | P0 |
| 2.2 | `/server/services/dns-provider.ts` | Implement DNS verification | P1 |
| 2.3 | `/server/kernel/container.ts` | Register DomainRouter in DI | P0 |
| 2.4 | `/server/routes.ts` | Add domain management API routes | P1 |

---

### Requirement 3: Feature Flag Evaluation Engine

**Status:** EXISTS but NOT INTEGRATED

#### Existing Code

```
/server/services/feature-flags/
├── index.ts          (818 lines) - Main service
├── evaluator.ts      - Flag evaluation logic
├── storage.ts        - In-memory storage (needs DB)
├── dependency-resolver.ts - Flag dependencies
├── routes.ts         - API routes
└── types.ts          - Type definitions
```

**Key Exports:**
- `FeatureFlagsService` - Full CRUD + evaluation
- `getFeatureFlagsService()` - Singleton accessor
- `FeatureFlagEvaluator` - Core evaluation engine

**Features Implemented:**
- Global, site, user-level flags
- Percentage rollouts
- A/B testing variants
- Dependency management
- Usage statistics
- Rollout history

#### Integration Tasks

| Task | File | Changes | Priority |
|------|------|---------|----------|
| 3.1 | `/server/index.ts` | Mount feature-flag routes | P0 |
| 3.2 | `/server/services/feature-flags/storage.ts` | Replace InMemory with PostgreSQL | P1 |
| 3.3 | `/server/multisite/site/site-context.ts` | Wire FeatureService interface | P0 |
| 3.4 | `/server/kernel/container.ts` | Register FeatureFlagsService | P0 |

**Route Integration (server/index.ts):**

```typescript
import featureFlagRoutes from "./services/feature-flags/routes";
app.use("/api/feature-flags", featureFlagRoutes);
```

---

### Requirement 4: Tenant Isolation Layer

**Status:** EXISTS but NOT INTEGRATED

#### Existing Code

```
/server/security/multisite/
├── tenant-isolation.ts (1376 lines) - Full implementation
├── types.ts           - Type definitions
└── index.ts           - Exports
```

**Key Exports:**
- `TenantIsolationService` - Full tenant/site management
- `tenantIsolation` - Singleton instance
- `IsolationContext` - Request-scoped isolation

**Features Implemented:**
- Tenant CRUD
- Site CRUD with limits
- Isolation context creation/validation
- Cross-site access policies
- Per-site encryption keys
- Key rotation
- Security incident management
- Comprehensive audit logging

#### Integration Tasks

| Task | File | Changes | Priority |
|------|------|---------|----------|
| 4.1 | `/server/multisite/site/site-context.ts` | Use TenantIsolation for context | P0 |
| 4.2 | `/server/routes.ts` | Add tenant management routes | P1 |
| 4.3 | `/server/kernel/container.ts` | Register TenantIsolationService | P0 |
| 4.4 | `/server/middleware/isolation.ts` | Create request isolation middleware | P0 |

---

### Requirement 5: Basic Admin Dashboard

**Status:** EXISTS (Frontend Components)

#### Existing Code

```
/client/src/modules/admin/
├── components/
│   ├── AdminDashboard.tsx
│   ├── FeatureFlagList.tsx
│   ├── FeatureFlagCard.tsx
│   ├── FeatureFlagDetail.tsx
│   ├── DependencyGraph.tsx
│   ├── DashboardWidgets.tsx
│   └── SiteCard.tsx
├── hooks/
│   ├── use-feature-flags.ts
│   └── use-sites.ts
└── types/
    └── index.ts
```

#### Integration Tasks

| Task | File | Changes | Priority |
|------|------|---------|----------|
| 5.1 | `/client/src/App.tsx` | Add admin route | P0 |
| 5.2 | `/server/routes.ts` | Ensure API endpoints exist | P0 |
| 5.3 | `/client/src/modules/admin/hooks/` | Connect to real API | P1 |

---

## Integration Wiring Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT STATE (ISOLATED)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐│
│   │  Site        │   │  Domain      │   │  Feature     │   │  Tenant      ││
│   │  Context     │   │  Router      │   │  Flags       │   │  Isolation   ││
│   │  (ISOLATED)  │   │  (ISOLATED)  │   │  (ISOLATED)  │   │  (ISOLATED)  ││
│   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TARGET STATE (INTEGRATED)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                           KERNEL (DI Container)                        │ │
│   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │ │
│   │  │ EventBus   │  │ Registry   │  │ Gateway    │  │ Container      │  │ │
│   │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │                        EXPRESS MIDDLEWARE CHAIN                        │ │
│   │                                                                        │ │
│   │   Security → Logger → DomainRouter → SiteContext → IsolationGuard    │ │
│   │                                          │                            │ │
│   │                                          ▼                            │ │
│   │                              FeatureFlags.resolveFeatures()           │ │
│   │                                          │                            │ │
│   │                                          ▼                            │ │
│   │                              TenantIsolation.createContext()          │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Concrete Code Changes

### File: `/server/index.ts`

**Line ~111 (after auth routes):**

```typescript
// ==========================================================================
// PHASE 1 FOUNDATION - MULTI-SITE INFRASTRUCTURE
// ==========================================================================

// Import foundation services
import { createSiteContextMiddleware, getSiteContext } from "./multisite/site/site-context";
import { DomainRouter } from "./multisite/routing/domain-router";
import { getFeatureFlagsService } from "./services/feature-flags";
import { tenantIsolation } from "./security/multisite/tenant-isolation";

// Create adapters (implement these)
const networkDb = createNetworkDbAdapter();
const shardRouter = createShardRouterAdapter();
const domainRegistry = createDomainRegistryAdapter();
const dnsProvider = createDnsProviderAdapter();

// Initialize domain router
const domainRouter = new DomainRouter(
  domainRegistry,
  dnsProvider,
  createModuleLogger("domain-router")
);

// Feature flags service (already singleton)
const featureService = {
  resolveFeatures: async (siteId: string, tier: string) => {
    const service = getFeatureFlagsService();
    const context = { siteId, tier };
    const enabled = await service.getEnabledFeatures(context);
    return Object.fromEntries(enabled.map(k => [k, true]));
  }
};

// Site context middleware
app.use("/api", createSiteContextMiddleware({
  networkDb,
  shardRouter,
  featureService,
  cacheService: createCacheServiceAdapter(),
  logger: createModuleLogger("site-context"),
}));

// Feature flags API routes
import featureFlagRoutes from "./services/feature-flags/routes";
app.use("/api/admin/feature-flags", featureFlagRoutes);
```

### File: `/server/services/adapters/network-db.ts` (NEW)

```typescript
import type { NetworkDatabase, SiteConfig } from "../../multisite/site/site-context";

export function createNetworkDbAdapter(): NetworkDatabase {
  return {
    async getSiteConfig(siteId: string): Promise<SiteConfig | null> {
      // TODO: Query database
      // For now, return mock for development
      return {
        siteId,
        status: "active",
        tier: "professional",
        schemaName: `site_${siteId}`,
        // ... other config
      };
    },

    async getSiteByDomain(domain: string): Promise<SiteConfig | null> {
      // TODO: Query domain_mappings table
      return null;
    }
  };
}
```

---

## Checkpoint Schedule

### Checkpoint 1: Kernel Formalization (Day 1)

- [ ] Document kernel as Phase 0
- [ ] Verify kernel integration works (ENABLE_KERNEL=true)
- [ ] Test module loading/unloading

### Checkpoint 2: Site Context Integration (Day 2-3)

- [ ] Create adapter implementations
- [ ] Wire middleware into Express chain
- [ ] Test context propagation
- [ ] Verify `getSiteContext()` works in routes

### Checkpoint 3: Feature Flags Wired (Day 3-4)

- [ ] Mount API routes
- [ ] Connect FeatureService adapter
- [ ] Test flag evaluation in requests
- [ ] Verify admin UI loads flags

### Checkpoint 4: Tenant Isolation Active (Day 4-5)

- [ ] Create isolation middleware
- [ ] Wire TenantIsolationService
- [ ] Test cross-tenant blocking
- [ ] Verify audit logging

### Checkpoint 5: Full Integration Test (Day 5-6)

- [ ] End-to-end request flow test
- [ ] Multi-site request isolation verified
- [ ] Feature flag per-site override works
- [ ] Admin dashboard shows real data
- [ ] All P0 criteria pass

---

## Drift Detection Metrics

| Metric | Current | Target | Check Frequency |
|--------|---------|--------|-----------------|
| Site context middleware active | NO | YES | Daily |
| Feature flags API mounted | NO | YES | Daily |
| Domain router integrated | NO | YES | Daily |
| Tenant isolation middleware | NO | YES | Daily |
| Admin dashboard connected | PARTIAL | YES | Daily |
| Cross-tenant requests blocked | UNKNOWN | 100% | Per PR |
| Feature eval latency | N/A | <5ms | Per deploy |

---

## Success Criteria (Phase 1 Complete)

From CMS-MASTER-PLAN-FINAL.md:

- [ ] Site context propagates correctly in 100% of requests
- [ ] Feature flags evaluate in <5ms
- [ ] Security tests pass with 0 critical vulnerabilities

**Additional Verification:**

```bash
# Test site context
curl -H "X-Site-ID: test-site" https://localhost:5000/api/projects
# Response should include X-Site-ID header in response

# Test feature flags
curl https://localhost:5000/api/admin/feature-flags
# Should return flag list

# Test domain resolution
curl -H "Host: mysite.rses-network.com" https://localhost:5000/api/health
# Should resolve to correct site
```

---

## Files Summary

### Must Create (Adapters)

| File | Purpose |
|------|---------|
| `/server/services/adapters/network-db.ts` | Database adapter for site configs |
| `/server/services/adapters/shard-router.ts` | Database pool routing |
| `/server/services/adapters/domain-registry.ts` | Domain persistence |
| `/server/services/adapters/cache-service.ts` | Redis/memory cache |
| `/server/middleware/isolation.ts` | Request isolation guard |

### Must Modify

| File | Changes |
|------|---------|
| `/server/index.ts` | Wire all middleware |
| `/server/routes.ts` | Add admin API routes |
| `/client/src/App.tsx` | Mount admin dashboard |

### Existing (Verify Types Match)

| File | Status |
|------|--------|
| `/server/multisite/types.ts` | Verify exports |
| `/server/multisite/site/site-context.ts` | Ready to integrate |
| `/server/multisite/routing/domain-router.ts` | Ready to integrate |
| `/server/services/feature-flags/index.ts` | Ready to integrate |
| `/server/security/multisite/tenant-isolation.ts` | Ready to integrate |

---

## Appendix: Current File Inventory

### Kernel System (Phase 0 - Complete)

```
/server/kernel/
├── bootstrap.ts      (690 lines)
├── container.ts      (~300 lines)
├── contracts/
│   ├── kernel-contracts.ts
│   └── subsystem-ports.ts
├── events.ts         (~400 lines)
├── gateway.ts        (~400 lines)
├── index.ts          (289 lines)
├── registry.ts       (~500 lines)
├── types.ts
└── ws-bridge.ts      (~100 lines)
```

### Multi-Site Infrastructure (Needs Integration)

```
/server/multisite/
├── routing/
│   └── domain-router.ts  (707 lines)
├── site/
│   └── site-context.ts   (559 lines)
└── types.ts
```

### Feature Flags (Needs Integration)

```
/server/services/feature-flags/
├── dependency-resolver.ts
├── evaluator.ts
├── index.ts              (818 lines)
├── routes.ts
├── storage.ts
└── types.ts
```

### Security (Needs Integration)

```
/server/security/
├── multisite/
│   ├── tenant-isolation.ts  (1376 lines)
│   ├── types.ts
│   └── index.ts
└── ... (other security modules)
```

### Admin Dashboard (Partial Integration)

```
/client/src/modules/admin/
├── components/
│   ├── AdminDashboard.tsx
│   ├── DashboardWidgets.tsx
│   ├── DependencyGraph.tsx
│   ├── FeatureFlagCard.tsx
│   ├── FeatureFlagDetail.tsx
│   ├── FeatureFlagList.tsx
│   ├── SiteCard.tsx
│   └── index.ts
├── hooks/
│   ├── use-feature-flags.ts
│   ├── use-sites.ts
│   └── index.ts
├── types/
│   └── index.ts
└── index.ts
```
