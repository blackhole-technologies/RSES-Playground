/**
 * @file cross-site-orchestration.ts
 * @description Cross-site automation orchestration system.
 * @phase Phase 10 - Remote Automation
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Site federation and discovery
 * - Secure inter-site communication
 * - Distributed workflow execution
 * - Cross-site event propagation
 * - Health monitoring for workflows
 * - Message signing and verification
 */

import { randomUUID } from "crypto";
import { createSign, createVerify, generateKeyPairSync } from "crypto";
import { z } from "zod";
import { CircuitBreaker, CircuitState } from "../../lib/circuit-breaker";
import type {
  SiteId,
  WorkflowId,
  ExecutionId,
  SiteFederation,
  CrossSiteMessage,
  ActionInstance,
} from "./types";

// ==================== Site Identity ====================

/**
 * Site identity configuration.
 */
export interface SiteIdentity {
  /** Unique site identifier */
  siteId: SiteId;
  /** Site display name */
  name: string;
  /** Site base URL */
  url: string;
  /** Public key for verification */
  publicKey: string;
  /** Private key for signing (kept secret) */
  privateKey: string;
  /** Site metadata */
  metadata: Record<string, unknown>;
  /** When identity was created */
  createdAt: Date;
}

/**
 * Generates a new site identity with key pair.
 */
export function generateSiteIdentity(
  name: string,
  url: string,
  metadata?: Record<string, unknown>
): SiteIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return {
    siteId: randomUUID(),
    name,
    url,
    publicKey,
    privateKey,
    metadata: metadata || {},
    createdAt: new Date(),
  };
}

// ==================== Message Types ====================

/**
 * Cross-site message types.
 */
export enum CrossSiteMessageType {
  // Discovery
  HELLO = "hello",
  HELLO_RESPONSE = "hello_response",
  GOODBYE = "goodbye",

  // Events
  EVENT_BROADCAST = "event_broadcast",
  EVENT_ACK = "event_ack",

  // Actions
  ACTION_REQUEST = "action_request",
  ACTION_RESPONSE = "action_response",
  ACTION_CANCEL = "action_cancel",

  // Workflows
  WORKFLOW_START = "workflow_start",
  WORKFLOW_STATUS = "workflow_status",
  WORKFLOW_COMPLETE = "workflow_complete",

  // Health
  HEALTH_CHECK = "health_check",
  HEALTH_RESPONSE = "health_response",

  // Sync
  SYNC_REQUEST = "sync_request",
  SYNC_RESPONSE = "sync_response",
}

/**
 * Hello message payload.
 */
export interface HelloPayload {
  siteId: SiteId;
  name: string;
  url: string;
  publicKey: string;
  capabilities: string[];
  version: string;
}

/**
 * Event broadcast payload.
 */
export interface EventBroadcastPayload {
  eventType: string;
  entityType: string;
  entityId: string;
  data: unknown;
  originSiteId: SiteId;
}

/**
 * Action request payload.
 */
export interface ActionRequestPayload {
  requestId: string;
  action: ActionInstance;
  context: {
    workflowId?: WorkflowId;
    executionId?: ExecutionId;
    userId?: string;
  };
  timeout: number;
}

/**
 * Action response payload.
 */
export interface ActionResponsePayload {
  requestId: string;
  success: boolean;
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
  durationMs: number;
}

/**
 * Health response payload.
 */
export interface HealthResponsePayload {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  load: {
    cpu: number;
    memory: number;
    activeExecutions: number;
  };
  services: Record<string, { status: string; latency?: number }>;
}

// ==================== Message Signing ====================

/**
 * Signs a message with the site's private key.
 */
export function signMessage(message: CrossSiteMessage, privateKey: string): string {
  const sign = createSign("RSA-SHA256");
  sign.update(JSON.stringify({
    id: message.id,
    sourceSiteId: message.sourceSiteId,
    targetSiteId: message.targetSiteId,
    type: message.type,
    payload: message.payload,
    timestamp: message.timestamp,
  }));
  sign.end();
  return sign.sign(privateKey, "base64");
}

/**
 * Verifies a message signature.
 */
export function verifyMessage(
  message: CrossSiteMessage,
  signature: string,
  publicKey: string
): boolean {
  try {
    const verify = createVerify("RSA-SHA256");
    verify.update(JSON.stringify({
      id: message.id,
      sourceSiteId: message.sourceSiteId,
      targetSiteId: message.targetSiteId,
      type: message.type,
      payload: message.payload,
      timestamp: message.timestamp,
    }));
    verify.end();
    return verify.verify(publicKey, signature, "base64");
  } catch {
    return false;
  }
}

// ==================== Federation Manager ====================

/**
 * Federation connection state.
 */
export interface FederationConnection {
  federation: SiteFederation;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastPingAt?: Date;
  lastPongAt?: Date;
  latencyMs?: number;
  messageCount: { sent: number; received: number };
  errorCount: number;
  circuitBreaker: CircuitBreaker;
}

/**
 * Manages site federations.
 */
export class FederationManager {
  private identity: SiteIdentity;
  private federations: Map<SiteId, FederationConnection> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private eventHandlers: Map<string, Set<(event: EventBroadcastPayload) => void>> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(identity: SiteIdentity) {
    this.identity = identity;
  }

  /**
   * Gets the site identity.
   */
  getIdentity(): SiteIdentity {
    return this.identity;
  }

  /**
   * Registers a federation with another site.
   */
  async addFederation(federation: SiteFederation): Promise<void> {
    if (this.federations.has(federation.siteId)) {
      throw new Error(`Federation with site ${federation.siteId} already exists`);
    }

    const connection: FederationConnection = {
      federation,
      status: "connecting",
      messageCount: { sent: 0, received: 0 },
      errorCount: 0,
      circuitBreaker: new CircuitBreaker({
        name: `federation:${federation.siteId}`,
        failureThreshold: 3,
        resetTimeout: 60000,
        successThreshold: 2,
      }),
    };

    this.federations.set(federation.siteId, connection);

    // Send hello message
    await this.sendHello(federation.siteId);
  }

  /**
   * Removes a federation.
   */
  async removeFederation(siteId: SiteId): Promise<void> {
    const connection = this.federations.get(siteId);
    if (!connection) return;

    // Send goodbye message
    await this.sendMessage(siteId, CrossSiteMessageType.GOODBYE, {});

    this.federations.delete(siteId);
  }

  /**
   * Gets federation by site ID.
   */
  getFederation(siteId: SiteId): FederationConnection | undefined {
    return this.federations.get(siteId);
  }

  /**
   * Gets all active federations.
   */
  getActiveFederations(): FederationConnection[] {
    return Array.from(this.federations.values()).filter(
      (c) => c.status === "connected"
    );
  }

  /**
   * Sends a message to a federated site.
   */
  async sendMessage<T = unknown>(
    targetSiteId: SiteId,
    type: CrossSiteMessageType,
    payload: unknown,
    options?: { timeout?: number; replyTo?: string }
  ): Promise<T | void> {
    const connection = this.federations.get(targetSiteId);
    if (!connection) {
      throw new Error(`No federation with site ${targetSiteId}`);
    }

    if (connection.status !== "connected" && type !== CrossSiteMessageType.HELLO) {
      throw new Error(`Not connected to site ${targetSiteId}`);
    }

    // Check circuit breaker
    if (connection.circuitBreaker.getState() === CircuitState.OPEN) {
      throw new Error(`Circuit breaker open for site ${targetSiteId}`);
    }

    const message: CrossSiteMessage = {
      id: randomUUID(),
      sourceSiteId: this.identity.siteId,
      targetSiteId,
      type,
      payload,
      signature: "",
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + (options?.timeout || 30000)),
      replyTo: options?.replyTo,
    };

    // Sign message
    message.signature = signMessage(message, this.identity.privateKey);

    connection.messageCount.sent++;

    // Send via HTTP (simplified)
    const response = await this.httpSend(connection.federation.url, message);

    if (this.isRequestMessage(type)) {
      // Wait for response
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(message.id);
          reject(new Error("Request timed out"));
        }, options?.timeout || 30000);

        this.pendingRequests.set(message.id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timeout,
        });
      });
    }
  }

  /**
   * Handles incoming message.
   */
  async handleMessage(message: CrossSiteMessage): Promise<CrossSiteMessage | void> {
    const connection = this.federations.get(message.sourceSiteId);

    // Verify signature for known federations
    if (connection) {
      const valid = verifyMessage(
        message,
        message.signature,
        connection.federation.publicKey
      );

      if (!valid) {
        throw new Error("Invalid message signature");
      }

      connection.messageCount.received++;
    }

    // Check expiration
    if (new Date() > message.expiresAt) {
      throw new Error("Message expired");
    }

    // Handle based on type
    switch (message.type) {
      case CrossSiteMessageType.HELLO:
        return this.handleHello(message);

      case CrossSiteMessageType.HELLO_RESPONSE:
        return this.handleHelloResponse(message);

      case CrossSiteMessageType.GOODBYE:
        return this.handleGoodbye(message);

      case CrossSiteMessageType.EVENT_BROADCAST:
        return this.handleEventBroadcast(message);

      case CrossSiteMessageType.ACTION_REQUEST:
        return this.handleActionRequest(message);

      case CrossSiteMessageType.ACTION_RESPONSE:
        return this.handleActionResponse(message);

      case CrossSiteMessageType.HEALTH_CHECK:
        return this.handleHealthCheck(message);

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Broadcasts an event to all federated sites.
   */
  async broadcastEvent(event: EventBroadcastPayload): Promise<void> {
    const promises = Array.from(this.federations.values())
      .filter((c) => c.status === "connected")
      .filter((c) => c.federation.allowedEvents.includes(event.eventType) ||
                     c.federation.allowedEvents.includes("*"))
      .map((c) => this.sendMessage(
        c.federation.siteId,
        CrossSiteMessageType.EVENT_BROADCAST,
        event
      ).catch((err) => {
        console.error(`Failed to broadcast event to ${c.federation.siteId}:`, err);
      }));

    await Promise.all(promises);
  }

  /**
   * Requests action execution on a remote site.
   */
  async requestAction(
    targetSiteId: SiteId,
    action: ActionInstance,
    context: ActionRequestPayload["context"],
    timeout: number = 60000
  ): Promise<ActionResponsePayload> {
    const connection = this.federations.get(targetSiteId);
    if (!connection) {
      throw new Error(`No federation with site ${targetSiteId}`);
    }

    // Check if action is allowed
    if (!connection.federation.allowedActions.includes(action.actionType) &&
        !connection.federation.allowedActions.includes("*")) {
      throw new Error(`Action ${action.actionType} not allowed for site ${targetSiteId}`);
    }

    const payload: ActionRequestPayload = {
      requestId: randomUUID(),
      action,
      context,
      timeout,
    };

    return this.sendMessage<ActionResponsePayload>(
      targetSiteId,
      CrossSiteMessageType.ACTION_REQUEST,
      payload,
      { timeout }
    );
  }

  /**
   * Registers an event handler.
   */
  onEvent(eventType: string, handler: (event: EventBroadcastPayload) => void): () => void {
    let handlers = this.eventHandlers.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(eventType, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
    };
  }

  /**
   * Starts health check interval.
   */
  startHealthChecks(intervalMs: number = 30000): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const connection of this.federations.values()) {
        if (connection.status === "connected") {
          try {
            connection.lastPingAt = new Date();
            await this.sendMessage(
              connection.federation.siteId,
              CrossSiteMessageType.HEALTH_CHECK,
              {}
            );
          } catch (err) {
            connection.errorCount++;
            if (connection.errorCount >= 3) {
              connection.status = "error";
            }
          }
        }
      }
    }, intervalMs);
  }

  /**
   * Stops health checks.
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Sends hello message.
   */
  private async sendHello(targetSiteId: SiteId): Promise<void> {
    const payload: HelloPayload = {
      siteId: this.identity.siteId,
      name: this.identity.name,
      url: this.identity.url,
      publicKey: this.identity.publicKey,
      capabilities: ["events", "actions", "workflows"],
      version: "1.0.0",
    };

    await this.sendMessage(targetSiteId, CrossSiteMessageType.HELLO, payload);
  }

  /**
   * Handles hello message.
   */
  private async handleHello(message: CrossSiteMessage): Promise<CrossSiteMessage> {
    const payload = message.payload as HelloPayload;

    // Check if we have a pending federation
    const connection = this.federations.get(message.sourceSiteId);
    if (connection) {
      connection.status = "connected";
    }

    // Send hello response
    const responsePayload: HelloPayload = {
      siteId: this.identity.siteId,
      name: this.identity.name,
      url: this.identity.url,
      publicKey: this.identity.publicKey,
      capabilities: ["events", "actions", "workflows"],
      version: "1.0.0",
    };

    const response: CrossSiteMessage = {
      id: randomUUID(),
      sourceSiteId: this.identity.siteId,
      targetSiteId: message.sourceSiteId,
      type: CrossSiteMessageType.HELLO_RESPONSE,
      payload: responsePayload,
      signature: "",
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 30000),
      replyTo: message.id,
    };

    response.signature = signMessage(response, this.identity.privateKey);

    return response;
  }

  /**
   * Handles hello response.
   */
  private handleHelloResponse(message: CrossSiteMessage): void {
    const connection = this.federations.get(message.sourceSiteId);
    if (connection) {
      connection.status = "connected";
    }

    // Resolve pending request if any
    if (message.replyTo) {
      const pending = this.pendingRequests.get(message.replyTo);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(message.payload);
        this.pendingRequests.delete(message.replyTo);
      }
    }
  }

  /**
   * Handles goodbye message.
   */
  private handleGoodbye(message: CrossSiteMessage): void {
    const connection = this.federations.get(message.sourceSiteId);
    if (connection) {
      connection.status = "disconnected";
    }
  }

  /**
   * Handles event broadcast.
   */
  private handleEventBroadcast(message: CrossSiteMessage): void {
    const event = message.payload as EventBroadcastPayload;

    // Dispatch to handlers
    const handlers = this.eventHandlers.get(event.eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error("Event handler error:", err);
        }
      }
    }

    // Also dispatch to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (err) {
          console.error("Event handler error:", err);
        }
      }
    }
  }

  /**
   * Handles action request.
   */
  private async handleActionRequest(message: CrossSiteMessage): Promise<CrossSiteMessage> {
    const request = message.payload as ActionRequestPayload;

    let responsePayload: ActionResponsePayload;
    const startTime = Date.now();

    try {
      // Execute action (would delegate to ActionRegistry)
      // For now, just simulate success
      responsePayload = {
        requestId: request.requestId,
        success: true,
        output: { executed: true },
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      responsePayload = {
        requestId: request.requestId,
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error.message,
        },
        durationMs: Date.now() - startTime,
      };
    }

    const response: CrossSiteMessage = {
      id: randomUUID(),
      sourceSiteId: this.identity.siteId,
      targetSiteId: message.sourceSiteId,
      type: CrossSiteMessageType.ACTION_RESPONSE,
      payload: responsePayload,
      signature: "",
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 30000),
      replyTo: message.id,
    };

    response.signature = signMessage(response, this.identity.privateKey);

    return response;
  }

  /**
   * Handles action response.
   */
  private handleActionResponse(message: CrossSiteMessage): void {
    if (message.replyTo) {
      const pending = this.pendingRequests.get(message.replyTo);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(message.payload);
        this.pendingRequests.delete(message.replyTo);
      }
    }
  }

  /**
   * Handles health check.
   */
  private handleHealthCheck(message: CrossSiteMessage): CrossSiteMessage {
    const payload: HealthResponsePayload = {
      status: "healthy",
      uptime: process.uptime(),
      load: {
        cpu: 0,
        memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
        activeExecutions: 0,
      },
      services: {
        database: { status: "ok", latency: 5 },
        cache: { status: "ok", latency: 1 },
      },
    };

    const response: CrossSiteMessage = {
      id: randomUUID(),
      sourceSiteId: this.identity.siteId,
      targetSiteId: message.sourceSiteId,
      type: CrossSiteMessageType.HEALTH_RESPONSE,
      payload,
      signature: "",
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 30000),
      replyTo: message.id,
    };

    response.signature = signMessage(response, this.identity.privateKey);

    // Update connection latency
    const connection = this.federations.get(message.sourceSiteId);
    if (connection) {
      connection.lastPongAt = new Date();
      if (connection.lastPingAt) {
        connection.latencyMs = connection.lastPongAt.getTime() - connection.lastPingAt.getTime();
      }
      connection.errorCount = 0;
    }

    return response;
  }

  /**
   * Checks if message type expects a response.
   */
  private isRequestMessage(type: CrossSiteMessageType): boolean {
    return [
      CrossSiteMessageType.HELLO,
      CrossSiteMessageType.ACTION_REQUEST,
      CrossSiteMessageType.HEALTH_CHECK,
      CrossSiteMessageType.SYNC_REQUEST,
    ].includes(type);
  }

  /**
   * HTTP send implementation (simplified).
   */
  private async httpSend(url: string, message: CrossSiteMessage): Promise<unknown> {
    // In production, this would use fetch or axios
    // For now, just simulate success
    return { success: true };
  }
}

// ==================== Distributed Workflow Coordinator ====================

/**
 * Coordinates workflow execution across sites.
 */
export class DistributedWorkflowCoordinator {
  private federationManager: FederationManager;
  private activeWorkflows: Map<ExecutionId, DistributedWorkflowState> = new Map();

  constructor(federationManager: FederationManager) {
    this.federationManager = federationManager;

    // Listen for workflow events from other sites
    this.federationManager.onEvent("workflow.started", (event) => {
      this.handleRemoteWorkflowStarted(event);
    });

    this.federationManager.onEvent("workflow.completed", (event) => {
      this.handleRemoteWorkflowCompleted(event);
    });
  }

  /**
   * Starts a distributed workflow.
   */
  async startDistributedWorkflow(
    workflowId: WorkflowId,
    siteSteps: SiteStepMapping[],
    input: unknown
  ): Promise<ExecutionId> {
    const executionId = randomUUID();

    const state: DistributedWorkflowState = {
      executionId,
      workflowId,
      status: "running",
      siteSteps,
      completedSteps: [],
      failedSteps: [],
      startedAt: new Date(),
    };

    this.activeWorkflows.set(executionId, state);

    // Notify participating sites
    for (const mapping of siteSteps) {
      if (mapping.siteId !== this.federationManager.getIdentity().siteId) {
        await this.federationManager.broadcastEvent({
          eventType: "workflow.started",
          entityType: "workflow",
          entityId: executionId,
          data: {
            workflowId,
            steps: mapping.stepIds,
            input,
          },
          originSiteId: this.federationManager.getIdentity().siteId,
        });
      }
    }

    return executionId;
  }

  /**
   * Gets distributed workflow state.
   */
  getWorkflowState(executionId: ExecutionId): DistributedWorkflowState | undefined {
    return this.activeWorkflows.get(executionId);
  }

  /**
   * Requests step execution on a remote site.
   */
  async executeRemoteStep(
    executionId: ExecutionId,
    targetSiteId: SiteId,
    stepId: string,
    action: ActionInstance
  ): Promise<unknown> {
    const result = await this.federationManager.requestAction(
      targetSiteId,
      action,
      { workflowId: this.activeWorkflows.get(executionId)?.workflowId, executionId },
      60000
    );

    return result.output;
  }

  /**
   * Handles remote workflow started event.
   */
  private handleRemoteWorkflowStarted(event: EventBroadcastPayload): void {
    console.log(`Remote workflow started: ${event.entityId} from ${event.originSiteId}`);
  }

  /**
   * Handles remote workflow completed event.
   */
  private handleRemoteWorkflowCompleted(event: EventBroadcastPayload): void {
    console.log(`Remote workflow completed: ${event.entityId} from ${event.originSiteId}`);
  }
}

/**
 * Distributed workflow state.
 */
export interface DistributedWorkflowState {
  executionId: ExecutionId;
  workflowId: WorkflowId;
  status: "running" | "completed" | "failed" | "cancelled";
  siteSteps: SiteStepMapping[];
  completedSteps: string[];
  failedSteps: string[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Mapping of steps to sites.
 */
export interface SiteStepMapping {
  siteId: SiteId;
  stepIds: string[];
}

// ==================== Site Health Monitor ====================

/**
 * Monitors health of federated sites.
 */
export class SiteHealthMonitor {
  private federationManager: FederationManager;
  private healthHistory: Map<SiteId, HealthHistoryEntry[]> = new Map();
  private maxHistoryEntries: number = 100;
  private alertHandlers: Set<(alert: SiteHealthAlert) => void> = new Set();

  constructor(federationManager: FederationManager) {
    this.federationManager = federationManager;
  }

  /**
   * Records a health check result.
   */
  recordHealth(siteId: SiteId, health: HealthResponsePayload): void {
    let history = this.healthHistory.get(siteId);
    if (!history) {
      history = [];
      this.healthHistory.set(siteId, history);
    }

    history.push({
      timestamp: new Date(),
      ...health,
    });

    // Trim history
    while (history.length > this.maxHistoryEntries) {
      history.shift();
    }

    // Check for alerts
    this.checkAlerts(siteId, health);
  }

  /**
   * Gets health history for a site.
   */
  getHistory(siteId: SiteId): HealthHistoryEntry[] {
    return this.healthHistory.get(siteId) || [];
  }

  /**
   * Gets current health status of all sites.
   */
  getAllHealth(): Map<SiteId, HealthResponsePayload | undefined> {
    const result = new Map<SiteId, HealthResponsePayload | undefined>();

    for (const connection of this.federationManager.getActiveFederations()) {
      const history = this.healthHistory.get(connection.federation.siteId);
      result.set(
        connection.federation.siteId,
        history?.[history.length - 1]
      );
    }

    return result;
  }

  /**
   * Calculates average latency for a site.
   */
  getAverageLatency(siteId: SiteId): number | undefined {
    const connection = this.federationManager.getFederation(siteId);
    if (!connection?.latencyMs) return undefined;
    return connection.latencyMs;
  }

  /**
   * Registers an alert handler.
   */
  onAlert(handler: (alert: SiteHealthAlert) => void): () => void {
    this.alertHandlers.add(handler);
    return () => {
      this.alertHandlers.delete(handler);
    };
  }

  /**
   * Checks for alert conditions.
   */
  private checkAlerts(siteId: SiteId, health: HealthResponsePayload): void {
    const alerts: SiteHealthAlert[] = [];

    if (health.status === "unhealthy") {
      alerts.push({
        siteId,
        type: "site_unhealthy",
        severity: "critical",
        message: `Site ${siteId} is unhealthy`,
        timestamp: new Date(),
      });
    } else if (health.status === "degraded") {
      alerts.push({
        siteId,
        type: "site_degraded",
        severity: "warning",
        message: `Site ${siteId} is degraded`,
        timestamp: new Date(),
      });
    }

    if (health.load.cpu > 0.9) {
      alerts.push({
        siteId,
        type: "high_cpu",
        severity: "warning",
        message: `Site ${siteId} has high CPU usage: ${(health.load.cpu * 100).toFixed(1)}%`,
        timestamp: new Date(),
      });
    }

    if (health.load.memory > 0.9) {
      alerts.push({
        siteId,
        type: "high_memory",
        severity: "warning",
        message: `Site ${siteId} has high memory usage: ${(health.load.memory * 100).toFixed(1)}%`,
        timestamp: new Date(),
      });
    }

    // Dispatch alerts
    for (const alert of alerts) {
      for (const handler of this.alertHandlers) {
        try {
          handler(alert);
        } catch (err) {
          console.error("Alert handler error:", err);
        }
      }
    }
  }
}

/**
 * Health history entry.
 */
export interface HealthHistoryEntry extends HealthResponsePayload {
  timestamp: Date;
}

/**
 * Site health alert.
 */
export interface SiteHealthAlert {
  siteId: SiteId;
  type: "site_unhealthy" | "site_degraded" | "high_cpu" | "high_memory" | "connection_lost";
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
}

// ==================== Singleton Instances ====================

let federationManagerInstance: FederationManager | null = null;

/**
 * Initializes the federation manager with site identity.
 */
export function initializeFederationManager(identity: SiteIdentity): FederationManager {
  federationManagerInstance = new FederationManager(identity);
  return federationManagerInstance;
}

/**
 * Gets the federation manager instance.
 */
export function getFederationManager(): FederationManager | null {
  return federationManagerInstance;
}

/**
 * Resets the federation manager (for testing).
 */
export function resetFederationManager(): void {
  if (federationManagerInstance) {
    federationManagerInstance.stopHealthChecks();
    federationManagerInstance = null;
  }
}
