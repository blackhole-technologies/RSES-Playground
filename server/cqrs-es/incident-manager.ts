/**
 * @file incident-manager.ts
 * @description Incident management with lifecycle, escalation, and resolution
 * @phase Phase 4 - Intelligence Layer
 *
 * Features:
 * - Incident creation from AIOps alerts
 * - Severity levels P1-P4
 * - Escalation policies with timeouts
 * - Resolution workflow with postmortem
 * - Integration with AlertManager
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { createModuleLogger } from "../logger";
import { getAlertManager, type Alert, AlertSeverity } from "./observability";

const log = createModuleLogger("incident-manager");

// =============================================================================
// TYPES
// =============================================================================

export type IncidentSeverity = "P1" | "P2" | "P3" | "P4";
export type IncidentStatus = "triggered" | "acknowledged" | "investigating" | "identified" | "monitoring" | "resolved";

/**
 * Timeline entry for incident history
 */
export interface TimelineEntry {
  id: string;
  timestamp: Date;
  type: "created" | "status_change" | "responder_added" | "note" | "escalated" | "resolved";
  message: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Escalation policy definition
 */
export interface EscalationPolicy {
  id: string;
  name: string;
  levels: EscalationLevel[];
}

/**
 * Single escalation level
 */
export interface EscalationLevel {
  level: number;
  delayMinutes: number;
  targets: EscalationTarget[];
}

/**
 * Escalation target (who to notify)
 */
export interface EscalationTarget {
  type: "user" | "team" | "schedule";
  id: string;
  name: string;
}

/**
 * Responder assigned to an incident
 */
export interface Responder {
  id: string;
  name: string;
  email?: string;
  role: "primary" | "secondary" | "observer";
  assignedAt: Date;
  acknowledgedAt?: Date;
}

/**
 * Postmortem document
 */
export interface Postmortem {
  incidentId: string;
  createdAt: Date;
  updatedAt: Date;
  summary: string;
  impact: string;
  rootCause: string;
  timeline: string;
  lessonsLearned: string[];
  actionItems: PostmortemAction[];
  status: "draft" | "review" | "published";
}

/**
 * Action item from postmortem
 */
export interface PostmortemAction {
  id: string;
  description: string;
  owner?: string;
  dueDate?: Date;
  status: "open" | "in_progress" | "completed";
}

/**
 * Incident record
 */
export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  service: string;
  alertIds: string[];
  timeline: TimelineEntry[];
  responders: Responder[];
  escalationPolicyId?: string;
  currentEscalationLevel: number;
  tags: string[];
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  impactStartedAt: Date;
  impactEndedAt?: Date;
  ttd?: number; // Time to detect (ms)
  tta?: number; // Time to acknowledge (ms)
  ttr?: number; // Time to resolve (ms)
  postmortem?: Postmortem;
  metadata: Record<string, unknown>;
}

/**
 * Incident creation options
 */
export interface CreateIncidentOptions {
  title: string;
  description?: string;
  severity: IncidentSeverity;
  service: string;
  alertIds?: string[];
  escalationPolicyId?: string;
  impactStartedAt?: Date;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Incident update options
 */
export interface UpdateIncidentOptions {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Incident query options
 */
export interface IncidentQueryOptions {
  status?: IncidentStatus[];
  severity?: IncidentSeverity[];
  service?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// INCIDENT MANAGER
// =============================================================================

/**
 * Manages incident lifecycle from creation to resolution
 */
export class IncidentManager {
  private incidents: Map<string, Incident> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();
  private emitter: EventEmitter = new EventEmitter();
  private alertSubscription?: () => void;

  constructor() {
    this.setupDefaultPolicies();
  }

  /**
   * Initialize and connect to AlertManager
   */
  initialize(): void {
    const alertManager = getAlertManager();

    // Subscribe to alerts
    this.alertSubscription = alertManager.onAlert((alert) => {
      this.handleAlert(alert);
    });

    log.info("Incident manager initialized");
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.alertSubscription) {
      this.alertSubscription();
    }

    // Clear all escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    log.info("Incident manager shut down");
  }

  // ===========================================================================
  // INCIDENT CRUD
  // ===========================================================================

  /**
   * Create a new incident
   */
  createIncident(options: CreateIncidentOptions): Incident {
    const now = new Date();
    const id = `INC-${Date.now().toString(36).toUpperCase()}`;

    const incident: Incident = {
      id,
      title: options.title,
      description: options.description || "",
      severity: options.severity,
      status: "triggered",
      service: options.service,
      alertIds: options.alertIds || [],
      timeline: [],
      responders: [],
      escalationPolicyId: options.escalationPolicyId,
      currentEscalationLevel: 0,
      tags: options.tags || [],
      createdAt: now,
      impactStartedAt: options.impactStartedAt || now,
      metadata: options.metadata || {},
    };

    // Add creation event to timeline
    incident.timeline.push({
      id: randomUUID(),
      timestamp: now,
      type: "created",
      message: `Incident created: ${options.title}`,
    });

    this.incidents.set(id, incident);

    // Start escalation if policy is set
    if (options.escalationPolicyId) {
      this.startEscalation(incident);
    }

    this.emit("incident:created", incident);
    log.info({ incidentId: id, severity: options.severity }, "Incident created");

    return incident;
  }

  /**
   * Get incident by ID
   */
  getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  /**
   * Query incidents
   */
  queryIncidents(options: IncidentQueryOptions = {}): { incidents: Incident[]; total: number } {
    let results = Array.from(this.incidents.values());

    // Filter by status
    if (options.status?.length) {
      results = results.filter((i) => options.status!.includes(i.status));
    }

    // Filter by severity
    if (options.severity?.length) {
      results = results.filter((i) => options.severity!.includes(i.severity));
    }

    // Filter by service
    if (options.service) {
      results = results.filter((i) => i.service === options.service);
    }

    // Filter by date range
    if (options.startDate) {
      results = results.filter((i) => i.createdAt >= options.startDate!);
    }
    if (options.endDate) {
      results = results.filter((i) => i.createdAt <= options.endDate!);
    }

    // Sort by creation date desc
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = results.length;

    // Apply pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return { incidents: results, total };
  }

  /**
   * Update incident
   */
  updateIncident(id: string, updates: UpdateIncidentOptions, actor?: string): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;

    const now = new Date();

    // Track status changes
    if (updates.status && updates.status !== incident.status) {
      incident.timeline.push({
        id: randomUUID(),
        timestamp: now,
        type: "status_change",
        message: `Status changed from ${incident.status} to ${updates.status}`,
        actor,
      });

      incident.status = updates.status;

      // Handle resolution
      if (updates.status === "resolved") {
        incident.resolvedAt = now;
        incident.impactEndedAt = now;
        incident.ttr = now.getTime() - incident.impactStartedAt.getTime();
        this.stopEscalation(id);
      }
    }

    // Apply other updates
    if (updates.title) incident.title = updates.title;
    if (updates.description) incident.description = updates.description;
    if (updates.severity) incident.severity = updates.severity;
    if (updates.tags) incident.tags = updates.tags;
    if (updates.metadata) incident.metadata = { ...incident.metadata, ...updates.metadata };

    this.emit("incident:updated", incident);
    return incident;
  }

  // ===========================================================================
  // INCIDENT ACTIONS
  // ===========================================================================

  /**
   * Acknowledge an incident
   */
  acknowledge(id: string, responderId: string, responderName: string): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;

    if (incident.status !== "triggered") {
      return incident; // Already acknowledged
    }

    const now = new Date();

    incident.status = "acknowledged";
    incident.acknowledgedAt = now;
    incident.tta = now.getTime() - incident.createdAt.getTime();

    // Add/update responder
    let responder = incident.responders.find((r) => r.id === responderId);
    if (!responder) {
      responder = {
        id: responderId,
        name: responderName,
        role: "primary",
        assignedAt: now,
        acknowledgedAt: now,
      };
      incident.responders.push(responder);
    } else {
      responder.acknowledgedAt = now;
    }

    incident.timeline.push({
      id: randomUUID(),
      timestamp: now,
      type: "status_change",
      message: `Acknowledged by ${responderName}`,
      actor: responderId,
    });

    // Stop escalation timer
    this.stopEscalation(id);

    this.emit("incident:acknowledged", incident);
    log.info({ incidentId: id, responderId }, "Incident acknowledged");

    return incident;
  }

  /**
   * Add a responder to an incident
   */
  addResponder(id: string, responder: Omit<Responder, "assignedAt">): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;

    const now = new Date();

    incident.responders.push({
      ...responder,
      assignedAt: now,
    });

    incident.timeline.push({
      id: randomUUID(),
      timestamp: now,
      type: "responder_added",
      message: `${responder.name} added as ${responder.role} responder`,
    });

    this.emit("incident:responder_added", incident, responder);
    return incident;
  }

  /**
   * Add a note to an incident
   */
  addNote(id: string, message: string, actor?: string): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;

    incident.timeline.push({
      id: randomUUID(),
      timestamp: new Date(),
      type: "note",
      message,
      actor,
    });

    this.emit("incident:note_added", incident, message);
    return incident;
  }

  /**
   * Resolve an incident
   */
  resolve(id: string, actor?: string, resolution?: string): Incident | null {
    const incident = this.incidents.get(id);
    if (!incident) return null;

    if (incident.status === "resolved") {
      return incident;
    }

    const now = new Date();

    incident.status = "resolved";
    incident.resolvedAt = now;
    incident.impactEndedAt = now;
    incident.ttr = now.getTime() - incident.impactStartedAt.getTime();

    incident.timeline.push({
      id: randomUUID(),
      timestamp: now,
      type: "resolved",
      message: resolution || "Incident resolved",
      actor,
    });

    this.stopEscalation(id);

    this.emit("incident:resolved", incident);
    log.info({
      incidentId: id,
      ttr: incident.ttr,
      tta: incident.tta,
    }, "Incident resolved");

    return incident;
  }

  // ===========================================================================
  // ESCALATION
  // ===========================================================================

  /**
   * Register an escalation policy
   */
  registerEscalationPolicy(policy: EscalationPolicy): void {
    this.escalationPolicies.set(policy.id, policy);
    log.debug({ policyId: policy.id }, "Escalation policy registered");
  }

  /**
   * Start escalation for an incident
   */
  private startEscalation(incident: Incident): void {
    if (!incident.escalationPolicyId) return;

    const policy = this.escalationPolicies.get(incident.escalationPolicyId);
    if (!policy) return;

    this.scheduleNextEscalation(incident, policy);
  }

  /**
   * Schedule the next escalation level
   */
  private scheduleNextEscalation(incident: Incident, policy: EscalationPolicy): void {
    const nextLevel = incident.currentEscalationLevel;

    if (nextLevel >= policy.levels.length) {
      log.warn({ incidentId: incident.id }, "All escalation levels exhausted");
      return;
    }

    const level = policy.levels[nextLevel];
    const delayMs = level.delayMinutes * 60 * 1000;

    const timer = setTimeout(() => {
      this.executeEscalation(incident.id, level);
    }, delayMs);

    this.escalationTimers.set(incident.id, timer);
    log.debug({ incidentId: incident.id, level: nextLevel, delayMinutes: level.delayMinutes }, "Escalation scheduled");
  }

  /**
   * Execute an escalation
   */
  private executeEscalation(incidentId: string, level: EscalationLevel): void {
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.status !== "triggered") return;

    incident.currentEscalationLevel = level.level + 1;

    incident.timeline.push({
      id: randomUUID(),
      timestamp: new Date(),
      type: "escalated",
      message: `Escalated to level ${level.level + 1}: ${level.targets.map((t) => t.name).join(", ")}`,
    });

    this.emit("incident:escalated", incident, level);
    log.info({ incidentId, level: level.level + 1 }, "Incident escalated");

    // Schedule next level if available
    const policy = this.escalationPolicies.get(incident.escalationPolicyId!);
    if (policy) {
      this.scheduleNextEscalation(incident, policy);
    }
  }

  /**
   * Stop escalation for an incident
   */
  private stopEscalation(incidentId: string): void {
    const timer = this.escalationTimers.get(incidentId);
    if (timer) {
      clearTimeout(timer);
      this.escalationTimers.delete(incidentId);
    }
  }

  // ===========================================================================
  // POSTMORTEM
  // ===========================================================================

  /**
   * Create a postmortem for an incident
   */
  createPostmortem(incidentId: string): Postmortem | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;

    const now = new Date();

    const postmortem: Postmortem = {
      incidentId,
      createdAt: now,
      updatedAt: now,
      summary: `Postmortem for ${incident.title}`,
      impact: "",
      rootCause: "",
      timeline: "",
      lessonsLearned: [],
      actionItems: [],
      status: "draft",
    };

    incident.postmortem = postmortem;

    this.emit("postmortem:created", postmortem);
    return postmortem;
  }

  /**
   * Update a postmortem
   */
  updatePostmortem(incidentId: string, updates: Partial<Postmortem>): Postmortem | null {
    const incident = this.incidents.get(incidentId);
    if (!incident?.postmortem) return null;

    Object.assign(incident.postmortem, updates, { updatedAt: new Date() });

    this.emit("postmortem:updated", incident.postmortem);
    return incident.postmortem;
  }

  // ===========================================================================
  // ALERT HANDLING
  // ===========================================================================

  /**
   * Handle incoming alert from AlertManager
   */
  private handleAlert(alert: Alert): void {
    // Map alert severity to incident severity. ERROR maps to P2 (same as
    // WARNING) — escalate to P1 only on the explicit CRITICAL severity.
    const severityMap: Record<AlertSeverity, IncidentSeverity> = {
      [AlertSeverity.CRITICAL]: "P1",
      [AlertSeverity.ERROR]: "P2",
      [AlertSeverity.WARNING]: "P3",
      [AlertSeverity.INFO]: "P4",
    };

    // Check if there's already an open incident for this alert
    const existingIncident = Array.from(this.incidents.values()).find(
      (i) => i.alertIds.includes(alert.name) && i.status !== "resolved"
    );

    if (existingIncident) {
      // Add note about additional alert
      this.addNote(existingIncident.id, `Additional alert: ${alert.description}`);
      return;
    }

    // Create new incident for critical/warning alerts
    if (alert.severity === AlertSeverity.CRITICAL || alert.severity === AlertSeverity.WARNING) {
      this.createIncident({
        title: alert.description || alert.name,
        description: `Automatically created from alert: ${alert.name}`,
        severity: severityMap[alert.severity],
        service: "unknown",
        alertIds: [alert.name],
        tags: ["auto-created"],
      });
    }
  }

  // ===========================================================================
  // METRICS
  // ===========================================================================

  /**
   * Get incident metrics
   */
  getMetrics(): {
    open: number;
    acknowledged: number;
    resolved: number;
    bySeverity: Record<IncidentSeverity, number>;
    avgTTD: number;
    avgTTA: number;
    avgTTR: number;
  } {
    const incidents = Array.from(this.incidents.values());
    const resolved = incidents.filter((i) => i.status === "resolved");

    return {
      open: incidents.filter((i) => i.status === "triggered").length,
      acknowledged: incidents.filter((i) => i.status === "acknowledged" || i.status === "investigating").length,
      resolved: resolved.length,
      bySeverity: {
        P1: incidents.filter((i) => i.severity === "P1").length,
        P2: incidents.filter((i) => i.severity === "P2").length,
        P3: incidents.filter((i) => i.severity === "P3").length,
        P4: incidents.filter((i) => i.severity === "P4").length,
      },
      avgTTD: 0, // Would calculate from detection timestamps
      avgTTA: resolved.length > 0
        ? resolved.reduce((sum, i) => sum + (i.tta || 0), 0) / resolved.length
        : 0,
      avgTTR: resolved.length > 0
        ? resolved.reduce((sum, i) => sum + (i.ttr || 0), 0) / resolved.length
        : 0,
    };
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  /**
   * Subscribe to incident events
   */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.emitter.on(event, handler);
  }

  /**
   * Unsubscribe from incident events
   */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.emitter.off(event, handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.emitter.emit(event, ...args);
  }

  // ===========================================================================
  // DEFAULT POLICIES
  // ===========================================================================

  private setupDefaultPolicies(): void {
    // Default P1 policy - aggressive escalation
    this.registerEscalationPolicy({
      id: "default-p1",
      name: "P1 Critical",
      levels: [
        { level: 0, delayMinutes: 5, targets: [{ type: "team", id: "oncall", name: "On-Call Team" }] },
        { level: 1, delayMinutes: 10, targets: [{ type: "team", id: "leads", name: "Tech Leads" }] },
        { level: 2, delayMinutes: 15, targets: [{ type: "team", id: "management", name: "Management" }] },
      ],
    });

    // Default P2 policy
    this.registerEscalationPolicy({
      id: "default-p2",
      name: "P2 High",
      levels: [
        { level: 0, delayMinutes: 15, targets: [{ type: "team", id: "oncall", name: "On-Call Team" }] },
        { level: 1, delayMinutes: 30, targets: [{ type: "team", id: "leads", name: "Tech Leads" }] },
      ],
    });

    // Default P3/P4 policy - minimal escalation
    this.registerEscalationPolicy({
      id: "default-p3-p4",
      name: "P3/P4 Low",
      levels: [
        { level: 0, delayMinutes: 60, targets: [{ type: "team", id: "oncall", name: "On-Call Team" }] },
      ],
    });
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let incidentManagerInstance: IncidentManager | null = null;

/**
 * Get or create incident manager instance
 */
export function getIncidentManager(): IncidentManager {
  if (!incidentManagerInstance) {
    incidentManagerInstance = new IncidentManager();
  }
  return incidentManagerInstance;
}

/**
 * Initialize incident manager
 */
export function initializeIncidentManager(): IncidentManager {
  const manager = getIncidentManager();
  manager.initialize();
  return manager;
}

/**
 * Reset incident manager (for testing)
 */
export function resetIncidentManager(): void {
  if (incidentManagerInstance) {
    incidentManagerInstance.shutdown();
    incidentManagerInstance = null;
  }
}
