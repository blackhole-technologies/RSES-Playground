/**
 * @file index.ts
 * @description Remote Automation Engine for RSES CMS.
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * This module provides comprehensive automation capabilities:
 * - Scheduled task execution (cron, interval)
 * - Webhook triggers with HMAC validation
 * - API-driven automation
 * - Event-driven workflows
 * - Cross-site orchestration
 * - Integration connectors (Zapier/n8n style)
 *
 * Inspired by:
 * - Zapier: Trigger-action model
 * - n8n: Visual workflow builder
 * - GitHub Actions: YAML workflows
 * - Temporal.io: Durable execution
 * - Jenkins: Build pipelines
 */

// Core types
export * from "./types";

// Trigger system
export {
  TriggerRegistry,
  getTriggerRegistry,
  resetTriggerRegistry,
  parseCronExpression,
  getNextCronExecution,
  describeCron,
  RateLimiter,
  TriggerDebouncer,
  ConditionEvaluator,
  WebhookValidator,
  createCronTrigger,
  createWebhookTrigger,
  createEventTrigger,
  createManualTrigger,
  createIntervalTrigger,
  type TriggerRegistration,
  type TriggerEvent,
  type TriggerEventHandler,
  type ParsedCron,
} from "./trigger-system";

// Action registry
export {
  ActionRegistry,
  getActionRegistry,
  resetActionRegistry,
  createActionInstance,
  createTestContext,
  type ActionContext,
  type ActionLogger,
  type ActionMetrics,
  type ActionHandler,
  type CompensationHandler,
  type RegisteredAction,
  type ActionResult,
} from "./action-registry";

// Workflow engine
export {
  WorkflowEngine,
  getWorkflowEngine,
  resetWorkflowEngine,
  workflowToVisual,
  visualToWorkflow,
  ExpressionEvaluator,
  TransformExecutor,
  NodeType,
  type VisualNode,
  type VisualEdge,
  type VisualWorkflow,
  type NodePosition,
} from "./workflow-engine";

// Cross-site orchestration. Local import for use by shutdownAutomationEngine
// below — the export-from block re-exports for external callers but doesn't
// bring the symbol into local scope.
import { getFederationManager } from "./cross-site-orchestration";

export {
  FederationManager,
  initializeFederationManager,
  getFederationManager,
  resetFederationManager,
  generateSiteIdentity,
  signMessage,
  verifyMessage,
  DistributedWorkflowCoordinator,
  SiteHealthMonitor,
  CrossSiteMessageType,
  type SiteIdentity,
  type FederationConnection,
  type HelloPayload,
  type EventBroadcastPayload,
  type ActionRequestPayload,
  type ActionResponsePayload,
  type HealthResponsePayload,
  type DistributedWorkflowState,
  type SiteStepMapping,
  type HealthHistoryEntry,
  type SiteHealthAlert,
} from "./cross-site-orchestration";

// Integration connectors
export {
  ConnectorRegistry,
  initializeConnectorRegistry,
  getConnectorRegistry,
  resetConnectorRegistry,
  CredentialManager,
  OAuth2Manager,
  type OAuth2Config,
  type OAuth2Tokens,
} from "./integration-connectors";

// Monitoring
export {
  AutomationMonitor,
  getAutomationMonitor,
  resetAutomationMonitor,
  TimeSeriesStore,
  RunHistoryStore,
  AlertManager,
  AuditLogger,
  ConsoleNotificationSender,
  type TimeSeriesPoint,
  type TimeSeriesAggregation,
  type Alert,
  type NotificationSender,
  type AuditLogEntry,
} from "./monitoring";

// ==================== Initialization ====================

import { getTriggerRegistry } from "./trigger-system";
import { getWorkflowEngine } from "./workflow-engine";
import { initializeFederationManager, generateSiteIdentity } from "./cross-site-orchestration";
import { initializeConnectorRegistry } from "./integration-connectors";
import { getAutomationMonitor } from "./monitoring";

/**
 * Automation engine configuration.
 */
export interface AutomationEngineConfig {
  /** Site name for identification */
  siteName: string;
  /** Site URL */
  siteUrl: string;
  /** Encryption key for credentials (min 32 chars) */
  encryptionKey: string;
  /** Enable cross-site features */
  enableCrossSite?: boolean;
  /** Enable monitoring */
  enableMonitoring?: boolean;
  /** Custom site metadata */
  siteMetadata?: Record<string, unknown>;
}

/**
 * Initialized automation engine.
 */
export interface AutomationEngine {
  triggerRegistry: ReturnType<typeof getTriggerRegistry>;
  workflowEngine: ReturnType<typeof getWorkflowEngine>;
  connectorRegistry: ReturnType<typeof initializeConnectorRegistry>;
  monitor: ReturnType<typeof getAutomationMonitor>;
  federationManager?: ReturnType<typeof initializeFederationManager>;
  siteIdentity?: ReturnType<typeof generateSiteIdentity>;
}

/**
 * Initializes the complete automation engine.
 */
export function initializeAutomationEngine(config: AutomationEngineConfig): AutomationEngine {
  // Initialize trigger registry
  const triggerRegistry = getTriggerRegistry();

  // Initialize workflow engine
  const workflowEngine = getWorkflowEngine();

  // Initialize connector registry
  const connectorRegistry = initializeConnectorRegistry(config.encryptionKey);

  // Initialize monitor
  const monitor = getAutomationMonitor();

  // Initialize cross-site if enabled
  let federationManager: ReturnType<typeof initializeFederationManager> | undefined;
  let siteIdentity: ReturnType<typeof generateSiteIdentity> | undefined;

  if (config.enableCrossSite) {
    siteIdentity = generateSiteIdentity(
      config.siteName,
      config.siteUrl,
      config.siteMetadata
    );
    federationManager = initializeFederationManager(siteIdentity);
  }

  // Connect trigger events to workflow engine
  triggerRegistry.addHandler(async (event) => {
    try {
      const execution = await workflowEngine.startExecution(
        event.workflowId,
        event
      );

      monitor.recordExecutionStart(
        execution.id,
        execution.workflowId,
        "", // Would need workflow name lookup
        event.type,
        event.siteId,
        execution.triggeredBy
      );
    } catch (err) {
      console.error("Failed to start workflow from trigger:", err);
    }
  });

  // Start services
  triggerRegistry.start();
  workflowEngine.start();

  if (config.enableMonitoring) {
    monitor.start();
  }

  if (federationManager) {
    federationManager.startHealthChecks();
  }

  return {
    triggerRegistry,
    workflowEngine,
    connectorRegistry,
    monitor,
    federationManager,
    siteIdentity,
  };
}

/**
 * Shuts down the automation engine.
 */
export function shutdownAutomationEngine(): void {
  const triggerRegistry = getTriggerRegistry();
  const workflowEngine = getWorkflowEngine();
  const monitor = getAutomationMonitor();

  triggerRegistry.stop();
  workflowEngine.stop();
  monitor.stop();

  const federationManager = getFederationManager();
  if (federationManager) {
    federationManager.stopHealthChecks();
  }
}

// getFederationManager is already exported earlier in this file via the
// `Cross-site orchestration` export block (line ~86). The duplicate
// trailing re-export was removed 2026-04-14 to fix TS2300 errors.
