# RSES CMS Multi-Site Deployment Architecture

**Version:** 1.0.0
**Classification:** Enterprise Multi-Tenant Architecture
**Architecture Pattern:** Multi-Site Network with Hybrid Tenancy
**Design Horizon:** 2026-2036

---

## Executive Summary

This document defines the multi-site deployment architecture for RSES CMS, enabling:

1. **Single Codebase, Multiple Sites**: Deploy once, serve many
2. **Flexible Tenancy Models**: Single-tenant, multi-tenant, and hybrid options
3. **Centralized Management**: Network-wide administration with site autonomy
4. **Edge Deployment**: CDN-based delivery for global performance
5. **Automated Provisioning**: Self-service site creation with full automation

---

## Table of Contents

1. [Multi-Site Architecture](#1-multi-site-architecture)
2. [Deployment Models](#2-deployment-models)
3. [Database Sharding Strategy](#3-database-sharding-strategy)
4. [Domain Mapping and Routing](#4-domain-mapping-and-routing)
5. [Site Context Management](#5-site-context-management)
6. [Multi-Site Dashboard](#6-multi-site-dashboard)
7. [Site Provisioning Automation](#7-site-provisioning-automation)
8. [Directory Structure](#8-directory-structure)
9. [Implementation Interfaces](#9-implementation-interfaces)

---

## 1. Multi-Site Architecture

### 1.1 Architecture Overview

```
                                    RSES CMS Multi-Site Network

    ┌──────────────────────────────────────────────────────────────────────────────────┐
    │                           EDGE LAYER (Global CDN)                                 │
    │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
    │  │ Edge PoP│  │ Edge PoP│  │ Edge PoP│  │ Edge PoP│  │ Edge PoP│               │
    │  │  US-E   │  │  US-W   │  │   EU    │  │  APAC   │  │  LATAM  │               │
    │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘               │
    │       │            │            │            │            │                      │
    │       └────────────┴────────────┴─────┬──────┴────────────┘                      │
    └───────────────────────────────────────┼──────────────────────────────────────────┘
                                            │
    ┌───────────────────────────────────────┼──────────────────────────────────────────┐
    │                           ROUTING LAYER                                           │
    │                    ┌──────────────────┴───────────────────┐                      │
    │                    │     Site Router / Load Balancer      │                      │
    │                    │   (Domain Resolution + Site Context)  │                      │
    │                    └──────────────────┬───────────────────┘                      │
    │                                       │                                           │
    │       ┌───────────────────────────────┼───────────────────────────────┐          │
    │       │                               │                               │          │
    │  ┌────┴─────┐                  ┌──────┴──────┐                 ┌──────┴─────┐    │
    │  │ Site A   │                  │   Site B    │                 │  Site C    │    │
    │  │ (Tenant) │                  │  (Tenant)   │                 │ (Tenant)   │    │
    │  └────┬─────┘                  └──────┬──────┘                 └──────┬─────┘    │
    └───────┼──────────────────────────────┼───────────────────────────────┼───────────┘
            │                              │                               │
    ┌───────┼──────────────────────────────┼───────────────────────────────┼───────────┐
    │       │        APPLICATION LAYER     │                               │           │
    │  ┌────┴─────────────────────────────┴───────────────────────────────┴─────┐     │
    │  │                    Shared Application Instances                         │     │
    │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │     │
    │  │  │ Content │  │Taxonomy │  │ Search  │  │  Media  │  │Workflow │       │     │
    │  │  │ Service │  │ Service │  │ Service │  │ Service │  │ Service │       │     │
    │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │     │
    │  └────────────────────────────────┬────────────────────────────────────────┘     │
    └───────────────────────────────────┼──────────────────────────────────────────────┘
                                        │
    ┌───────────────────────────────────┼──────────────────────────────────────────────┐
    │                           DATA LAYER                                              │
    │       ┌───────────────────────────┼───────────────────────────────┐              │
    │       │                           │                               │              │
    │  ┌────┴─────┐              ┌──────┴──────┐                ┌───────┴─────┐        │
    │  │ Shared   │              │   Isolated   │                │   Hybrid   │        │
    │  │ Database │              │  Databases   │                │  (Shard)   │        │
    │  │(Network) │              │  (Per-Site)  │                │            │        │
    │  └──────────┘              └─────────────┘                └────────────┘        │
    │                                                                                   │
    │  ┌────────────────────────────────────────────────────────────────────────┐     │
    │  │                      Network Database (Central)                         │     │
    │  │  - Site Registry      - User SSO        - Billing          - Analytics  │     │
    │  │  - Global Config      - Audit Trail     - Feature Flags    - Metrics    │     │
    │  └────────────────────────────────────────────────────────────────────────┘     │
    └──────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Principles

| Principle | Description |
|-----------|-------------|
| **Site Autonomy** | Each site operates independently while sharing infrastructure |
| **Data Isolation** | Site data is logically or physically isolated based on requirements |
| **Shared Authentication** | Single Sign-On across all network sites |
| **Resource Efficiency** | Shared compute resources reduce operational costs |
| **Feature Flexibility** | Per-site feature toggles enable customization |
| **Global Performance** | Edge deployment minimizes latency worldwide |

---

## 2. Deployment Models

### 2.1 Single-Tenant (Dedicated Resources)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SINGLE-TENANT DEPLOYMENT                      │
│                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐ │
│  │    Site A      │    │    Site B      │    │    Site C      │ │
│  │   (Company)    │    │   (Company)    │    │   (Company)    │ │
│  │                │    │                │    │                │ │
│  │ ┌──────────┐   │    │ ┌──────────┐   │    │ ┌──────────┐   │ │
│  │ │ App Pods │   │    │ │ App Pods │   │    │ │ App Pods │   │ │
│  │ └──────────┘   │    │ └──────────┘   │    │ └──────────┘   │ │
│  │                │    │                │    │                │ │
│  │ ┌──────────┐   │    │ ┌──────────┐   │    │ ┌──────────┐   │ │
│  │ │ Database │   │    │ │ Database │   │    │ │ Database │   │ │
│  │ └──────────┘   │    │ └──────────┘   │    │ └──────────┘   │ │
│  │                │    │                │    │                │ │
│  │ ┌──────────┐   │    │ ┌──────────┐   │    │ ┌──────────┐   │ │
│  │ │  Cache   │   │    │ │  Cache   │   │    │ │  Cache   │   │ │
│  │ └──────────┘   │    │ └──────────┘   │    │ └──────────┘   │ │
│  └────────────────┘    └────────────────┘    └────────────────┘ │
│                                                                  │
│  Benefits:                                                       │
│  - Complete data isolation                                       │
│  - Dedicated resources                                           │
│  - Custom infrastructure                                         │
│  - Regulatory compliance (HIPAA, SOX)                           │
│                                                                  │
│  Trade-offs:                                                     │
│  - Higher cost per site                                          │
│  - More operational overhead                                     │
│  - Resource underutilization                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- Enterprise customers with strict compliance requirements
- High-traffic sites requiring dedicated resources
- Customers requiring specific geographic data residency

### 2.2 Multi-Tenant (Shared Resources)

```
┌─────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANT DEPLOYMENT                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Shared Application Cluster                   ││
│  │  ┌──────────────────────────────────────────────────────┐   ││
│  │  │  App Pod 1  │  App Pod 2  │  App Pod 3  │  App Pod N │   ││
│  │  │   All Sites │   All Sites │   All Sites │  All Sites │   ││
│  │  └──────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                               │                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Shared Database Cluster                    ││
│  │  ┌────────────────────────────────────────────────────────┐ ││
│  │  │              Multi-Tenant Schema                        │ ││
│  │  │                                                         │ ││
│  │  │  content (site_id) │ users (site_id) │ media (site_id) │ ││
│  │  │  ──────────────────────────────────────────────────────│ ││
│  │  │  Site A Data       │ Site A Users     │ Site A Media   │ ││
│  │  │  Site B Data       │ Site B Users     │ Site B Media   │ ││
│  │  │  Site C Data       │ Site C Users     │ Site C Media   │ ││
│  │  └────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Benefits:                                                       │
│  - Cost-effective (shared resources)                             │
│  - Easy maintenance (single deployment)                          │
│  - Efficient resource utilization                                │
│                                                                  │
│  Trade-offs:                                                     │
│  - Noisy neighbor risk                                           │
│  - Limited customization                                         │
│  - Shared security boundary                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- SaaS offerings with many small sites
- Cost-sensitive deployments
- Sites with similar resource requirements

### 2.3 Hybrid (Shared Code, Isolated Data)

```
┌─────────────────────────────────────────────────────────────────┐
│                     HYBRID DEPLOYMENT                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Shared Application Layer                     ││
│  │  ┌──────────────────────────────────────────────────────┐   ││
│  │  │  App Pool (Shared across all sites)                  │   ││
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │   ││
│  │  │  │Pod 1│ │Pod 2│ │Pod 3│ │Pod 4│ │Pod N│           │   ││
│  │  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘           │   ││
│  │  └──────────────────────────────────────────────────────┘   ││
│  └──────────────────────────────┬──────────────────────────────┘│
│                                 │                                │
│            ┌────────────────────┼────────────────────┐          │
│            │                    │                    │          │
│  ┌─────────┴─────────┐ ┌───────┴────────┐ ┌────────┴────────┐  │
│  │  Database Shard A │ │ Database Shard B│ │ Database Shard C│  │
│  │  (Sites 1-100)    │ │ (Sites 101-200) │ │ (Sites 201-300) │  │
│  │                   │ │                 │ │                 │  │
│  │ ┌───────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │  │
│  │ │ Site 1 Schema │ │ │ │Site 101 Sch │ │ │ │Site 201 Sch │ │  │
│  │ │ Site 2 Schema │ │ │ │Site 102 Sch │ │ │ │Site 202 Sch │ │  │
│  │ │     ...       │ │ │ │    ...      │ │ │ │    ...      │ │  │
│  │ └───────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │  │
│  └───────────────────┘ └─────────────────┘ └─────────────────┘  │
│                                                                  │
│  Benefits:                                                       │
│  - Data isolation per site                                       │
│  - Shared compute efficiency                                     │
│  - Scalable sharding                                             │
│  - Compliance-friendly                                           │
│                                                                  │
│  Trade-offs:                                                     │
│  - Schema management complexity                                  │
│  - Cross-site queries difficult                                  │
│  - Migration coordination                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- Enterprise networks with data isolation requirements
- Sites with varying compliance needs in same network
- Migration path from single-tenant to multi-tenant

### 2.4 Edge Deployment (CDN-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│                     EDGE DEPLOYMENT                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Global Edge Network                    │   │
│  │                                                           │   │
│  │   ┌─────────┐    ┌─────────┐    ┌─────────┐             │   │
│  │   │ Edge PoP│    │ Edge PoP│    │ Edge PoP│             │   │
│  │   │ US-East │    │   EU    │    │  APAC   │             │   │
│  │   │         │    │         │    │         │             │   │
│  │   │┌───────┐│    │┌───────┐│    │┌───────┐│             │   │
│  │   ││Worker ││    ││Worker ││    ││Worker ││             │   │
│  │   ││(V8)   ││    ││(V8)   ││    ││(V8)   ││             │   │
│  │   │└───────┘│    │└───────┘│    │└───────┘│             │   │
│  │   │         │    │         │    │         │             │   │
│  │   │┌───────┐│    │┌───────┐│    │┌───────┐│             │   │
│  │   ││ Cache ││    ││ Cache ││    ││ Cache ││             │   │
│  │   │└───────┘│    │└───────┘│    │└───────┘│             │   │
│  │   │         │    │         │    │         │             │   │
│  │   │┌───────┐│    │┌───────┐│    │┌───────┐│             │   │
│  │   ││ KV DB ││    ││ KV DB ││    ││ KV DB ││             │   │
│  │   │└───────┘│    │└───────┘│    │└───────┘│             │   │
│  │   └─────────┘    └─────────┘    └─────────┘             │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                               │                                  │
│                               ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Origin Server                          │   │
│  │  (Only for cache misses, writes, and dynamic content)     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Capabilities at Edge:                                           │
│  - Static asset serving                                          │
│  - SSR/ISR rendering                                             │
│  - A/B testing                                                   │
│  - Personalization                                               │
│  - Geo-routing                                                   │
│  - Bot protection                                                │
│                                                                  │
│  Benefits:                                                       │
│  - <50ms global latency                                          │
│  - Automatic scaling                                             │
│  - DDoS protection                                               │
│  - Zero cold starts                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- Content-heavy sites requiring global distribution
- Marketing sites with traffic spikes
- API endpoints requiring low latency

---

## 3. Database Sharding Strategy

### 3.1 Sharding Approaches

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE SHARDING STRATEGIES                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Strategy 1: Schema-per-Site                     ││
│  │                                                              ││
│  │  Database Cluster                                            ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │ schema_site_001 │ schema_site_002 │ schema_site_003 │    ││
│  │  │ ─────────────── │ ─────────────── │ ─────────────── │    ││
│  │  │ - content       │ - content       │ - content       │    ││
│  │  │ - users         │ - users         │ - users         │    ││
│  │  │ - media         │ - media         │ - media         │    ││
│  │  │ - taxonomy      │ - taxonomy      │ - taxonomy      │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  │                                                              ││
│  │  Pros: Strong isolation, easy backups, simple queries       ││
│  │  Cons: Connection pooling overhead, limited cross-site      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Strategy 2: Tenant Column                       ││
│  │                                                              ││
│  │  Single Schema                                               ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │ content                                             │    ││
│  │  │ ┌──────────┬─────────┬───────────┬───────────────┐ │    ││
│  │  │ │ site_id  │   id    │   title   │   content     │ │    ││
│  │  │ ├──────────┼─────────┼───────────┼───────────────┤ │    ││
│  │  │ │ site_001 │    1    │ Article A │ ...           │ │    ││
│  │  │ │ site_001 │    2    │ Article B │ ...           │ │    ││
│  │  │ │ site_002 │    1    │ Post X    │ ...           │ │    ││
│  │  │ │ site_003 │    1    │ Page Y    │ ...           │ │    ││
│  │  │ └──────────┴─────────┴───────────┴───────────────┘ │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  │                                                              ││
│  │  Pros: Simple, efficient, easy cross-site queries           ││
│  │  Cons: RLS required, larger tables, noisy neighbor risk     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Strategy 3: Horizontal Sharding                 ││
│  │                                                              ││
│  │  Shard 1 (Sites 1-100)    Shard 2 (Sites 101-200)           ││
│  │  ┌───────────────────┐    ┌───────────────────┐             ││
│  │  │ content           │    │ content           │             ││
│  │  │ users             │    │ users             │             ││
│  │  │ media             │    │ media             │             ││
│  │  └───────────────────┘    └───────────────────┘             ││
│  │                                                              ││
│  │  Shard Router                                                ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │ site_id -> shard_mapping                            │    ││
│  │  │ site_001 -> shard_1   site_101 -> shard_2           │    ││
│  │  └─────────────────────────────────────────────────────┘    ││
│  │                                                              ││
│  │  Pros: Scalable, isolated failure domains                   ││
│  │  Cons: Complex routing, cross-shard queries difficult       ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Recommended Strategy: Hybrid Sharding

```typescript
/**
 * Hybrid sharding strategy combining schema isolation with horizontal scaling.
 */
export interface ShardingConfig {
  /** Strategy for tenant isolation */
  isolationStrategy: 'schema' | 'column' | 'database';

  /** Number of sites per shard */
  sitesPerShard: number;

  /** Rebalancing threshold */
  rebalanceThreshold: number;

  /** Geographic shard affinity */
  geoAffinity: boolean;
}

export interface ShardInfo {
  shardId: string;
  region: string;
  primaryHost: string;
  replicaHosts: string[];
  siteRange: [number, number];
  currentLoad: number;
}

export class ShardRouter {
  private shardMap: Map<string, ShardInfo> = new Map();
  private siteToShard: Map<string, string> = new Map();

  /**
   * Routes a request to the appropriate shard.
   */
  async getShardForSite(siteId: string): Promise<ShardInfo> {
    // Check cache first
    const cachedShard = this.siteToShard.get(siteId);
    if (cachedShard) {
      return this.shardMap.get(cachedShard)!;
    }

    // Query network database for shard assignment
    const assignment = await this.lookupShardAssignment(siteId);
    this.siteToShard.set(siteId, assignment.shardId);

    return this.shardMap.get(assignment.shardId)!;
  }

  /**
   * Creates a new shard when capacity is reached.
   */
  async provisionNewShard(region: string): Promise<ShardInfo> {
    // Provision new database cluster
    const shard = await this.createShardCluster(region);

    this.shardMap.set(shard.shardId, shard);

    return shard;
  }

  /**
   * Rebalances sites across shards.
   */
  async rebalance(): Promise<void> {
    const shards = Array.from(this.shardMap.values());
    const avgLoad = shards.reduce((sum, s) => sum + s.currentLoad, 0) / shards.length;

    for (const shard of shards) {
      if (shard.currentLoad > avgLoad * this.config.rebalanceThreshold) {
        await this.migrateSites(shard, avgLoad);
      }
    }
  }
}
```

### 3.3 Data Distribution Table

| Data Type | Location | Reasoning |
|-----------|----------|-----------|
| **Site Registry** | Network DB | Cross-site access required |
| **User Credentials** | Network DB | SSO requires central storage |
| **User Profiles** | Site Shard | Site-specific data |
| **Content** | Site Shard | Complete isolation |
| **Media Metadata** | Site Shard | Linked to content |
| **Media Blobs** | Object Storage | Scalable, shared infrastructure |
| **Taxonomy** | Site Shard | Site-specific vocabulary |
| **Audit Logs** | Site Shard + Network | Dual-write for compliance |
| **Analytics** | Network DB | Aggregation required |
| **Feature Flags** | Network DB | Centralized management |
| **Billing** | Network DB | Cross-site aggregation |

---

## 4. Domain Mapping and Routing

### 4.1 Domain Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOMAIN RESOLUTION FLOW                        │
│                                                                  │
│    User Request                                                  │
│    https://blog.example.com/article/123                         │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────┐                                           │
│  │   DNS Resolver   │                                           │
│  │ (Cloudflare DNS) │                                           │
│  └────────┬─────────┘                                           │
│           │ CNAME: rses-edge.example.net                        │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │   Edge Worker    │                                           │
│  │ (Domain Router)  │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│           │ 1. Extract hostname: blog.example.com               │
│           │ 2. Query domain registry                            │
│           │ 3. Get site_id: site_42                             │
│           │ 4. Inject X-Site-ID header                          │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │  Origin Server   │                                           │
│  │ (Site Context)   │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│           │ 1. Read X-Site-ID: site_42                          │
│           │ 2. Load site configuration                          │
│           │ 3. Route to appropriate shard                       │
│           │ 4. Execute request with site context                │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │   Site Content   │                                           │
│  │                  │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Domain Registry Schema

```typescript
/**
 * Domain mapping configuration stored in network database.
 */
export interface DomainMapping {
  /** Primary key */
  id: string;

  /** The custom domain (e.g., blog.example.com) */
  domain: string;

  /** Associated site ID */
  siteId: string;

  /** Domain type */
  type: 'primary' | 'alias' | 'preview' | 'branch';

  /** SSL certificate status */
  sslStatus: 'pending' | 'active' | 'expired' | 'failed';

  /** SSL certificate expiry */
  sslExpiry?: Date;

  /** DNS verification status */
  dnsVerified: boolean;

  /** DNS verification token */
  dnsVerificationToken: string;

  /** Created timestamp */
  createdAt: Date;

  /** Last verified timestamp */
  lastVerifiedAt?: Date;
}

/**
 * Site configuration for routing.
 */
export interface SiteConfig {
  /** Unique site identifier */
  siteId: string;

  /** Human-readable site name */
  name: string;

  /** Primary domain */
  primaryDomain: string;

  /** All domains pointing to this site */
  domains: DomainMapping[];

  /** Site status */
  status: 'active' | 'suspended' | 'pending' | 'deleted';

  /** Deployment tier */
  tier: 'free' | 'pro' | 'enterprise';

  /** Geographic region preference */
  region: string;

  /** Associated database shard */
  shardId: string;

  /** Feature flags for this site */
  features: Record<string, boolean>;

  /** Site-specific configuration */
  config: SiteConfigDetails;
}

/**
 * Detailed site configuration.
 */
export interface SiteConfigDetails {
  /** RSES configuration ID */
  rsesConfigId?: number;

  /** Theme settings */
  theme: {
    name: string;
    customCss?: string;
  };

  /** Localization settings */
  localization: {
    defaultLocale: string;
    supportedLocales: string[];
    timezone: string;
  };

  /** Media settings */
  media: {
    maxUploadSize: number;
    allowedTypes: string[];
    cdnUrl?: string;
  };

  /** API settings */
  api: {
    rateLimit: number;
    allowedOrigins: string[];
  };
}
```

### 4.3 Domain Routing Implementation

```typescript
/**
 * Edge worker for domain-based routing.
 * Deployed to Cloudflare Workers / Vercel Edge / AWS CloudFront.
 */
export class DomainRouter {
  private domainCache: Map<string, SiteConfig> = new Map();
  private cacheExpiry: number = 60000; // 1 minute

  /**
   * Main request handler at the edge.
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Get site configuration
    const siteConfig = await this.resolveSite(hostname);

    if (!siteConfig) {
      return new Response('Site not found', { status: 404 });
    }

    if (siteConfig.status === 'suspended') {
      return new Response('Site suspended', { status: 403 });
    }

    // Check for domain redirect
    const mapping = siteConfig.domains.find(d => d.domain === hostname);
    if (mapping?.type === 'alias' && siteConfig.primaryDomain !== hostname) {
      return Response.redirect(
        `https://${siteConfig.primaryDomain}${url.pathname}${url.search}`,
        301
      );
    }

    // Create modified request with site context
    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set('X-Site-ID', siteConfig.siteId);
    modifiedHeaders.set('X-Site-Shard', siteConfig.shardId);
    modifiedHeaders.set('X-Site-Tier', siteConfig.tier);
    modifiedHeaders.set('X-Site-Region', siteConfig.region);

    const modifiedRequest = new Request(request, {
      headers: modifiedHeaders,
    });

    // Forward to origin
    return this.forwardToOrigin(modifiedRequest, siteConfig);
  }

  /**
   * Resolves hostname to site configuration.
   */
  private async resolveSite(hostname: string): Promise<SiteConfig | null> {
    // Check cache
    const cached = this.domainCache.get(hostname);
    if (cached) {
      return cached;
    }

    // Query domain registry
    const config = await this.queryDomainRegistry(hostname);

    if (config) {
      this.domainCache.set(hostname, config);

      // Set expiry
      setTimeout(() => {
        this.domainCache.delete(hostname);
      }, this.cacheExpiry);
    }

    return config;
  }

  /**
   * Forwards request to appropriate origin based on region.
   */
  private async forwardToOrigin(
    request: Request,
    config: SiteConfig
  ): Promise<Response> {
    const origins = this.getOriginsByRegion(config.region);

    // Try primary origin first, then fallbacks
    for (const origin of origins) {
      try {
        const response = await fetch(origin + new URL(request.url).pathname, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });

        return response;
      } catch (error) {
        console.error(`Origin ${origin} failed:`, error);
        continue;
      }
    }

    return new Response('All origins unavailable', { status: 503 });
  }
}
```

---

## 5. Site Context Management

### 5.1 Site Context Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SITE CONTEXT LIFECYCLE                        │
│                                                                  │
│  Request Arrives                                                 │
│       │                                                          │
│       ▼                                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              MIDDLEWARE: Site Context Resolver              │ │
│  │                                                             │ │
│  │  1. Extract X-Site-ID from headers                         │ │
│  │  2. Load SiteConfig from cache/database                    │ │
│  │  3. Create SiteContext instance                            │ │
│  │  4. Attach to request (req.siteContext)                    │ │
│  │  5. Configure database connection for site                 │ │
│  │  6. Apply site-specific feature flags                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│       │                                                          │
│       ▼                                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 APPLICATION LAYER                           │ │
│  │                                                             │ │
│  │  Services access site context via:                         │ │
│  │  - Dependency injection (recommended)                      │ │
│  │  - AsyncLocalStorage (request-scoped)                      │ │
│  │  - Request object (legacy)                                 │ │
│  │                                                             │ │
│  │  All queries automatically scoped to site:                 │ │
│  │  - SELECT * FROM content WHERE site_id = $siteId           │ │
│  │  - Or: SET search_path TO $siteSchema                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│       │                                                          │
│       ▼                                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              MIDDLEWARE: Site Context Cleanup               │ │
│  │                                                             │ │
│  │  1. Log request metrics with site_id label                 │ │
│  │  2. Release site-specific resources                        │ │
│  │  3. Clear AsyncLocalStorage                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Site Context Implementation

```typescript
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Site context holding all site-specific information for a request.
 */
export interface SiteContext {
  /** Unique site identifier */
  readonly siteId: string;

  /** Site configuration */
  readonly config: SiteConfig;

  /** Database connection pool for this site's shard */
  readonly dbPool: DatabasePool;

  /** Cache namespace for this site */
  readonly cachePrefix: string;

  /** Feature flags resolved for this site */
  readonly features: FeatureFlags;

  /** Current user (if authenticated) */
  readonly user?: AuthenticatedUser;

  /** Request metadata */
  readonly requestId: string;
  readonly startTime: number;
}

/**
 * AsyncLocalStorage for request-scoped site context.
 */
const siteContextStorage = new AsyncLocalStorage<SiteContext>();

/**
 * Gets the current site context.
 * @throws Error if called outside of a request context.
 */
export function getSiteContext(): SiteContext {
  const context = siteContextStorage.getStore();
  if (!context) {
    throw new Error('Site context not available. Are you in a request context?');
  }
  return context;
}

/**
 * Gets the current site context or undefined.
 */
export function tryGetSiteContext(): SiteContext | undefined {
  return siteContextStorage.getStore();
}

/**
 * Runs a function with a specific site context.
 */
export function runWithSiteContext<T>(
  context: SiteContext,
  fn: () => T
): T {
  return siteContextStorage.run(context, fn);
}

/**
 * Express middleware for site context resolution.
 */
export function siteContextMiddleware(
  networkDb: NetworkDatabase,
  shardRouter: ShardRouter,
  featureService: FeatureService
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const siteId = req.headers['x-site-id'] as string;

    if (!siteId) {
      return res.status(400).json({ error: 'Missing X-Site-ID header' });
    }

    try {
      // Load site configuration
      const config = await networkDb.getSiteConfig(siteId);

      if (!config) {
        return res.status(404).json({ error: 'Site not found' });
      }

      // Get database pool for site's shard
      const shard = await shardRouter.getShardForSite(siteId);
      const dbPool = await shardRouter.getPoolForShard(shard.shardId);

      // Resolve feature flags
      const features = await featureService.resolveFeatures(siteId, config.tier);

      // Create site context
      const context: SiteContext = {
        siteId,
        config,
        dbPool,
        cachePrefix: `site:${siteId}:`,
        features,
        user: req.user,
        requestId: req.headers['x-request-id'] as string || generateRequestId(),
        startTime: Date.now(),
      };

      // Attach to request for legacy access
      (req as any).siteContext = context;

      // Run remaining middleware with site context
      runWithSiteContext(context, () => {
        next();
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Database query wrapper that automatically scopes to current site.
 */
export class SiteScopedRepository<T> {
  constructor(
    private readonly tableName: string,
    private readonly siteIdColumn: string = 'site_id'
  ) {}

  /**
   * Finds records scoped to current site.
   */
  async find(where: Partial<T>): Promise<T[]> {
    const context = getSiteContext();

    return context.dbPool.query(
      `SELECT * FROM ${this.tableName} WHERE ${this.siteIdColumn} = $1 AND ...`,
      [context.siteId, ...Object.values(where)]
    );
  }

  /**
   * Creates a record with site scope.
   */
  async create(data: Omit<T, 'siteId'>): Promise<T> {
    const context = getSiteContext();

    const dataWithSite = {
      ...data,
      [this.siteIdColumn]: context.siteId,
    };

    return context.dbPool.query(
      `INSERT INTO ${this.tableName} (...) VALUES (...) RETURNING *`,
      Object.values(dataWithSite)
    );
  }
}
```

### 5.3 Cross-Site Operations

```typescript
/**
 * Elevated context for network-level operations.
 * Requires network admin privileges.
 */
export interface NetworkContext {
  /** Network identifier */
  readonly networkId: string;

  /** Sites accessible in this context */
  readonly siteIds: string[];

  /** Network database connection */
  readonly networkDb: NetworkDatabase;

  /** Admin user performing the operation */
  readonly admin: NetworkAdmin;
}

/**
 * Service for cross-site operations.
 */
export class NetworkService {
  /**
   * Syndicates content across multiple sites.
   */
  async syndicateContent(
    sourceContext: SiteContext,
    targetSiteIds: string[],
    contentId: string
  ): Promise<SyndicationResult> {
    // Verify permission
    if (!sourceContext.features.contentSyndication) {
      throw new Error('Content syndication not enabled for this site');
    }

    const content = await this.contentService.getContent(sourceContext, contentId);

    const results: SyndicationResult = {
      sourceContentId: contentId,
      sourceSiteId: sourceContext.siteId,
      targets: [],
    };

    for (const targetSiteId of targetSiteIds) {
      try {
        // Get target site context
        const targetContext = await this.getSiteContext(targetSiteId);

        // Create syndicated copy
        const syndicatedContent = await this.contentService.createSyndicated(
          targetContext,
          content,
          sourceContext.siteId
        );

        results.targets.push({
          siteId: targetSiteId,
          contentId: syndicatedContent.id,
          status: 'success',
        });
      } catch (error) {
        results.targets.push({
          siteId: targetSiteId,
          contentId: null,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Aggregates analytics across all network sites.
   */
  async getNetworkAnalytics(
    networkContext: NetworkContext,
    dateRange: DateRange
  ): Promise<NetworkAnalytics> {
    // Query network database for aggregated metrics
    const metrics = await networkContext.networkDb.query(`
      SELECT
        site_id,
        SUM(page_views) as page_views,
        SUM(unique_visitors) as unique_visitors,
        AVG(avg_session_duration) as avg_session_duration
      FROM site_analytics
      WHERE site_id = ANY($1)
        AND date >= $2 AND date <= $3
      GROUP BY site_id
    `, [networkContext.siteIds, dateRange.start, dateRange.end]);

    return {
      dateRange,
      siteMetrics: metrics,
      totals: this.aggregateTotals(metrics),
    };
  }
}
```

---

## 6. Multi-Site Dashboard

### 6.1 Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         MULTI-SITE DASHBOARD                                     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  HEADER                                                          [User ▼]  │ │
│  │  Network: Acme Corp Network    [Switch Network ▼]               Sign Out   │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌─────────────────────┬──────────────────────────────────────────────────────┐ │
│  │  SIDEBAR            │  MAIN CONTENT                                        │ │
│  │                     │                                                      │ │
│  │  Dashboard          │  ┌──────────────────────────────────────────────┐   │ │
│  │  ────────────       │  │  NETWORK OVERVIEW                            │   │ │
│  │  [ ] Sites (12)     │  │                                              │   │ │
│  │  [ ] Content        │  │  Sites: 12    Active: 10   Suspended: 2     │   │ │
│  │  [ ] Users          │  │  Total Traffic: 1.2M/day  Storage: 450 GB   │   │ │
│  │  [ ] Analytics      │  │                                              │   │ │
│  │                     │  │  ┌─────────────────────────────────────────┐ │   │ │
│  │  Management         │  │  │  Traffic Trend (7 days)                 │ │   │ │
│  │  ────────────       │  │  │  ▁▂▃▅▆▇█▇▅▃▂                           │ │   │ │
│  │  [ ] Provisioning   │  │  └─────────────────────────────────────────┘ │   │ │
│  │  [ ] Domains        │  └──────────────────────────────────────────────┘   │ │
│  │  [ ] Feature Flags  │                                                      │ │
│  │  [ ] Billing        │  ┌──────────────────────────────────────────────┐   │ │
│  │                     │  │  SITE HEALTH                                 │   │ │
│  │  Settings           │  │                                              │   │ │
│  │  ────────────       │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │ │
│  │  [ ] SSO Config     │  │  │ blog.co  │ │ shop.co  │ │ docs.co  │    │   │ │
│  │  [ ] Network Users  │  │  │   ●      │ │   ●      │ │   ●      │    │   │ │
│  │  [ ] Audit Logs     │  │  │ Healthy  │ │ Degraded │ │ Healthy  │    │   │ │
│  │  [ ] Backups        │  │  │ 99.9%    │ │ 98.2%    │ │ 99.8%    │    │   │ │
│  │                     │  │  └──────────┘ └──────────┘ └──────────┘    │   │ │
│  │  Quick Switch       │  └──────────────────────────────────────────────┘   │ │
│  │  ────────────       │                                                      │ │
│  │  ● blog.example.com │  ┌──────────────────────────────────────────────┐   │ │
│  │  ○ shop.example.com │  │  RECENT ACTIVITY                             │   │ │
│  │  ○ docs.example.com │  │                                              │   │ │
│  │  ○ api.example.com  │  │  10:42 - blog.co: New article published     │   │ │
│  │  + Add Site         │  │  10:38 - shop.co: Product updated           │   │ │
│  │                     │  │  10:35 - docs.co: Page revision created     │   │ │
│  └─────────────────────┴──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Site Management View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SITES MANAGEMENT                                    [+ Create Site] [Bulk ▼]   │
│                                                                                  │
│  Filter: [All Sites ▼]  Status: [All ▼]  Tier: [All ▼]  Search: [________]     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  □  SITE              DOMAIN                 STATUS    TIER    TRAFFIC     │ │
│  ├────────────────────────────────────────────────────────────────────────────┤ │
│  │  □  Blog              blog.example.com       ● Active  Pro     45K/day     │ │
│  │     Created: Jan 15   Region: US-East        Shard: shard-01               │ │
│  │     [Edit] [Settings] [Clone] [Suspend] [Delete]                           │ │
│  ├────────────────────────────────────────────────────────────────────────────┤ │
│  │  □  Shop              shop.example.com       ● Active  Ent     120K/day    │ │
│  │     Created: Feb 02   Region: US-East        Shard: shard-02               │ │
│  │     [Edit] [Settings] [Clone] [Suspend] [Delete]                           │ │
│  ├────────────────────────────────────────────────────────────────────────────┤ │
│  │  □  Docs              docs.example.com       ● Active  Pro     28K/day     │ │
│  │     Created: Mar 10   Region: EU-West        Shard: shard-01               │ │
│  │     [Edit] [Settings] [Clone] [Suspend] [Delete]                           │ │
│  ├────────────────────────────────────────────────────────────────────────────┤ │
│  │  □  Staging           staging.example.com    ○ Pending Free    0/day       │ │
│  │     Created: Today    Region: US-East        Shard: shard-01               │ │
│  │     [Activate] [Edit] [Settings] [Delete]                                  │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Showing 4 of 12 sites                              [◀ Prev] Page 1 of 3 [Next ▶]│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Site Provisioning Wizard

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  CREATE NEW SITE                                                    Step 1 of 4 │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  ● BASIC INFO    ○ DOMAIN    ○ CONFIGURATION    ○ REVIEW                   │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Site Name *                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  My New Blog                                                               │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Site Slug *                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  my-new-blog                                                               │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│  Preview URL: my-new-blog.rses-network.com                                       │
│                                                                                  │
│  Template                                                                        │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  [Blank Site ▼]                                                            │ │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐              │ │
│  │  │  ▢ Blank  │ │  ▢ Blog   │ │  ▢ Store   │ │  ▢ Docs    │              │ │
│  │  │  Site     │ │  Template │ │  Template  │ │  Template  │              │ │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Region *                                                                        │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  [US East (Virginia) ▼]                                                    │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│  Tip: Choose the region closest to your primary audience                         │
│                                                                                  │
│  Tier *                                                                          │
│  ○ Free - 1GB storage, 10K visits/mo, community support                         │
│  ● Pro - 50GB storage, 500K visits/mo, priority support    $29/mo               │
│  ○ Enterprise - Unlimited, dedicated support, SLA          Custom               │
│                                                                                  │
│                                              [Cancel]  [Next: Domain Setup →]   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Network Analytics View

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  NETWORK ANALYTICS                                   [Export ▼] [Date Range ▼]  │
│                                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │  TOTAL SITES │ │ TOTAL USERS  │ │ PAGE VIEWS   │ │ STORAGE USED │           │
│  │      12      │ │    45,231    │ │   1.2M/day   │ │   450 GB     │           │
│  │   +2 MTD     │ │  +5.2% MTD   │ │  +12% MTD    │ │  +8% MTD     │           │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  TRAFFIC BY SITE                                                           │ │
│  │                                                                             │ │
│  │  shop.example.com      ████████████████████████████████░░░░░░░  45%        │ │
│  │  blog.example.com      █████████████████░░░░░░░░░░░░░░░░░░░░░░  28%        │ │
│  │  docs.example.com      ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░  18%        │ │
│  │  api.example.com       ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   6%        │ │
│  │  Other                 ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   3%        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  GEOGRAPHIC DISTRIBUTION                                                    │ │
│  │                                                                             │ │
│  │     ┌─────────────────────────────────────────────────────────────┐        │ │
│  │     │                    WORLD MAP                                │        │ │
│  │     │      [US: 45%]     [EU: 32%]     [APAC: 18%]    [Other: 5%]│        │ │
│  │     └─────────────────────────────────────────────────────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │  PERFORMANCE METRICS                                                        │ │
│  │                                                                             │ │
│  │  Site              TTFB    LCP     FID     CLS     Score                   │ │
│  │  ─────────────────────────────────────────────────────────────────         │ │
│  │  shop.example.com  120ms   1.2s    45ms    0.02    98  ●                   │ │
│  │  blog.example.com  95ms    0.9s    32ms    0.01    99  ●                   │ │
│  │  docs.example.com  85ms    0.8s    28ms    0.00    100 ●                   │ │
│  │  api.example.com   45ms    N/A     N/A     N/A     N/A                     │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Site Provisioning Automation

### 7.1 Provisioning Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SITE PROVISIONING PIPELINE                               │
│                                                                                  │
│  [Site Request] ──────────────────────────────────────────────────► [Site Live] │
│       │                                                                          │
│       ▼                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │  VALIDATE   │───►│  PROVISION  │───►│  CONFIGURE  │───►│  ACTIVATE   │      │
│  │             │    │             │    │             │    │             │      │
│  │ - Quota     │    │ - Database  │    │ - DNS       │    │ - Warmup    │      │
│  │ - Name      │    │ - Schema    │    │ - SSL       │    │ - Health    │      │
│  │ - Domain    │    │ - Storage   │    │ - CDN       │    │ - Go-live   │      │
│  │ - Billing   │    │ - Cache     │    │ - Routing   │    │             │      │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘      │
│       │                   │                   │                   │              │
│       ▼                   ▼                   ▼                   ▼              │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        STATUS TRACKING                                   │   │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐        │   │
│  │  │Queue│─►│Valid│─►│DB   │─►│Store│─►│DNS  │─►│SSL  │─►│Live │        │   │
│  │  │ 📋 │  │ ✓   │  │ ✓   │  │ ⏳  │  │ ... │  │ ... │  │ ... │        │   │
│  │  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Estimated Time: ~3 minutes (automated) / ~24 hours (with custom domain)        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Provisioning Service Implementation

```typescript
/**
 * Site provisioning request.
 */
export interface ProvisioningRequest {
  /** Unique request ID */
  requestId: string;

  /** Site configuration */
  site: {
    name: string;
    slug: string;
    tier: 'free' | 'pro' | 'enterprise';
    region: string;
    template?: string;
  };

  /** Domain configuration */
  domain?: {
    custom: string;
    useSubdomain: boolean;
  };

  /** Requesting user/admin */
  requestedBy: string;

  /** Network this site belongs to */
  networkId: string;
}

/**
 * Provisioning step status.
 */
export interface ProvisioningStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Site provisioning service.
 */
export class SiteProvisioningService {
  private steps: ProvisioningStep[] = [];

  constructor(
    private readonly networkDb: NetworkDatabase,
    private readonly shardRouter: ShardRouter,
    private readonly dnsService: DNSService,
    private readonly sslService: SSLService,
    private readonly cdnService: CDNService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Provisions a new site.
   */
  async provisionSite(request: ProvisioningRequest): Promise<ProvisioningResult> {
    const startTime = Date.now();

    try {
      // Step 1: Validate
      await this.runStep('validate', async () => {
        await this.validateRequest(request);
      });

      // Step 2: Provision database
      const dbResult = await this.runStep('provision_database', async () => {
        return this.provisionDatabase(request);
      });

      // Step 3: Create site record
      const site = await this.runStep('create_site_record', async () => {
        return this.createSiteRecord(request, dbResult);
      });

      // Step 4: Configure storage
      await this.runStep('configure_storage', async () => {
        await this.configureStorage(site);
      });

      // Step 5: Configure cache
      await this.runStep('configure_cache', async () => {
        await this.configureCache(site);
      });

      // Step 6: Setup DNS
      const dnsResult = await this.runStep('setup_dns', async () => {
        return this.setupDNS(request, site);
      });

      // Step 7: Provision SSL
      await this.runStep('provision_ssl', async () => {
        await this.provisionSSL(request, site, dnsResult);
      });

      // Step 8: Configure CDN
      await this.runStep('configure_cdn', async () => {
        await this.configureCDN(site);
      });

      // Step 9: Apply template
      if (request.site.template) {
        await this.runStep('apply_template', async () => {
          await this.applyTemplate(site, request.site.template!);
        });
      }

      // Step 10: Activate
      await this.runStep('activate', async () => {
        await this.activateSite(site);
      });

      // Emit success event
      await this.eventBus.publish({
        type: 'SiteProvisioned',
        payload: {
          siteId: site.siteId,
          networkId: request.networkId,
          duration: Date.now() - startTime,
        },
      });

      return {
        success: true,
        siteId: site.siteId,
        site,
        steps: this.steps,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      // Emit failure event
      await this.eventBus.publish({
        type: 'SiteProvisioningFailed',
        payload: {
          requestId: request.requestId,
          error: error.message,
          step: this.steps.find(s => s.status === 'failed')?.name,
        },
      });

      return {
        success: false,
        error: error.message,
        steps: this.steps,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validates provisioning request.
   */
  private async validateRequest(request: ProvisioningRequest): Promise<void> {
    // Check network quota
    const network = await this.networkDb.getNetwork(request.networkId);
    const siteCount = await this.networkDb.getSiteCount(request.networkId);

    if (siteCount >= network.quota.maxSites) {
      throw new Error(`Network site quota exceeded (${network.quota.maxSites})`);
    }

    // Check slug availability
    const existingSlug = await this.networkDb.getSiteBySlug(request.site.slug);
    if (existingSlug) {
      throw new Error(`Site slug "${request.site.slug}" already exists`);
    }

    // Check custom domain availability
    if (request.domain?.custom) {
      const existingDomain = await this.networkDb.getDomainMapping(request.domain.custom);
      if (existingDomain) {
        throw new Error(`Domain "${request.domain.custom}" already in use`);
      }
    }

    // Validate tier permissions
    if (request.site.tier === 'enterprise' && !network.features.enterpriseTier) {
      throw new Error('Enterprise tier not available for this network');
    }
  }

  /**
   * Provisions database resources for the site.
   */
  private async provisionDatabase(
    request: ProvisioningRequest
  ): Promise<DatabaseProvisioningResult> {
    // Determine shard based on region and load
    const shard = await this.shardRouter.assignShard(request.site.region);

    // Create schema or database based on isolation strategy
    const schemaName = `site_${request.site.slug.replace(/-/g, '_')}`;

    await shard.pool.query(`
      CREATE SCHEMA IF NOT EXISTS ${schemaName};

      -- Grant permissions
      GRANT USAGE ON SCHEMA ${schemaName} TO rses_app;
      GRANT ALL ON ALL TABLES IN SCHEMA ${schemaName} TO rses_app;

      -- Set search path default
      ALTER ROLE rses_app SET search_path TO ${schemaName}, public;
    `);

    // Run migrations for site schema
    await this.runSiteMigrations(shard, schemaName);

    return {
      shardId: shard.shardId,
      schemaName,
      connectionString: shard.connectionString,
    };
  }

  /**
   * Sets up DNS for the site.
   */
  private async setupDNS(
    request: ProvisioningRequest,
    site: SiteConfig
  ): Promise<DNSSetupResult> {
    const records: DNSRecord[] = [];

    // Create subdomain record
    const subdomain = `${request.site.slug}.rses-network.com`;
    records.push({
      type: 'CNAME',
      name: subdomain,
      value: 'edge.rses-network.com',
      ttl: 300,
    });

    await this.dnsService.createRecords(records);

    // If custom domain, create verification record
    if (request.domain?.custom) {
      const verificationToken = generateVerificationToken();

      records.push({
        type: 'TXT',
        name: `_rses-verify.${request.domain.custom}`,
        value: verificationToken,
        ttl: 300,
      });

      // Store domain mapping with pending verification
      await this.networkDb.createDomainMapping({
        domain: request.domain.custom,
        siteId: site.siteId,
        type: 'primary',
        sslStatus: 'pending',
        dnsVerified: false,
        dnsVerificationToken: verificationToken,
      });
    }

    return {
      subdomain,
      customDomain: request.domain?.custom,
      verificationRequired: !!request.domain?.custom,
    };
  }

  /**
   * Provisions SSL certificate.
   */
  private async provisionSSL(
    request: ProvisioningRequest,
    site: SiteConfig,
    dnsResult: DNSSetupResult
  ): Promise<void> {
    // Provision SSL for subdomain (always)
    await this.sslService.provisionCertificate({
      domain: dnsResult.subdomain,
      type: 'managed',
      autoRenew: true,
    });

    // If custom domain and DNS verified, provision SSL
    if (request.domain?.custom && dnsResult.verificationRequired) {
      // Start async verification process
      this.startDNSVerification(site.siteId, request.domain.custom);
    }
  }

  /**
   * Applies a site template.
   */
  private async applyTemplate(site: SiteConfig, templateName: string): Promise<void> {
    const template = await this.loadTemplate(templateName);

    // Create content types from template
    for (const contentType of template.contentTypes) {
      await this.contentService.createContentType(site, contentType);
    }

    // Create taxonomy vocabularies
    for (const vocabulary of template.vocabularies) {
      await this.taxonomyService.createVocabulary(site, vocabulary);
    }

    // Create RSES configuration
    if (template.rsesConfig) {
      await this.rsesService.createConfig(site, template.rsesConfig);
    }

    // Create sample content
    if (template.sampleContent) {
      for (const content of template.sampleContent) {
        await this.contentService.createContent(site, content);
      }
    }

    // Apply theme
    if (template.theme) {
      await this.themeService.applyTheme(site, template.theme);
    }
  }

  /**
   * Runs a provisioning step with tracking.
   */
  private async runStep<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const step: ProvisioningStep = {
      name,
      status: 'running',
      startedAt: new Date(),
    };
    this.steps.push(step);

    try {
      const result = await fn();
      step.status = 'completed';
      step.completedAt = new Date();
      return result;
    } catch (error) {
      step.status = 'failed';
      step.completedAt = new Date();
      step.error = error.message;
      throw error;
    }
  }
}
```

### 7.3 DNS Automation

```typescript
/**
 * DNS management service integrating with major providers.
 */
export class DNSService {
  constructor(
    private readonly providers: Map<string, DNSProvider>,
    private readonly defaultProvider: string
  ) {}

  /**
   * Creates DNS records.
   */
  async createRecords(records: DNSRecord[]): Promise<void> {
    const provider = this.providers.get(this.defaultProvider)!;

    for (const record of records) {
      await provider.createRecord(record);
    }
  }

  /**
   * Verifies DNS propagation.
   */
  async verifyPropagation(
    domain: string,
    expectedValue: string,
    recordType: 'A' | 'CNAME' | 'TXT' = 'TXT'
  ): Promise<boolean> {
    const resolvers = [
      '8.8.8.8',      // Google
      '1.1.1.1',      // Cloudflare
      '208.67.222.222', // OpenDNS
    ];

    for (const resolver of resolvers) {
      const result = await this.resolve(domain, recordType, resolver);
      if (!result.includes(expectedValue)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Configures DNS for custom domain.
   */
  async configureCustomDomain(
    domain: string,
    siteId: string
  ): Promise<DNSConfiguration> {
    // Detect existing DNS provider
    const provider = await this.detectProvider(domain);

    // Generate required records
    const records = this.generateRequiredRecords(domain, siteId);

    return {
      provider,
      records,
      instructions: this.generateInstructions(provider, records),
    };
  }

  /**
   * Generates DNS records for a domain.
   */
  private generateRequiredRecords(
    domain: string,
    siteId: string
  ): DNSRecord[] {
    return [
      {
        type: 'CNAME',
        name: domain,
        value: 'edge.rses-network.com',
        ttl: 300,
        description: 'Points your domain to RSES edge servers',
      },
      {
        type: 'TXT',
        name: `_rses-verify.${domain}`,
        value: `rses-site-verify=${siteId}`,
        ttl: 300,
        description: 'Verifies domain ownership',
      },
      {
        type: 'CAA',
        name: domain,
        value: '0 issue "letsencrypt.org"',
        ttl: 3600,
        description: 'Allows SSL certificate issuance',
      },
    ];
  }
}
```

### 7.4 SSL Certificate Management

```typescript
/**
 * SSL certificate management service.
 */
export class SSLService {
  constructor(
    private readonly acmeClient: ACMEClient,
    private readonly certificateStore: CertificateStore,
    private readonly dnsService: DNSService
  ) {}

  /**
   * Provisions a new SSL certificate.
   */
  async provisionCertificate(
    config: SSLProvisioningConfig
  ): Promise<SSLCertificate> {
    // Check if certificate already exists and is valid
    const existing = await this.certificateStore.get(config.domain);
    if (existing && !this.isExpiringSoon(existing)) {
      return existing;
    }

    // Use DNS-01 challenge for wildcard support
    const challenge = await this.acmeClient.createOrder(config.domain);

    // Create DNS record for challenge
    await this.dnsService.createRecords([{
      type: 'TXT',
      name: `_acme-challenge.${config.domain}`,
      value: challenge.token,
      ttl: 60,
    }]);

    // Wait for DNS propagation
    await this.waitForDNS(config.domain, challenge.token);

    // Complete challenge and get certificate
    const certificate = await this.acmeClient.completeChallengeAndGetCertificate(
      challenge
    );

    // Store certificate
    await this.certificateStore.store(config.domain, certificate);

    // Cleanup DNS record
    await this.dnsService.deleteRecord(`_acme-challenge.${config.domain}`, 'TXT');

    // Schedule auto-renewal if enabled
    if (config.autoRenew) {
      await this.scheduleRenewal(config.domain, certificate.expiresAt);
    }

    return certificate;
  }

  /**
   * Renews certificates expiring within 30 days.
   */
  async renewExpiringCertificates(): Promise<RenewalReport> {
    const expiringSoon = await this.certificateStore.getExpiringSoon(30);

    const results: RenewalResult[] = [];

    for (const cert of expiringSoon) {
      try {
        await this.provisionCertificate({
          domain: cert.domain,
          type: 'managed',
          autoRenew: true,
        });

        results.push({
          domain: cert.domain,
          status: 'renewed',
          newExpiry: cert.expiresAt,
        });
      } catch (error) {
        results.push({
          domain: cert.domain,
          status: 'failed',
          error: error.message,
        });
      }
    }

    return {
      processed: results.length,
      renewed: results.filter(r => r.status === 'renewed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    };
  }
}
```

---

## 8. Directory Structure

### 8.1 Multi-Site Directory Layout

```
rses-cms/
├── kernel/                              # Core system (unchanged)
│   └── ...
│
├── multisite/                           # MULTI-SITE MANAGEMENT
│   │
│   ├── network/                         # Network-level management
│   │   ├── types.ts                     # Network types and interfaces
│   │   ├── network-manager.ts           # Network CRUD operations
│   │   ├── quota-manager.ts             # Resource quota management
│   │   └── billing-integration.ts       # Billing system integration
│   │
│   ├── site/                            # Site management
│   │   ├── types.ts                     # Site types and interfaces
│   │   ├── site-context.ts              # Request-scoped site context
│   │   ├── site-service.ts              # Site CRUD operations
│   │   ├── site-config-loader.ts        # Configuration loading
│   │   └── site-health-monitor.ts       # Site health tracking
│   │
│   ├── provisioning/                    # Automated provisioning
│   │   ├── types.ts                     # Provisioning types
│   │   ├── provisioning-service.ts      # Main provisioning logic
│   │   ├── provisioning-steps/          # Step implementations
│   │   │   ├── validate.ts
│   │   │   ├── provision-database.ts
│   │   │   ├── setup-dns.ts
│   │   │   ├── provision-ssl.ts
│   │   │   ├── configure-cdn.ts
│   │   │   ├── apply-template.ts
│   │   │   └── activate.ts
│   │   ├── templates/                   # Site templates
│   │   │   ├── blank.ts
│   │   │   ├── blog.ts
│   │   │   ├── store.ts
│   │   │   ├── docs.ts
│   │   │   └── custom/
│   │   └── provisioning-queue.ts        # Async job processing
│   │
│   ├── routing/                         # Domain routing
│   │   ├── types.ts                     # Routing types
│   │   ├── domain-router.ts             # Domain-to-site resolution
│   │   ├── edge-worker.ts               # Edge worker logic
│   │   ├── domain-registry.ts           # Domain mapping storage
│   │   └── domain-verifier.ts           # DNS verification
│   │
│   ├── sharding/                        # Database sharding
│   │   ├── types.ts                     # Sharding types
│   │   ├── shard-router.ts              # Shard selection logic
│   │   ├── shard-manager.ts             # Shard lifecycle management
│   │   ├── connection-pool-manager.ts   # Per-shard connection pools
│   │   └── shard-rebalancer.ts          # Load rebalancing
│   │
│   ├── sso/                             # Single Sign-On
│   │   ├── types.ts                     # SSO types
│   │   ├── sso-service.ts               # Cross-site authentication
│   │   ├── session-manager.ts           # Network-wide sessions
│   │   └── identity-provider.ts         # IdP integration
│   │
│   ├── syndication/                     # Content syndication
│   │   ├── types.ts                     # Syndication types
│   │   ├── syndication-service.ts       # Cross-site content sharing
│   │   ├── syndication-rules.ts         # Auto-syndication rules
│   │   └── conflict-resolver.ts         # Merge conflict handling
│   │
│   ├── analytics/                       # Network analytics
│   │   ├── types.ts                     # Analytics types
│   │   ├── aggregation-service.ts       # Cross-site aggregation
│   │   ├── realtime-dashboard.ts        # Live metrics
│   │   └── reporting-service.ts         # Scheduled reports
│   │
│   └── dashboard/                       # Network admin UI
│       ├── components/
│       │   ├── NetworkOverview.tsx
│       │   ├── SiteList.tsx
│       │   ├── SiteProvisioningWizard.tsx
│       │   ├── DomainManager.tsx
│       │   ├── NetworkAnalytics.tsx
│       │   ├── UserManagement.tsx
│       │   └── FeatureFlagManager.tsx
│       ├── hooks/
│       │   ├── useNetworkContext.ts
│       │   ├── useSiteList.ts
│       │   └── useNetworkAnalytics.ts
│       └── pages/
│           ├── NetworkDashboard.tsx
│           ├── SitesPage.tsx
│           ├── ProvisioningPage.tsx
│           ├── DomainsPage.tsx
│           ├── AnalyticsPage.tsx
│           └── SettingsPage.tsx
│
├── adapters/
│   │
│   └── multisite/                       # Multi-site adapters
│       ├── dns/                         # DNS provider adapters
│       │   ├── cloudflare.ts
│       │   ├── route53.ts
│       │   ├── google-dns.ts
│       │   └── custom.ts
│       │
│       ├── ssl/                         # SSL providers
│       │   ├── letsencrypt.ts
│       │   ├── cloudflare-ssl.ts
│       │   └── aws-acm.ts
│       │
│       ├── cdn/                         # CDN providers
│       │   ├── cloudflare.ts
│       │   ├── fastly.ts
│       │   ├── cloudfront.ts
│       │   └── vercel.ts
│       │
│       └── edge/                        # Edge worker platforms
│           ├── cloudflare-workers/
│           │   ├── router.ts
│           │   └── wrangler.toml
│           ├── vercel-edge/
│           │   ├── router.ts
│           │   └── vercel.json
│           └── aws-lambda-edge/
│               ├── router.ts
│               └── template.yaml
│
├── infrastructure/
│   │
│   └── multisite/                       # Multi-site infrastructure
│       ├── terraform/
│       │   ├── modules/
│       │   │   ├── site-shard/          # Database shard module
│       │   │   ├── edge-deployment/     # Edge worker module
│       │   │   ├── cdn-config/          # CDN configuration
│       │   │   └── ssl-management/      # Certificate management
│       │   └── environments/
│       │       ├── production/
│       │       ├── staging/
│       │       └── development/
│       │
│       └── kubernetes/
│           ├── base/
│           │   ├── network-controller.yaml
│           │   ├── site-operator.yaml
│           │   └── provisioning-jobs.yaml
│           └── overlays/
│               ├── production/
│               └── staging/
│
└── shared/
    │
    └── multisite/                       # Shared multi-site types
        ├── network-schema.ts            # Network database schema
        ├── site-schema.ts               # Site configuration schema
        ├── domain-schema.ts             # Domain mapping schema
        ├── provisioning-schema.ts       # Provisioning status schema
        └── analytics-schema.ts          # Analytics aggregation schema
```

---

## 9. Implementation Interfaces

### 9.1 Core Multi-Site Interfaces

```typescript
// multisite/network/types.ts

/**
 * Network represents a collection of related sites.
 */
export interface Network {
  /** Unique network identifier */
  id: string;

  /** Network name */
  name: string;

  /** Network slug for URLs */
  slug: string;

  /** Network status */
  status: 'active' | 'suspended' | 'pending';

  /** Subscription tier */
  tier: 'starter' | 'professional' | 'enterprise';

  /** Resource quotas */
  quota: NetworkQuota;

  /** Feature flags */
  features: NetworkFeatures;

  /** Primary admin user */
  ownerId: string;

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Network resource quotas.
 */
export interface NetworkQuota {
  /** Maximum number of sites */
  maxSites: number;

  /** Maximum storage in bytes */
  maxStorageBytes: number;

  /** Maximum monthly bandwidth in bytes */
  maxBandwidthBytes: number;

  /** Maximum API requests per month */
  maxApiRequests: number;

  /** Maximum users across all sites */
  maxUsers: number;
}

/**
 * Network feature flags.
 */
export interface NetworkFeatures {
  /** Allow custom domains */
  customDomains: boolean;

  /** Allow SSL certificates */
  sslEnabled: boolean;

  /** Allow content syndication */
  contentSyndication: boolean;

  /** Allow enterprise tier sites */
  enterpriseTier: boolean;

  /** Allow API access */
  apiAccess: boolean;

  /** Allow SSO configuration */
  ssoConfiguration: boolean;

  /** Allow white-labeling */
  whiteLabel: boolean;
}
```

### 9.2 Site Context Interface

```typescript
// multisite/site/site-context.ts

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Complete site context for request processing.
 */
export interface SiteContext {
  /** Site identifier */
  readonly siteId: string;

  /** Site configuration */
  readonly config: SiteConfig;

  /** Database pool for site's shard */
  readonly db: ScopedDatabasePool;

  /** Cache with site-scoped keys */
  readonly cache: ScopedCache;

  /** Feature flags for this site */
  readonly features: SiteFeatures;

  /** Current authenticated user */
  readonly user?: AuthenticatedUser;

  /** Request context */
  readonly request: {
    id: string;
    startTime: number;
    ip: string;
    userAgent: string;
  };
}

/**
 * Database pool scoped to a site.
 */
export interface ScopedDatabasePool {
  /**
   * Queries within site scope (automatic WHERE site_id = ...).
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Inserts with automatic site_id.
   */
  insert<T>(table: string, data: Omit<T, 'siteId'>): Promise<T>;

  /**
   * Updates within site scope.
   */
  update<T>(table: string, where: Partial<T>, data: Partial<T>): Promise<T>;

  /**
   * Deletes within site scope.
   */
  delete(table: string, where: Record<string, unknown>): Promise<void>;

  /**
   * Transaction within site scope.
   */
  transaction<T>(fn: (tx: ScopedDatabasePool) => Promise<T>): Promise<T>;
}

/**
 * Cache scoped to a site.
 */
export interface ScopedCache {
  /**
   * Gets a cached value (key automatically prefixed).
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Sets a cached value.
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Deletes a cached value.
   */
  delete(key: string): Promise<void>;

  /**
   * Invalidates all cache for this site.
   */
  invalidateAll(): Promise<void>;
}
```

### 9.3 Provisioning Interface

```typescript
// multisite/provisioning/types.ts

/**
 * Site provisioning request.
 */
export interface ProvisioningRequest {
  /** Request identifier for tracking */
  requestId: string;

  /** Target network */
  networkId: string;

  /** Site details */
  site: {
    name: string;
    slug: string;
    tier: SiteTier;
    region: string;
    template?: string;
  };

  /** Domain configuration */
  domain?: {
    custom?: string;
    includeSubdomain: boolean;
  };

  /** Initial configuration */
  config?: Partial<SiteConfigDetails>;

  /** Requesting user */
  requestedBy: string;

  /** Priority (affects queue position) */
  priority: 'low' | 'normal' | 'high';
}

/**
 * Provisioning status tracking.
 */
export interface ProvisioningStatus {
  /** Request identifier */
  requestId: string;

  /** Current overall status */
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

  /** Individual step statuses */
  steps: ProvisioningStep[];

  /** Created site ID (when successful) */
  siteId?: string;

  /** Error message (when failed) */
  error?: string;

  /** Timestamps */
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  /** Estimated completion time */
  estimatedCompletion?: Date;
}

/**
 * Individual provisioning step.
 */
export interface ProvisioningStep {
  /** Step name */
  name: string;

  /** Step description */
  description: string;

  /** Step status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

  /** Progress percentage (0-100) */
  progress: number;

  /** Timestamps */
  startedAt?: Date;
  completedAt?: Date;

  /** Error if failed */
  error?: string;

  /** Step output/result */
  output?: Record<string, unknown>;
}

/**
 * Provisioning service interface.
 */
export interface ProvisioningService {
  /**
   * Queues a new site provisioning request.
   */
  queueProvisioning(request: ProvisioningRequest): Promise<string>;

  /**
   * Gets provisioning status.
   */
  getStatus(requestId: string): Promise<ProvisioningStatus>;

  /**
   * Cancels a queued or running provisioning.
   */
  cancel(requestId: string): Promise<void>;

  /**
   * Retries a failed provisioning.
   */
  retry(requestId: string): Promise<void>;

  /**
   * Lists provisioning requests for a network.
   */
  listForNetwork(
    networkId: string,
    filters?: ProvisioningFilters
  ): Promise<ProvisioningStatus[]>;
}
```

### 9.4 Domain Routing Interface

```typescript
// multisite/routing/types.ts

/**
 * Domain mapping stored in network database.
 */
export interface DomainMapping {
  /** Mapping identifier */
  id: string;

  /** Domain name */
  domain: string;

  /** Associated site */
  siteId: string;

  /** Domain type */
  type: 'primary' | 'alias' | 'preview' | 'branch';

  /** SSL certificate status */
  sslStatus: 'pending' | 'provisioning' | 'active' | 'expired' | 'failed';

  /** SSL certificate expiry */
  sslExpiresAt?: Date;

  /** DNS verification status */
  dnsVerified: boolean;

  /** DNS verification token */
  dnsVerificationToken: string;

  /** Last verification attempt */
  lastVerificationAt?: Date;

  /** Created timestamp */
  createdAt: Date;
}

/**
 * Domain router interface.
 */
export interface DomainRouter {
  /**
   * Resolves a hostname to a site.
   */
  resolve(hostname: string): Promise<SiteConfig | null>;

  /**
   * Adds a new domain mapping.
   */
  addMapping(mapping: Omit<DomainMapping, 'id' | 'createdAt'>): Promise<DomainMapping>;

  /**
   * Removes a domain mapping.
   */
  removeMapping(domain: string): Promise<void>;

  /**
   * Verifies DNS configuration for a domain.
   */
  verifyDNS(domain: string): Promise<DNSVerificationResult>;

  /**
   * Lists all domains for a site.
   */
  listForSite(siteId: string): Promise<DomainMapping[]>;
}

/**
 * DNS verification result.
 */
export interface DNSVerificationResult {
  /** Whether DNS is correctly configured */
  verified: boolean;

  /** Individual checks */
  checks: {
    cname: boolean;
    txt: boolean;
    caa?: boolean;
  };

  /** Current DNS values */
  current: {
    cname?: string;
    txt?: string[];
    caa?: string[];
  };

  /** Expected values */
  expected: {
    cname: string;
    txt: string;
    caa?: string;
  };

  /** Error messages */
  errors: string[];
}
```

### 9.5 SSO Interface

```typescript
// multisite/sso/types.ts

/**
 * Network-wide user identity.
 */
export interface NetworkIdentity {
  /** Network user identifier */
  id: string;

  /** Associated network */
  networkId: string;

  /** Email address */
  email: string;

  /** Display name */
  displayName: string;

  /** Network-level role */
  networkRole: 'owner' | 'admin' | 'member';

  /** Per-site roles */
  siteRoles: Map<string, SiteRole>;

  /** SSO provider (if external) */
  ssoProvider?: string;

  /** SSO subject ID */
  ssoSubjectId?: string;

  /** Created timestamp */
  createdAt: Date;

  /** Last login timestamp */
  lastLoginAt?: Date;
}

/**
 * Site-specific role.
 */
export interface SiteRole {
  siteId: string;
  role: 'admin' | 'editor' | 'author' | 'viewer';
  permissions: string[];
  grantedAt: Date;
  grantedBy: string;
}

/**
 * SSO service interface.
 */
export interface SSOService {
  /**
   * Creates a network-wide session.
   */
  createSession(
    identity: NetworkIdentity,
    metadata: SessionMetadata
  ): Promise<NetworkSession>;

  /**
   * Validates a session and returns identity.
   */
  validateSession(sessionToken: string): Promise<NetworkIdentity | null>;

  /**
   * Checks if user has access to a site.
   */
  checkSiteAccess(
    identity: NetworkIdentity,
    siteId: string,
    requiredRole?: SiteRole['role']
  ): Promise<boolean>;

  /**
   * Generates a site-specific token from network session.
   */
  generateSiteToken(
    session: NetworkSession,
    siteId: string
  ): Promise<string>;

  /**
   * Invalidates all sessions for a user.
   */
  invalidateAllSessions(identityId: string): Promise<void>;
}

/**
 * Network session.
 */
export interface NetworkSession {
  /** Session token */
  token: string;

  /** Associated identity */
  identityId: string;

  /** Accessible sites */
  accessibleSites: string[];

  /** Session creation time */
  createdAt: Date;

  /** Session expiry */
  expiresAt: Date;

  /** Last activity */
  lastActivityAt: Date;

  /** Session metadata */
  metadata: SessionMetadata;
}
```

---

## Summary

The RSES CMS Multi-Site Architecture provides:

1. **Flexible Deployment Models**: Choose from single-tenant, multi-tenant, hybrid, or edge deployment based on requirements.

2. **Robust Database Sharding**: Schema-per-site or horizontal sharding with intelligent routing ensures data isolation and scalability.

3. **Seamless Domain Management**: Automated DNS configuration, SSL provisioning, and domain verification.

4. **Request-Scoped Site Context**: Clean abstraction for multi-tenant request handling using AsyncLocalStorage.

5. **Automated Provisioning**: Complete site setup in minutes with template support and full automation.

6. **Centralized Dashboard**: Network-wide management with site-level autonomy.

7. **Single Sign-On**: Network-wide authentication with per-site authorization.

8. **Content Syndication**: Cross-site content sharing with conflict resolution.

This architecture scales from a single site to thousands of sites while maintaining performance, security, and operational simplicity.

---

**Document Version**: 1.0.0
**Last Updated**: 2026-02-01
**Authors**: Project Architect Agent
**Review Status**: Ready for Implementation
