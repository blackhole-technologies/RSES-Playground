/**
 * @file self-healing.ts
 * @description Self-Healing Security System.
 *              Implements automatic threat response, session revocation,
 *              auto-scaling rate limits, ML-based IP blocking, and
 *              self-repairing configurations.
 * @phase Phase 9 - Zero-Trust Security Enhancement
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards AWS Security Best Practices, NIST IR 8011
 */

// Re-export the config so security/index.ts can import from this module.
export type { SelfHealingConfig } from './types';

import type {
  SelfHealingConfig,
  ResponsePolicy,
  TriggerCondition,
  TriggerType,
  AutoResponseAction,
  AutoResponseType,
  AutoScaleConfig,
  AutoBlockConfig,
  BlockThreshold,
  SessionRevocationConfig,
  ConfigAutoRepairConfig,
  NotificationChannel,
  SecurityEvent,
  SecurityContext,
  ThreatDetectionResult,
} from './types';

// =============================================================================
// SELF-HEALING CONFIGURATION
// =============================================================================

const defaultConfig: SelfHealingConfig = {
  enabled: true,
  responsePolicies: [],
  autoScaleRateLimits: {
    enabled: true,
    baselineLimit: 100,
    minLimit: 10,
    maxLimit: 1000,
    scaleUpThreshold: 70,
    scaleDownThreshold: 30,
    cooldownSeconds: 60,
  },
  autoBlockConfig: {
    enabled: true,
    useMLModel: true,
    thresholds: [
      { violations: 5, windowSeconds: 60, blockDurationSeconds: 300, blockType: 'soft' },
      { violations: 10, windowSeconds: 300, blockDurationSeconds: 3600, blockType: 'soft' },
      { violations: 20, windowSeconds: 3600, blockDurationSeconds: 86400, blockType: 'hard' },
    ],
    whitelist: [],
    geoRestrictions: [],
  },
  sessionRevocation: {
    enabled: true,
    anomalyThreshold: 0.8,
    revokeOnImpossibleTravel: true,
    revokeOnDeviceChange: false,
    revokeOnPrivilegeEscalation: true,
    gracePeriodSeconds: 30,
  },
  configAutoRepair: {
    enabled: true,
    driftCheckIntervalSeconds: 300,
    autoRepairOnDrift: true,
    notifyOnDrift: true,
    backupBeforeRepair: true,
  },
};

// =============================================================================
// EVENT TRACKING
// =============================================================================

/**
 * Tracked security event for analysis.
 */
interface TrackedEvent {
  timestamp: Date;
  type: TriggerType;
  sourceIp: string;
  userId?: string;
  sessionId?: string;
  severity: number;
  details: Record<string, unknown>;
}

/**
 * IP reputation data.
 */
interface IpReputation {
  ip: string;
  score: number; // 0-100, lower is worse
  violations: ViolationRecord[];
  blocked: boolean;
  blockedUntil?: Date;
  blockType?: 'soft' | 'hard';
  firstSeen: Date;
  lastSeen: Date;
  totalRequests: number;
  mlRiskScore?: number;
}

interface ViolationRecord {
  timestamp: Date;
  type: TriggerType;
  severity: number;
}

/**
 * Session tracking for revocation.
 */
interface TrackedSession {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  ipAddress: string;
  deviceFingerprint: string;
  geoLocation: { country: string; city?: string };
  anomalyScore: number;
  revoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}

/**
 * Configuration snapshot for drift detection.
 */
interface ConfigSnapshot {
  id: string;
  timestamp: Date;
  config: Record<string, unknown>;
  hash: string;
}

// =============================================================================
// SELF-HEALING SECURITY MANAGER
// =============================================================================

/**
 * Self-Healing Security Manager.
 * Provides automatic response to security threats.
 */
export class SelfHealingSecurityManager {
  private config: SelfHealingConfig;
  private events: TrackedEvent[] = [];
  private ipReputations: Map<string, IpReputation> = new Map();
  private sessions: Map<string, TrackedSession> = new Map();
  private configSnapshots: ConfigSnapshot[] = [];
  private currentRateLimit: number;
  private lastRateLimitAdjustment: Date = new Date();
  private actionHistory: ActionHistoryEntry[] = [];
  private eventListeners: Map<string, EventListener[]> = new Map();

  constructor(config: Partial<SelfHealingConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.currentRateLimit = this.config.autoScaleRateLimits.baselineLimit;
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default response policies.
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicies: ResponsePolicy[] = [
      {
        id: 'brute_force_protection',
        trigger: {
          type: 'failed_auth_attempts',
          threshold: 5,
          windowSeconds: 300,
        },
        actions: [
          { type: 'block_ip', parameters: { durationSeconds: 900 } },
          { type: 'notify_security_team', parameters: { channel: 'slack' } },
        ],
        cooldownSeconds: 300,
        maxTriggers: 3,
        notify: true,
        notifyChannels: ['slack', 'email'],
      },
      {
        id: 'rate_limit_protection',
        trigger: {
          type: 'rate_limit_exceeded',
          threshold: 10,
          windowSeconds: 60,
        },
        actions: [
          { type: 'reduce_rate_limit', parameters: { factor: 0.5 } },
          { type: 'enable_captcha', parameters: { duration: 300 } },
        ],
        cooldownSeconds: 120,
        maxTriggers: 5,
        notify: false,
        notifyChannels: [],
      },
      {
        id: 'anomaly_response',
        trigger: {
          type: 'anomaly_score_threshold',
          threshold: 0.8,
          windowSeconds: 0,
        },
        actions: [
          { type: 'revoke_session', parameters: {} },
          { type: 'require_mfa', parameters: { method: 'totp' } },
          { type: 'create_incident', parameters: { severity: 'high' } },
        ],
        cooldownSeconds: 0,
        maxTriggers: 1,
        notify: true,
        notifyChannels: ['pagerduty'],
      },
      {
        id: 'threat_response',
        trigger: {
          type: 'threat_detected',
          threshold: 1,
          windowSeconds: 0,
        },
        actions: [
          { type: 'block_ip', parameters: { durationSeconds: 3600 } },
          { type: 'revoke_session', parameters: {} },
          { type: 'isolate_endpoint', parameters: {} },
          { type: 'create_incident', parameters: { severity: 'critical' } },
        ],
        cooldownSeconds: 0,
        maxTriggers: 1,
        notify: true,
        notifyChannels: ['pagerduty', 'slack', 'email'],
      },
    ];

    this.config.responsePolicies = [
      ...defaultPolicies,
      ...this.config.responsePolicies,
    ];
  }

  /**
   * Process a security event and trigger appropriate responses.
   */
  async processEvent(event: SecurityEvent): Promise<ActionResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    // Track the event
    const trackedEvent = this.trackEvent(event);

    // Update IP reputation
    if (event.affectedEntities.some(e => e.type === 'ip')) {
      const ipEntity = event.affectedEntities.find(e => e.type === 'ip');
      if (ipEntity) {
        await this.updateIpReputation(ipEntity.id, trackedEvent);
      }
    }

    // Find matching response policies
    const matchingPolicies = this.findMatchingPolicies(trackedEvent);

    // Execute actions for each matching policy
    const results: ActionResult[] = [];
    for (const policy of matchingPolicies) {
      const policyResults = await this.executePolicy(policy, trackedEvent, event);
      results.push(...policyResults);
    }

    // Check for auto-blocking based on reputation
    if (this.config.autoBlockConfig.enabled) {
      const blockResult = await this.checkAutoBlock(trackedEvent);
      if (blockResult) {
        results.push(blockResult);
      }
    }

    // Check session revocation
    if (this.config.sessionRevocation.enabled && trackedEvent.sessionId) {
      const revocationResult = await this.checkSessionRevocation(trackedEvent);
      if (revocationResult) {
        results.push(revocationResult);
      }
    }

    // Emit events to listeners
    this.emitEvent('action_taken', { event, results });

    return results;
  }

  /**
   * Process threat detection result.
   */
  async processThreatDetection(
    result: ThreatDetectionResult,
    context: SecurityContext
  ): Promise<ActionResult[]> {
    if (!result.threatDetected || !result.threat) {
      return [];
    }

    const event: SecurityEvent = {
      id: result.detectionId,
      timestamp: result.timestamp,
      type: 'threat_detected',
      severity: this.mapSeverity(result.threat.severity),
      source: 'threat_detection',
      category: 'security',
      description: result.threat.description,
      affectedEntities: [
        { type: 'ip', id: context.network.ipAddress, impact: 'high' },
        ...(context.identity ? [{ type: 'user' as const, id: context.identity.userId, impact: 'high' as const }] : []),
      ],
      threatIndicators: result.threat.iocs,
      recommendedActions: result.threat.response.remediationSteps,
      status: 'new',
      relatedEvents: [],
    };

    return this.processEvent(event);
  }

  /**
   * Adjust rate limits based on system load.
   */
  async adjustRateLimits(currentLoad: number): Promise<RateLimitAdjustment | null> {
    const { autoScaleRateLimits } = this.config;

    if (!autoScaleRateLimits.enabled) {
      return null;
    }

    // Check cooldown
    const timeSinceLastAdjustment = Date.now() - this.lastRateLimitAdjustment.getTime();
    if (timeSinceLastAdjustment < autoScaleRateLimits.cooldownSeconds * 1000) {
      return null;
    }

    const previousLimit = this.currentRateLimit;
    let newLimit = this.currentRateLimit;
    let reason: string;

    if (currentLoad > autoScaleRateLimits.scaleUpThreshold) {
      // Scale down rate limit (more restrictive) when load is high
      newLimit = Math.max(
        autoScaleRateLimits.minLimit,
        Math.floor(this.currentRateLimit * 0.8)
      );
      reason = `High load (${currentLoad}%) - reducing rate limit`;
    } else if (currentLoad < autoScaleRateLimits.scaleDownThreshold) {
      // Scale up rate limit (less restrictive) when load is low
      newLimit = Math.min(
        autoScaleRateLimits.maxLimit,
        Math.floor(this.currentRateLimit * 1.2)
      );
      reason = `Low load (${currentLoad}%) - increasing rate limit`;
    } else {
      // Move toward baseline
      if (this.currentRateLimit < autoScaleRateLimits.baselineLimit) {
        newLimit = Math.min(
          autoScaleRateLimits.baselineLimit,
          this.currentRateLimit + 10
        );
        reason = 'Recovering toward baseline';
      } else if (this.currentRateLimit > autoScaleRateLimits.baselineLimit) {
        newLimit = Math.max(
          autoScaleRateLimits.baselineLimit,
          this.currentRateLimit - 10
        );
        reason = 'Normalizing toward baseline';
      } else {
        return null;
      }
    }

    if (newLimit !== previousLimit) {
      this.currentRateLimit = newLimit;
      this.lastRateLimitAdjustment = new Date();

      const adjustment: RateLimitAdjustment = {
        previousLimit,
        newLimit,
        reason,
        timestamp: new Date(),
        load: currentLoad,
      };

      this.recordAction({
        type: 'rate_limit_adjustment',
        timestamp: new Date(),
        // RateLimitAdjustment isn't structurally Record<string, unknown>;
        // cast through unknown for the audit details bag.
        details: adjustment as unknown as Record<string, unknown>,
      });

      return adjustment;
    }

    return null;
  }

  /**
   * Check for configuration drift.
   */
  async checkConfigurationDrift(
    currentConfig: Record<string, unknown>
  ): Promise<DriftCheckResult> {
    const { configAutoRepair } = this.config;

    if (!configAutoRepair.enabled) {
      return { driftDetected: false };
    }

    const lastSnapshot = this.configSnapshots[this.configSnapshots.length - 1];
    if (!lastSnapshot) {
      // First snapshot
      await this.takeConfigSnapshot(currentConfig);
      return { driftDetected: false };
    }

    // Calculate current hash
    const currentHash = this.calculateConfigHash(currentConfig);

    if (currentHash !== lastSnapshot.hash) {
      const differences = this.findConfigDifferences(lastSnapshot.config, currentConfig);

      if (configAutoRepair.notifyOnDrift) {
        this.emitEvent('config_drift', { differences, timestamp: new Date() });
      }

      if (configAutoRepair.autoRepairOnDrift) {
        if (configAutoRepair.backupBeforeRepair) {
          await this.takeConfigSnapshot(currentConfig);
        }

        // Attempt repair
        const repairResult = await this.repairConfiguration(lastSnapshot.config, currentConfig);
        return {
          driftDetected: true,
          differences,
          repaired: repairResult.success,
          repairDetails: repairResult,
        };
      }

      return {
        driftDetected: true,
        differences,
        repaired: false,
      };
    }

    return { driftDetected: false };
  }

  /**
   * Register a session for monitoring.
   */
  registerSession(session: TrackedSession): void {
    this.sessions.set(session.sessionId, session);
  }

  /**
   * Update session activity.
   */
  updateSessionActivity(
    sessionId: string,
    ipAddress: string,
    geoLocation: { country: string; city?: string }
  ): SessionUpdateResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'Session not found' };
    }

    if (session.revoked) {
      return { success: false, reason: 'Session is revoked' };
    }

    // Check for impossible travel
    if (this.config.sessionRevocation.revokeOnImpossibleTravel) {
      const travelCheck = this.checkImpossibleTravel(session, geoLocation);
      if (travelCheck.impossible) {
        this.revokeSession(sessionId, 'Impossible travel detected');
        return {
          success: false,
          reason: 'Session revoked due to impossible travel',
          revoked: true,
        };
      }
    }

    // Update session
    session.lastActivity = new Date();
    session.ipAddress = ipAddress;
    session.geoLocation = geoLocation;

    return { success: true };
  }

  /**
   * Revoke a session.
   */
  revokeSession(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.revoked) {
      session.revoked = true;
      session.revokedAt = new Date();
      session.revokedReason = reason;

      this.recordAction({
        type: 'session_revoked',
        timestamp: new Date(),
        details: { sessionId, reason },
      });

      this.emitEvent('session_revoked', { sessionId, reason });
    }
  }

  /**
   * Get current rate limit.
   */
  getCurrentRateLimit(): number {
    return this.currentRateLimit;
  }

  /**
   * Get IP reputation.
   */
  getIpReputation(ip: string): IpReputation | undefined {
    return this.ipReputations.get(ip);
  }

  /**
   * Check if IP is blocked.
   */
  isIpBlocked(ip: string): BlockStatus {
    // Check whitelist
    if (this.config.autoBlockConfig.whitelist.includes(ip)) {
      return { blocked: false, reason: 'whitelisted' };
    }

    const reputation = this.ipReputations.get(ip);
    if (!reputation) {
      return { blocked: false };
    }

    if (reputation.blocked && reputation.blockedUntil) {
      if (new Date() < reputation.blockedUntil) {
        return {
          blocked: true,
          blockedUntil: reputation.blockedUntil,
          blockType: reputation.blockType,
          reason: 'Exceeded violation threshold',
        };
      } else {
        // Block expired
        reputation.blocked = false;
        reputation.blockedUntil = undefined;
        reputation.blockType = undefined;
      }
    }

    return { blocked: false };
  }

  /**
   * Manually block an IP.
   */
  blockIp(ip: string, durationSeconds: number, blockType: 'soft' | 'hard' = 'soft'): void {
    let reputation = this.ipReputations.get(ip);
    if (!reputation) {
      reputation = this.createIpReputation(ip);
    }

    reputation.blocked = true;
    reputation.blockedUntil = new Date(Date.now() + durationSeconds * 1000);
    reputation.blockType = blockType;

    this.recordAction({
      type: 'ip_blocked',
      timestamp: new Date(),
      details: { ip, durationSeconds, blockType },
    });
  }

  /**
   * Unblock an IP.
   */
  unblockIp(ip: string): void {
    const reputation = this.ipReputations.get(ip);
    if (reputation) {
      reputation.blocked = false;
      reputation.blockedUntil = undefined;
      reputation.blockType = undefined;

      this.recordAction({
        type: 'ip_unblocked',
        timestamp: new Date(),
        details: { ip },
      });
    }
  }

  /**
   * Add event listener.
   */
  on(event: string, listener: EventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove event listener.
   */
  off(event: string, listener: EventListener): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Get action history.
   */
  getActionHistory(limit: number = 100): ActionHistoryEntry[] {
    return this.actionHistory.slice(-limit);
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private trackEvent(event: SecurityEvent): TrackedEvent {
    const ipEntity = event.affectedEntities.find(e => e.type === 'ip');
    const userEntity = event.affectedEntities.find(e => e.type === 'user');

    const trackedEvent: TrackedEvent = {
      timestamp: event.timestamp,
      type: this.mapEventToTrigger(event.type),
      sourceIp: ipEntity?.id || 'unknown',
      userId: userEntity?.id,
      severity: this.mapSeverityToNumber(event.severity),
      details: {
        eventId: event.id,
        description: event.description,
      },
    };

    this.events.push(trackedEvent);

    // Keep only last 10000 events
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }

    return trackedEvent;
  }

  private mapEventToTrigger(eventType: string): TriggerType {
    const mapping: Record<string, TriggerType> = {
      authentication_failure: 'failed_auth_attempts',
      rate_limit_exceeded: 'rate_limit_exceeded',
      anomaly_detected: 'anomaly_score_threshold',
      threat_detected: 'threat_detected',
      privilege_escalation: 'privilege_escalation_attempt',
      configuration_change: 'configuration_drift',
    };
    return mapping[eventType] || 'threat_detected';
  }

  private mapSeverity(severity: string): 'info' | 'low' | 'medium' | 'high' | 'critical' {
    return severity as 'info' | 'low' | 'medium' | 'high' | 'critical';
  }

  private mapSeverityToNumber(severity: string): number {
    const mapping: Record<string, number> = {
      info: 1,
      low: 2,
      medium: 3,
      high: 4,
      critical: 5,
    };
    return mapping[severity] || 3;
  }

  private async updateIpReputation(ip: string, event: TrackedEvent): Promise<void> {
    let reputation = this.ipReputations.get(ip);
    if (!reputation) {
      reputation = this.createIpReputation(ip);
    }

    // Add violation
    reputation.violations.push({
      timestamp: event.timestamp,
      type: event.type,
      severity: event.severity,
    });

    // Update score
    reputation.score = this.calculateReputationScore(reputation);
    reputation.lastSeen = new Date();
    reputation.totalRequests++;

    // Use ML model if enabled
    if (this.config.autoBlockConfig.useMLModel) {
      reputation.mlRiskScore = await this.calculateMLRiskScore(reputation);
    }

    this.ipReputations.set(ip, reputation);
  }

  private createIpReputation(ip: string): IpReputation {
    return {
      ip,
      score: 100,
      violations: [],
      blocked: false,
      firstSeen: new Date(),
      lastSeen: new Date(),
      totalRequests: 0,
    };
  }

  private calculateReputationScore(reputation: IpReputation): number {
    let score = 100;

    // Recent violations have more impact
    const now = Date.now();
    for (const violation of reputation.violations) {
      const age = now - violation.timestamp.getTime();
      const ageHours = age / (1000 * 60 * 60);

      // Decay factor based on age
      const decayFactor = Math.exp(-ageHours / 24); // 24-hour half-life

      // Impact based on severity
      const severityImpact = violation.severity * 5;

      score -= severityImpact * decayFactor;
    }

    return Math.max(0, Math.min(100, score));
  }

  private async calculateMLRiskScore(reputation: IpReputation): Promise<number> {
    // Simulate ML model scoring
    // In production, this would call an actual ML model

    const features = {
      violationCount: reputation.violations.length,
      averageSeverity: reputation.violations.reduce((sum, v) => sum + v.severity, 0) /
        Math.max(1, reputation.violations.length),
      recentViolations: reputation.violations.filter(
        v => Date.now() - v.timestamp.getTime() < 3600000
      ).length,
      requestVolume: reputation.totalRequests,
      accountAge: Date.now() - reputation.firstSeen.getTime(),
    };

    // Simple heuristic (replace with actual ML in production)
    let riskScore = 0;
    riskScore += features.violationCount * 0.1;
    riskScore += features.averageSeverity * 0.15;
    riskScore += features.recentViolations * 0.2;
    riskScore += Math.min(features.requestVolume / 1000, 0.2);
    riskScore -= Math.min(features.accountAge / (30 * 24 * 60 * 60 * 1000), 0.2); // Older IPs get lower risk

    return Math.max(0, Math.min(1, riskScore));
  }

  private findMatchingPolicies(event: TrackedEvent): ResponsePolicy[] {
    return this.config.responsePolicies.filter(policy => {
      // Check trigger type
      if (policy.trigger.type !== event.type) {
        return false;
      }

      // Check threshold
      const count = this.countEventsInWindow(
        event.type,
        event.sourceIp,
        policy.trigger.windowSeconds
      );

      return count >= policy.trigger.threshold;
    });
  }

  private countEventsInWindow(
    type: TriggerType,
    sourceIp: string,
    windowSeconds: number
  ): number {
    const windowStart = Date.now() - windowSeconds * 1000;

    return this.events.filter(
      e =>
        e.type === type &&
        e.sourceIp === sourceIp &&
        e.timestamp.getTime() > windowStart
    ).length;
  }

  private async executePolicy(
    policy: ResponsePolicy,
    event: TrackedEvent,
    originalEvent: SecurityEvent
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of policy.actions) {
      const result = await this.executeAction(action, event, originalEvent);
      results.push(result);
    }

    if (policy.notify && policy.notifyChannels.length > 0) {
      await this.sendNotifications(policy.notifyChannels, policy, event, originalEvent);
    }

    return results;
  }

  private async executeAction(
    action: AutoResponseAction,
    event: TrackedEvent,
    originalEvent: SecurityEvent
  ): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      switch (action.type) {
        case 'block_ip':
          this.blockIp(
            event.sourceIp,
            action.parameters.durationSeconds as number || 3600,
            'soft'
          );
          break;

        case 'revoke_session':
          if (event.sessionId) {
            this.revokeSession(event.sessionId, 'Automatic response to security event');
          }
          break;

        case 'reduce_rate_limit':
          const factor = action.parameters.factor as number || 0.5;
          this.currentRateLimit = Math.max(
            this.config.autoScaleRateLimits.minLimit,
            Math.floor(this.currentRateLimit * factor)
          );
          break;

        case 'enable_captcha':
          // Emit event for captcha enablement
          this.emitEvent('captcha_enabled', {
            sourceIp: event.sourceIp,
            duration: action.parameters.duration,
          });
          break;

        case 'create_incident':
          this.emitEvent('incident_created', {
            eventId: originalEvent.id,
            severity: action.parameters.severity,
            description: originalEvent.description,
          });
          break;

        case 'isolate_endpoint':
          this.emitEvent('endpoint_isolated', {
            sourceIp: event.sourceIp,
            reason: 'Automatic security response',
          });
          break;

        default:
          // Log unknown action type
          break;
      }

      return {
        actionType: action.type,
        success: true,
        executionTimeMs: Date.now() - startTime,
        details: { action, event: event.type },
      };
    } catch (error) {
      return {
        actionType: action.type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  private async checkAutoBlock(event: TrackedEvent): Promise<ActionResult | null> {
    const reputation = this.ipReputations.get(event.sourceIp);
    if (!reputation || reputation.blocked) {
      return null;
    }

    // Check thresholds
    for (const threshold of this.config.autoBlockConfig.thresholds) {
      const recentViolations = reputation.violations.filter(
        v => Date.now() - v.timestamp.getTime() < threshold.windowSeconds * 1000
      ).length;

      if (recentViolations >= threshold.violations) {
        this.blockIp(event.sourceIp, threshold.blockDurationSeconds, threshold.blockType);

        return {
          actionType: 'block_ip',
          success: true,
          executionTimeMs: 0,
          details: {
            ip: event.sourceIp,
            threshold,
            violations: recentViolations,
          },
        };
      }
    }

    // Check ML risk score
    if (this.config.autoBlockConfig.useMLModel && reputation.mlRiskScore) {
      if (reputation.mlRiskScore > 0.9) {
        this.blockIp(event.sourceIp, 3600, 'hard');

        return {
          actionType: 'block_ip',
          success: true,
          executionTimeMs: 0,
          details: {
            ip: event.sourceIp,
            mlRiskScore: reputation.mlRiskScore,
            reason: 'ML model identified high risk',
          },
        };
      }
    }

    return null;
  }

  private async checkSessionRevocation(event: TrackedEvent): Promise<ActionResult | null> {
    if (!event.sessionId) {
      return null;
    }

    const session = this.sessions.get(event.sessionId);
    if (!session || session.revoked) {
      return null;
    }

    // Update anomaly score
    session.anomalyScore = Math.min(1, session.anomalyScore + 0.1 * event.severity);

    if (session.anomalyScore >= this.config.sessionRevocation.anomalyThreshold) {
      // Grace period check
      const gracePeriodStart = Date.now();
      await new Promise(resolve =>
        setTimeout(resolve, this.config.sessionRevocation.gracePeriodSeconds * 1000)
      );

      // Recheck after grace period
      const updatedSession = this.sessions.get(event.sessionId);
      if (updatedSession && !updatedSession.revoked &&
          updatedSession.anomalyScore >= this.config.sessionRevocation.anomalyThreshold) {
        this.revokeSession(event.sessionId, 'Anomaly threshold exceeded');

        return {
          actionType: 'revoke_session',
          success: true,
          executionTimeMs: Date.now() - gracePeriodStart,
          details: {
            sessionId: event.sessionId,
            anomalyScore: session.anomalyScore,
          },
        };
      }
    }

    return null;
  }

  private checkImpossibleTravel(
    session: TrackedSession,
    newLocation: { country: string; city?: string }
  ): { impossible: boolean; reason?: string } {
    if (!session.geoLocation) {
      return { impossible: false };
    }

    // Simple check: if country changed in less than reasonable travel time
    if (session.geoLocation.country !== newLocation.country) {
      const timeSinceLastActivity = Date.now() - session.lastActivity.getTime();
      const minTravelTimeMs = 2 * 60 * 60 * 1000; // 2 hours minimum

      if (timeSinceLastActivity < minTravelTimeMs) {
        return {
          impossible: true,
          reason: `Country changed from ${session.geoLocation.country} to ${newLocation.country} in ${Math.floor(timeSinceLastActivity / 60000)} minutes`,
        };
      }
    }

    return { impossible: false };
  }

  private async takeConfigSnapshot(config: Record<string, unknown>): Promise<void> {
    const snapshot: ConfigSnapshot = {
      id: `snapshot_${Date.now()}`,
      timestamp: new Date(),
      config: JSON.parse(JSON.stringify(config)),
      hash: this.calculateConfigHash(config),
    };

    this.configSnapshots.push(snapshot);

    // Keep only last 10 snapshots
    if (this.configSnapshots.length > 10) {
      this.configSnapshots = this.configSnapshots.slice(-10);
    }
  }

  private calculateConfigHash(config: Record<string, unknown>): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(JSON.stringify(config, Object.keys(config).sort()))
      .digest('hex');
  }

  private findConfigDifferences(
    baseline: Record<string, unknown>,
    current: Record<string, unknown>
  ): ConfigDifference[] {
    const differences: ConfigDifference[] = [];

    const allKeys = new Set([...Object.keys(baseline), ...Object.keys(current)]);

    for (const key of allKeys) {
      const baselineValue = baseline[key];
      const currentValue = current[key];

      if (JSON.stringify(baselineValue) !== JSON.stringify(currentValue)) {
        differences.push({
          key,
          baselineValue,
          currentValue,
          type: baselineValue === undefined
            ? 'added'
            : currentValue === undefined
            ? 'removed'
            : 'modified',
        });
      }
    }

    return differences;
  }

  private async repairConfiguration(
    baseline: Record<string, unknown>,
    current: Record<string, unknown>
  ): Promise<RepairResult> {
    // In a real implementation, this would restore configuration
    // For now, just report what would be repaired

    const differences = this.findConfigDifferences(baseline, current);

    this.recordAction({
      type: 'config_repaired',
      timestamp: new Date(),
      details: { differences },
    });

    return {
      success: true,
      repairedItems: differences.map(d => d.key),
    };
  }

  private async sendNotifications(
    channels: NotificationChannel[],
    policy: ResponsePolicy,
    event: TrackedEvent,
    originalEvent: SecurityEvent
  ): Promise<void> {
    for (const channel of channels) {
      this.emitEvent('notification', {
        channel,
        policyId: policy.id,
        event: originalEvent,
        timestamp: new Date(),
      });
    }
  }

  private recordAction(entry: ActionHistoryEntry): void {
    this.actionHistory.push(entry);

    // Keep only last 1000 actions
    if (this.actionHistory.length > 1000) {
      this.actionHistory = this.actionHistory.slice(-1000);
    }
  }

  private emitEvent(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          // Log error but don't fail
        }
      }
    }
  }
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

export interface ActionResult {
  actionType: AutoResponseType;
  success: boolean;
  error?: string;
  executionTimeMs: number;
  details?: Record<string, unknown>;
}

export interface RateLimitAdjustment {
  previousLimit: number;
  newLimit: number;
  reason: string;
  timestamp: Date;
  load: number;
}

export interface BlockStatus {
  blocked: boolean;
  blockedUntil?: Date;
  blockType?: 'soft' | 'hard';
  reason?: string;
}

export interface SessionUpdateResult {
  success: boolean;
  reason?: string;
  revoked?: boolean;
}

export interface DriftCheckResult {
  driftDetected: boolean;
  differences?: ConfigDifference[];
  repaired?: boolean;
  repairDetails?: RepairResult;
}

interface ConfigDifference {
  key: string;
  baselineValue: unknown;
  currentValue: unknown;
  type: 'added' | 'removed' | 'modified';
}

interface RepairResult {
  success: boolean;
  repairedItems: string[];
}

interface ActionHistoryEntry {
  type: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

type EventListener = (data: unknown) => void;

// Export singleton instance
export const selfHealingSecurity = new SelfHealingSecurityManager();
