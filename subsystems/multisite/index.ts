/**
 * @file index.ts
 * @description Multi-Site Subsystem - Main Exports
 * @phase Multi-Site Architecture
 * @author FW (File Watcher Specialist Agent)
 * @created 2026-02-01
 *
 * RSES CMS Multi-Site Subsystem
 *
 * Provides complete infrastructure for running RSES CMS across multiple
 * geographically distributed sites with:
 *
 * - Cross-site content synchronization
 * - Asset distribution and CDN integration
 * - Configuration management
 * - Real-time event streaming
 * - Conflict detection and resolution
 * - Automatic failover
 * - Comprehensive monitoring
 *
 * Architecture Overview:
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │                     MULTI-SITE SYNC ARCHITECTURE                     │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │                                                                       │
 * │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │
 * │  │   Site A    │     │   Site B    │     │   Site C    │             │
 * │  │  (Primary)  │────▶│  (Replica)  │────▶│   (Edge)    │             │
 * │  └─────────────┘     └─────────────┘     └─────────────┘             │
 * │         │                   │                   │                     │
 * │         ▼                   ▼                   ▼                     │
 * │  ┌─────────────────────────────────────────────────────────┐         │
 * │  │                    SYNC ORCHESTRATOR                     │         │
 * │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │         │
 * │  │  │ Registry │ │Scheduler │ │ Failover │ │ Monitor  │   │         │
 * │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │         │
 * │  └─────────────────────────────────────────────────────────┘         │
 * │                              │                                        │
 * │         ┌────────────────────┼────────────────────┐                  │
 * │         ▼                    ▼                    ▼                  │
 * │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐             │
 * │  │  Content    │     │   Asset     │     │   Config    │             │
 * │  │ Replication │     │Distribution │     │    Sync     │             │
 * │  └─────────────┘     └─────────────┘     └─────────────┘             │
 * │         │                    │                    │                  │
 * │         └────────────────────┼────────────────────┘                  │
 * │                              ▼                                        │
 * │  ┌─────────────────────────────────────────────────────────┐         │
 * │  │                      SYNC QUEUE                          │         │
 * │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │         │
 * │  │  │Partition │ │Partition │ │Partition │ │   DLQ    │   │         │
 * │  │  │ content  │ │  assets  │ │  config  │ │          │   │         │
 * │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │         │
 * │  └─────────────────────────────────────────────────────────┘         │
 * │                                                                       │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *
 * ```typescript
 * import { createMultiSiteInfrastructure } from '@rses/multisite';
 *
 * const infrastructure = createMultiSiteInfrastructure({
 *   siteId: 'site-001',
 *   contentStorage: myContentStorage,
 *   assetStorage: myAssetStorage,
 *   configStorage: myConfigStorage,
 *   topology: 'star',
 * });
 *
 * await infrastructure.start();
 *
 * // Add remote sites
 * infrastructure.addSite({
 *   id: 'site-002',
 *   name: 'US East Replica',
 *   role: 'replica',
 *   // ...
 * });
 *
 * // Add syndication rules
 * infrastructure.addSyndicationRule({
 *   name: 'Sync Articles',
 *   contentTypes: ['article'],
 *   mode: 'incremental',
 *   schedule: '0 * * * *', // Every hour
 * });
 *
 * // Trigger manual sync
 * await infrastructure.syncToSite('site-002');
 *
 * // Get dashboard data
 * const dashboard = infrastructure.getDashboard();
 * ```
 */

// =============================================================================
// PROTOCOL
// =============================================================================

export {
  // Version
  PROTOCOL_VERSION,
  PROTOCOL_MAGIC,
  // Message types
  MessageType,
  MessageFlags,
  // Message interfaces
  type MessageHeader,
  type HelloMessage,
  type HelloAckMessage,
  type AuthRequestMessage,
  type AuthResponseMessage,
  type GetCheckpointMessage,
  type CheckpointMessage,
  type ChangesRequestMessage,
  type ChangesResponseMessage,
  type ChangeResult,
  type DocumentMessage,
  type DocumentAckMessage,
  type RevsDiffMessage,
  type RevsDiffResponseMessage,
  type ManifestRequestMessage,
  type ManifestResponseMessage,
  type AssetManifestEntry,
  type AssetRequestMessage,
  type AssetResponseMessage,
  type DeltaMessage,
  type ConfigExportMessage,
  type ConfigImportMessage,
  type ConfigAckMessage,
  type SubscribeMessage,
  type UnsubscribeMessage,
  type EventMessage,
  type HeartbeatMessage,
  type HeartbeatAckMessage,
  type ErrorMessage,
  type CloseMessage,
  type ProtocolMessage,
  // Serialization
  serializeHeader,
  parseHeader,
  serializeMessage,
  parseMessage,
  // Codes
  ErrorCodes,
  CloseCodes,
} from "./protocol";

// =============================================================================
// ORCHESTRATOR
// =============================================================================

export {
  // Registry
  SiteRegistry,
  // Scheduler
  SyncScheduler,
  // Failover
  FailoverManager,
  // Orchestrator
  SyncOrchestrator,
  // Types
  type OrchestratorState,
  type TopologyType,
  type SiteConnection,
  type ScheduledSyncJob,
  type OrchestratorOptions,
  type OrchestratorEvents,
} from "./orchestrator";

// =============================================================================
// RE-EXPORT SYNC SERVICES
// =============================================================================

export * from "../../server/services/sync";

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

import { ContentStorage } from "../../server/services/sync/content-replication";
import { AssetStore } from "../../server/services/sync/asset-distribution";
import { ConfigStore } from "../../server/services/sync/config-sync";
import { SyncOrchestrator, TopologyType } from "./orchestrator";
import { SiteIdentity, SyndicationRule } from "../../server/services/sync/types";

/**
 * Options for creating multi-site infrastructure
 */
export interface MultiSiteInfrastructureOptions {
  /** Local site ID */
  siteId: string;
  /** Content storage implementation */
  contentStorage: ContentStorage;
  /** Asset storage implementation */
  assetStorage: AssetStore;
  /** Config storage implementation */
  configStorage: ConfigStore;
  /** Topology type */
  topology?: TopologyType;
  /** Auto-discover other sites */
  autoDiscover?: boolean;
  /** Enable automatic failover */
  autoFailover?: boolean;
  /** Primary site ID (for star/hub-spoke topologies) */
  primarySiteId?: string;
}

/**
 * Multi-site infrastructure facade
 */
export interface MultiSiteInfrastructure {
  /** The underlying orchestrator */
  orchestrator: SyncOrchestrator;
  /** Start the infrastructure */
  start(): Promise<void>;
  /** Stop the infrastructure */
  stop(): Promise<void>;
  /** Add a site */
  addSite(site: SiteIdentity): void;
  /** Remove a site */
  removeSite(siteId: string): void;
  /** Add a syndication rule */
  addSyndicationRule(rule: Omit<SyndicationRule, "id" | "createdAt" | "updatedAt">): void;
  /** Sync to a specific site */
  syncToSite(targetSiteId: string, options?: { contentTypes?: string[] }): Promise<void>;
  /** Get dashboard data */
  getDashboard(): unknown;
  /** Get all sites */
  getSites(): SiteIdentity[];
}

/**
 * Create complete multi-site infrastructure
 */
export function createMultiSiteInfrastructure(
  options: MultiSiteInfrastructureOptions
): MultiSiteInfrastructure {
  const orchestrator = new SyncOrchestrator(
    options.contentStorage,
    options.configStorage,
    {
      siteId: options.siteId,
      topology: options.topology || "star",
      autoDiscover: options.autoDiscover || false,
      autoFailover: options.autoFailover ?? true,
    }
  );

  return {
    orchestrator,

    async start() {
      await orchestrator.start();
    },

    async stop() {
      await orchestrator.stop();
    },

    addSite(site: SiteIdentity) {
      orchestrator.addSite(site);
    },

    removeSite(siteId: string) {
      orchestrator.removeSite(siteId);
    },

    addSyndicationRule(rule) {
      const fullRule: SyndicationRule = {
        id: crypto.randomUUID(),
        ...rule,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      orchestrator.addSyndicationRule(fullRule);
    },

    async syncToSite(targetSiteId, syncOptions) {
      await orchestrator.syncToSite(targetSiteId, syncOptions);
    },

    getDashboard() {
      return orchestrator.getDashboard();
    },

    getSites() {
      return orchestrator.getSites();
    },
  };
}

// =============================================================================
// TOPOLOGY HELPERS
// =============================================================================

/**
 * Create a star topology with one primary and multiple replicas
 */
export function createStarTopology(
  primarySite: SiteIdentity,
  replicaSites: SiteIdentity[]
): { primary: SiteIdentity; replicas: SiteIdentity[] } {
  primarySite.role = "primary";
  for (const replica of replicaSites) {
    replica.role = "replica";
  }
  return { primary: primarySite, replicas: replicaSites };
}

/**
 * Create a mesh topology where all sites connect to each other
 */
export function createMeshTopology(
  sites: SiteIdentity[]
): SiteIdentity[] {
  // In mesh topology, all sites are equal (typically edge nodes)
  for (const site of sites) {
    site.role = "edge";
  }
  return sites;
}

/**
 * Create a hub-spoke topology with regional hubs
 */
export function createHubSpokeTopology(
  hubs: Array<{ site: SiteIdentity; spokes: SiteIdentity[] }>
): { hubs: SiteIdentity[]; spokes: SiteIdentity[] } {
  const allHubs: SiteIdentity[] = [];
  const allSpokes: SiteIdentity[] = [];

  for (const { site: hub, spokes } of hubs) {
    hub.role = "hub";
    allHubs.push(hub);

    for (const spoke of spokes) {
      spoke.role = "replica";
      spoke.region = hub.region; // Assign to hub's region
      allSpokes.push(spoke);
    }
  }

  return { hubs: allHubs, spokes: allSpokes };
}
