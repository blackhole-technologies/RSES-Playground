/**
 * @file abac-engine.ts
 * @description Attribute-Based Access Control (ABAC) Engine.
 *              Implements advanced access control with risk-based authentication,
 *              continuous authentication, and just-in-time access provisioning.
 * @phase Phase 9 - Zero-Trust Security Enhancement
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards NIST SP 800-162, XACML 3.0
 */

import type {
  SecurityContext,
  IdentityContext,
  AbacPolicy,
  PolicyTarget,
  PolicyRule,
  AttributeCondition,
  CombiningAlgorithm,
  PolicyObligation,
  AppliedPolicy,
  Permission,
  PermissionScope,
  TimeRestriction,
  ConditionOperator,
  EnvironmentCondition,
  RiskLevel,
} from './types';

// =============================================================================
// ABAC ENGINE CONFIGURATION
// =============================================================================

export interface AbacEngineConfig {
  /** Enable ABAC */
  enabled: boolean;
  /** Default decision when no policy matches */
  defaultDecision: 'permit' | 'deny';
  /** Global combining algorithm */
  combiningAlgorithm: CombiningAlgorithm;
  /** Enable policy caching */
  cacheEnabled: boolean;
  /** Cache TTL in seconds */
  cacheTtlSeconds: number;
  /** Enable risk-based access control */
  riskBasedEnabled: boolean;
  /** Risk thresholds for access decisions */
  riskThresholds: RiskThresholds;
  /** Enable Just-In-Time access */
  jitEnabled: boolean;
  /** JIT configuration */
  jitConfig: JitConfig;
  /** Enable continuous authentication */
  continuousAuthEnabled: boolean;
  /** Continuous auth configuration */
  continuousAuthConfig: ContinuousAuthConfig;
}

export interface RiskThresholds {
  /** Risk level that blocks access */
  blockThreshold: RiskLevel;
  /** Risk level that requires additional verification */
  challengeThreshold: RiskLevel;
  /** Risk level that triggers enhanced logging */
  logThreshold: RiskLevel;
}

export interface JitConfig {
  /** Maximum JIT access duration (hours) */
  maxDurationHours: number;
  /** Require approval for JIT */
  requireApproval: boolean;
  /** Approval timeout (minutes) */
  approvalTimeoutMinutes: number;
  /** Auto-revoke on inactivity (minutes) */
  autoRevokeInactivityMinutes: number;
  /** Audit all JIT access */
  auditEnabled: boolean;
}

export interface ContinuousAuthConfig {
  /** Reauthentication interval (minutes) */
  reauthIntervalMinutes: number;
  /** Step-up auth for sensitive operations */
  stepUpEnabled: boolean;
  /** Step-up auth duration (minutes) */
  stepUpDurationMinutes: number;
  /** Behavioral verification enabled */
  behavioralVerificationEnabled: boolean;
}

const defaultConfig: AbacEngineConfig = {
  enabled: true,
  defaultDecision: 'deny',
  combiningAlgorithm: 'deny_overrides',
  cacheEnabled: true,
  cacheTtlSeconds: 300,
  riskBasedEnabled: true,
  riskThresholds: {
    blockThreshold: 'critical',
    challengeThreshold: 'high',
    logThreshold: 'medium',
  },
  jitEnabled: true,
  jitConfig: {
    maxDurationHours: 8,
    requireApproval: true,
    approvalTimeoutMinutes: 30,
    autoRevokeInactivityMinutes: 30,
    auditEnabled: true,
  },
  continuousAuthEnabled: true,
  continuousAuthConfig: {
    reauthIntervalMinutes: 60,
    stepUpEnabled: true,
    stepUpDurationMinutes: 15,
    behavioralVerificationEnabled: true,
  },
};

// =============================================================================
// ACCESS REQUEST & DECISION
// =============================================================================

/**
 * Access request to be evaluated.
 */
export interface AccessRequest {
  /** Request ID */
  requestId: string;
  /** Subject (who) */
  subject: SubjectAttributes;
  /** Resource (what) */
  resource: ResourceAttributes;
  /** Action (how) */
  action: ActionAttributes;
  /** Environment (when/where) */
  environment: EnvironmentAttributes;
  /** Security context */
  securityContext: SecurityContext;
}

export interface SubjectAttributes {
  /** Subject ID */
  id: string;
  /** Subject type */
  type: 'user' | 'service' | 'system';
  /** Identity context */
  identity?: IdentityContext;
  /** Additional attributes */
  attributes: Record<string, unknown>;
}

export interface ResourceAttributes {
  /** Resource ID */
  id: string;
  /** Resource type */
  type: string;
  /** Resource path */
  path?: string;
  /** Resource owner */
  owner?: string;
  /** Sensitivity level */
  sensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
  /** Additional attributes */
  attributes: Record<string, unknown>;
}

export interface ActionAttributes {
  /** Action ID */
  id: string;
  /** Action type */
  type: 'read' | 'write' | 'delete' | 'execute' | 'admin';
  /** Additional attributes */
  attributes: Record<string, unknown>;
}

export interface EnvironmentAttributes {
  /** Current time */
  currentTime: Date;
  /** Client IP */
  clientIp: string;
  /** Geolocation */
  geoLocation?: {
    country: string;
    region?: string;
    city?: string;
  };
  /** Device info */
  device?: {
    type: string;
    managed: boolean;
    trustScore: number;
  };
  /** Network info */
  network?: {
    trusted: boolean;
    vpn: boolean;
    proxy: boolean;
  };
  /** Additional attributes */
  attributes: Record<string, unknown>;
}

/**
 * Access decision result.
 */
export interface AccessDecision {
  /** Request ID */
  requestId: string;
  /** Decision */
  decision: 'permit' | 'deny' | 'indeterminate' | 'not_applicable';
  /** Reason for decision */
  reason: string;
  /** Applied policies */
  appliedPolicies: AppliedPolicy[];
  /** Obligations to fulfill */
  obligations: PolicyObligation[];
  /** Risk-based modifications */
  riskModifications?: RiskModification[];
  /** Evaluation time (ms) */
  evaluationTimeMs: number;
  /** Cache hit */
  cacheHit: boolean;
  /** Additional context */
  context: Record<string, unknown>;
}

export interface RiskModification {
  /** Modification type */
  type: 'stepped_up' | 'additional_logging' | 'rate_limited' | 'time_limited';
  /** Reason */
  reason: string;
  /** Parameters */
  parameters: Record<string, unknown>;
}

// =============================================================================
// ABAC ENGINE IMPLEMENTATION
// =============================================================================

/**
 * Attribute-Based Access Control Engine.
 */
export class AbacEngine {
  private config: AbacEngineConfig;
  private policies: Map<string, AbacPolicy> = new Map();
  private policyCache: Map<string, CachedDecision> = new Map();
  private jitGrants: Map<string, JitGrant> = new Map();

  constructor(config: Partial<AbacEngineConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Evaluate an access request.
   */
  async evaluate(request: AccessRequest): Promise<AccessDecision> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.getCacheKey(request);
    const cached = this.getCachedDecision(cacheKey);
    if (cached) {
      return {
        ...cached.decision,
        cacheHit: true,
        evaluationTimeMs: Date.now() - startTime,
      };
    }

    // Check risk-based access control
    if (this.config.riskBasedEnabled) {
      const riskDecision = await this.evaluateRisk(request);
      if (riskDecision.decision === 'deny') {
        return {
          ...riskDecision,
          evaluationTimeMs: Date.now() - startTime,
          cacheHit: false,
        };
      }
    }

    // Check JIT grants
    if (this.config.jitEnabled) {
      const jitDecision = await this.checkJitGrant(request);
      if (jitDecision) {
        return {
          ...jitDecision,
          evaluationTimeMs: Date.now() - startTime,
          cacheHit: false,
        };
      }
    }

    // Evaluate policies
    const applicablePolicies = this.findApplicablePolicies(request);
    const appliedPolicies: AppliedPolicy[] = [];
    const allObligations: PolicyObligation[] = [];

    for (const policy of applicablePolicies) {
      const policyResult = await this.evaluatePolicy(policy, request);
      appliedPolicies.push(policyResult);

      if (policyResult.decision === 'permit' || policyResult.decision === 'deny') {
        allObligations.push(...policyResult.obligations);
      }
    }

    // Combine decisions
    const finalDecision = this.combineDecisions(appliedPolicies, this.config.combiningAlgorithm);
    const obligations = this.filterObligations(allObligations, finalDecision);

    // Apply risk modifications
    const riskModifications = this.config.riskBasedEnabled
      ? this.calculateRiskModifications(request)
      : [];

    const result: AccessDecision = {
      requestId: request.requestId,
      decision: finalDecision,
      reason: this.getDecisionReason(finalDecision, appliedPolicies),
      appliedPolicies,
      obligations,
      riskModifications,
      evaluationTimeMs: Date.now() - startTime,
      cacheHit: false,
      context: {
        subjectId: request.subject.id,
        resourceId: request.resource.id,
        actionId: request.action.id,
      },
    };

    // Cache the decision
    if (this.config.cacheEnabled && finalDecision !== 'indeterminate') {
      this.cacheDecision(cacheKey, result);
    }

    return result;
  }

  /**
   * Register a policy.
   */
  registerPolicy(policy: AbacPolicy): void {
    this.policies.set(policy.id, policy);
    this.invalidateCache();
  }

  /**
   * Remove a policy.
   */
  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
    this.invalidateCache();
  }

  /**
   * Get all policies.
   */
  getPolicies(): AbacPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Grant Just-In-Time access.
   */
  async grantJitAccess(grant: JitGrantRequest): Promise<JitGrant> {
    if (!this.config.jitEnabled) {
      throw new Error('JIT access is not enabled');
    }

    const jitGrant: JitGrant = {
      id: `jit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subjectId: grant.subjectId,
      resourcePattern: grant.resourcePattern,
      actions: grant.actions,
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + grant.durationMinutes * 60 * 1000),
      grantedBy: grant.grantedBy,
      reason: grant.reason,
      approvalId: grant.approvalId,
      status: 'active',
      lastUsedAt: null,
      usageCount: 0,
    };

    this.jitGrants.set(jitGrant.id, jitGrant);

    // Schedule auto-revocation
    setTimeout(() => {
      const g = this.jitGrants.get(jitGrant.id);
      if (g && g.status === 'active') {
        g.status = 'expired';
      }
    }, grant.durationMinutes * 60 * 1000);

    return jitGrant;
  }

  /**
   * Revoke JIT access.
   */
  revokeJitAccess(grantId: string): void {
    const grant = this.jitGrants.get(grantId);
    if (grant) {
      grant.status = 'revoked';
    }
  }

  /**
   * Check if step-up authentication is required.
   */
  async requiresStepUp(
    request: AccessRequest,
    sensitiveOperation: boolean
  ): Promise<StepUpRequirement | null> {
    if (!this.config.continuousAuthEnabled || !this.config.continuousAuthConfig.stepUpEnabled) {
      return null;
    }

    const identity = request.subject.identity;
    if (!identity) {
      return {
        required: true,
        reason: 'No authenticated session',
        methods: ['password', 'mfa'],
        validForMinutes: this.config.continuousAuthConfig.stepUpDurationMinutes,
      };
    }

    // Check if already elevated
    if (identity.session.elevated && identity.session.elevationExpires) {
      if (new Date() < identity.session.elevationExpires) {
        return null; // Already stepped up
      }
    }

    // Check if sensitive operation
    if (sensitiveOperation) {
      return {
        required: true,
        reason: 'Sensitive operation requires step-up authentication',
        methods: ['mfa', 'biometric'],
        validForMinutes: this.config.continuousAuthConfig.stepUpDurationMinutes,
      };
    }

    // Check if reauthentication interval exceeded
    const timeSinceAuth = Date.now() - identity.lastAuthenticated.getTime();
    const reauthInterval = this.config.continuousAuthConfig.reauthIntervalMinutes * 60 * 1000;
    if (timeSinceAuth > reauthInterval) {
      return {
        required: true,
        reason: 'Session requires periodic reauthentication',
        methods: ['password', 'mfa'],
        validForMinutes: this.config.continuousAuthConfig.stepUpDurationMinutes,
      };
    }

    // Check risk level
    const riskLevel = request.securityContext.riskScore.level;
    if (riskLevel === 'high' || riskLevel === 'critical') {
      return {
        required: true,
        reason: `High risk level (${riskLevel}) requires step-up authentication`,
        methods: ['mfa', 'biometric'],
        validForMinutes: this.config.continuousAuthConfig.stepUpDurationMinutes,
      };
    }

    return null;
  }

  /**
   * Evaluate risk-based access control.
   */
  private async evaluateRisk(request: AccessRequest): Promise<AccessDecision> {
    const riskLevel = request.securityContext.riskScore.level;
    const { blockThreshold, challengeThreshold } = this.config.riskThresholds;

    // Block if risk is at or above block threshold
    const riskOrder: RiskLevel[] = ['minimal', 'low', 'medium', 'high', 'critical'];
    const riskIndex = riskOrder.indexOf(riskLevel);
    const blockIndex = riskOrder.indexOf(blockThreshold);

    if (riskIndex >= blockIndex) {
      return {
        requestId: request.requestId,
        decision: 'deny',
        reason: `Risk level (${riskLevel}) exceeds acceptable threshold`,
        appliedPolicies: [],
        obligations: [],
        evaluationTimeMs: 0,
        cacheHit: false,
        context: { riskLevel },
      };
    }

    // Continue evaluation if not blocked
    return {
      requestId: request.requestId,
      decision: 'indeterminate',
      reason: 'Risk check passed, continue evaluation',
      appliedPolicies: [],
      obligations: [],
      evaluationTimeMs: 0,
      cacheHit: false,
      context: { riskLevel },
    };
  }

  /**
   * Check for JIT grant.
   */
  private async checkJitGrant(request: AccessRequest): Promise<AccessDecision | null> {
    for (const [, grant] of this.jitGrants) {
      if (
        grant.status === 'active' &&
        grant.subjectId === request.subject.id &&
        this.matchesPattern(request.resource.path || request.resource.id, grant.resourcePattern) &&
        grant.actions.includes(request.action.type) &&
        new Date() < grant.expiresAt
      ) {
        // Update usage
        grant.lastUsedAt = new Date();
        grant.usageCount++;

        return {
          requestId: request.requestId,
          decision: 'permit',
          reason: `JIT access granted (${grant.id})`,
          appliedPolicies: [{
            policyId: 'jit',
            policyName: 'Just-In-Time Access',
            decision: 'permit',
            matchedRules: [grant.id],
            obligations: [{
              id: 'jit_audit',
              fulfillOn: 'permit',
              action: 'audit',
              parameters: { grantId: grant.id },
            }],
            evaluationTimeMs: 0,
          }],
          obligations: [{
            id: 'jit_audit',
            fulfillOn: 'permit',
            action: 'audit',
            parameters: { grantId: grant.id },
          }],
          evaluationTimeMs: 0,
          cacheHit: false,
          context: { jitGrantId: grant.id },
        };
      }
    }

    return null;
  }

  /**
   * Find policies applicable to the request.
   */
  private findApplicablePolicies(request: AccessRequest): AbacPolicy[] {
    return Array.from(this.policies.values())
      .filter(policy => policy.enabled && this.matchesTarget(policy.target, request))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if request matches policy target.
   */
  private matchesTarget(target: PolicyTarget, request: AccessRequest): boolean {
    // Check resource type
    if (target.resourceType !== '*' && target.resourceType !== request.resource.type) {
      return false;
    }

    // Check resource pattern
    if (!this.matchesPattern(request.resource.path || request.resource.id, target.resourcePattern)) {
      return false;
    }

    // Check action
    if (target.actions.length > 0 && !target.actions.includes(request.action.type)) {
      return false;
    }

    // Check environment conditions
    if (target.environment) {
      for (const condition of target.environment) {
        if (!this.evaluateEnvironmentCondition(condition, request.environment)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evaluate a single policy.
   */
  private async evaluatePolicy(policy: AbacPolicy, request: AccessRequest): Promise<AppliedPolicy> {
    const startTime = Date.now();
    const matchedRules: string[] = [];
    const ruleResults: { rule: PolicyRule; result: 'permit' | 'deny' | 'not_applicable' }[] = [];

    for (const rule of policy.rules) {
      const result = this.evaluateRule(rule, request);
      if (result !== 'not_applicable') {
        matchedRules.push(rule.id);
        ruleResults.push({ rule, result });
      }
    }

    // Combine rule results
    const decision = this.combineRuleResults(ruleResults, policy.combiningAlgorithm);

    // Get applicable obligations
    const obligations = policy.obligations.filter(
      o => o.fulfillOn === decision
    );

    return {
      policyId: policy.id,
      policyName: policy.name,
      decision: ruleResults.length === 0 ? 'not_applicable' : decision,
      matchedRules,
      obligations,
      evaluationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Evaluate a single rule.
   */
  private evaluateRule(
    rule: PolicyRule,
    request: AccessRequest
  ): 'permit' | 'deny' | 'not_applicable' {
    // Check subject conditions
    for (const condition of rule.subject) {
      if (!this.evaluateCondition(condition, request.subject.attributes, 'subject')) {
        if (!condition.optional) {
          return 'not_applicable';
        }
      }
    }

    // Check resource conditions
    for (const condition of rule.resource) {
      if (!this.evaluateCondition(condition, request.resource.attributes, 'resource')) {
        if (!condition.optional) {
          return 'not_applicable';
        }
      }
    }

    // Check action conditions
    for (const condition of rule.action) {
      if (!this.evaluateCondition(condition, request.action.attributes, 'action')) {
        if (!condition.optional) {
          return 'not_applicable';
        }
      }
    }

    // Check environment conditions
    for (const condition of rule.environment) {
      if (!this.evaluateCondition(condition, request.environment.attributes, 'environment')) {
        if (!condition.optional) {
          return 'not_applicable';
        }
      }
    }

    return rule.effect;
  }

  /**
   * Evaluate a single condition.
   */
  private evaluateCondition(
    condition: AttributeCondition,
    attributes: Record<string, unknown>,
    category: string
  ): boolean {
    const value = attributes[condition.attribute];
    return this.compareValues(value, condition.operator, condition.value);
  }

  /**
   * Evaluate environment condition.
   */
  private evaluateEnvironmentCondition(
    condition: EnvironmentCondition,
    environment: EnvironmentAttributes
  ): boolean {
    const value = (environment.attributes as Record<string, unknown>)[condition.attribute];
    return this.compareValues(value, condition.operator, condition.value);
  }

  /**
   * Compare values using operator.
   */
  private compareValues(
    actual: unknown,
    operator: ConditionOperator,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;
      case 'not_contains':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return !actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return !actual.includes(expected);
        }
        return true;
      case 'starts_with':
        return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
      case 'ends_with':
        return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
      case 'greater_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'less_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'matches_regex':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return new RegExp(expected).test(actual);
        }
        return false;
      case 'between':
        if (typeof actual === 'number' && Array.isArray(expected) && expected.length === 2) {
          return actual >= expected[0] && actual <= expected[1];
        }
        return false;
      case 'is_null':
        return actual === null || actual === undefined;
      case 'is_not_null':
        return actual !== null && actual !== undefined;
      default:
        return false;
    }
  }

  /**
   * Combine rule results.
   */
  private combineRuleResults(
    results: { rule: PolicyRule; result: 'permit' | 'deny' | 'not_applicable' }[],
    algorithm: CombiningAlgorithm
  ): 'permit' | 'deny' | 'not_applicable' | 'indeterminate' {
    const permits = results.filter(r => r.result === 'permit');
    const denies = results.filter(r => r.result === 'deny');

    switch (algorithm) {
      case 'deny_overrides':
        if (denies.length > 0) return 'deny';
        if (permits.length > 0) return 'permit';
        return 'not_applicable';

      case 'permit_overrides':
        if (permits.length > 0) return 'permit';
        if (denies.length > 0) return 'deny';
        return 'not_applicable';

      case 'first_applicable':
        const first = results.find(r => r.result !== 'not_applicable');
        return first?.result || 'not_applicable';

      case 'only_one_applicable':
        const applicable = results.filter(r => r.result !== 'not_applicable');
        if (applicable.length === 1) return applicable[0].result;
        if (applicable.length > 1) return 'indeterminate';
        return 'not_applicable';

      case 'deny_unless_permit':
        if (permits.length > 0) return 'permit';
        return 'deny';

      case 'permit_unless_deny':
        if (denies.length > 0) return 'deny';
        return 'permit';

      default:
        return 'indeterminate';
    }
  }

  /**
   * Combine decisions from multiple policies.
   */
  private combineDecisions(
    policies: AppliedPolicy[],
    algorithm: CombiningAlgorithm
  ): 'permit' | 'deny' | 'indeterminate' | 'not_applicable' {
    const permits = policies.filter(p => p.decision === 'permit');
    const denies = policies.filter(p => p.decision === 'deny');

    switch (algorithm) {
      case 'deny_overrides':
        if (denies.length > 0) return 'deny';
        if (permits.length > 0) return 'permit';
        return this.config.defaultDecision === 'permit' ? 'permit' : 'deny';

      case 'permit_overrides':
        if (permits.length > 0) return 'permit';
        if (denies.length > 0) return 'deny';
        return this.config.defaultDecision === 'permit' ? 'permit' : 'deny';

      case 'first_applicable':
        const first = policies.find(p => p.decision === 'permit' || p.decision === 'deny');
        return first?.decision || this.config.defaultDecision;

      default:
        if (denies.length > 0) return 'deny';
        if (permits.length > 0) return 'permit';
        return this.config.defaultDecision === 'permit' ? 'permit' : 'deny';
    }
  }

  /**
   * Filter obligations based on final decision.
   */
  private filterObligations(
    obligations: PolicyObligation[],
    decision: 'permit' | 'deny' | 'indeterminate' | 'not_applicable'
  ): PolicyObligation[] {
    if (decision === 'indeterminate' || decision === 'not_applicable') {
      return [];
    }
    return obligations.filter(o => o.fulfillOn === decision);
  }

  /**
   * Calculate risk-based modifications.
   */
  private calculateRiskModifications(request: AccessRequest): RiskModification[] {
    const modifications: RiskModification[] = [];
    const riskLevel = request.securityContext.riskScore.level;

    if (riskLevel === 'medium') {
      modifications.push({
        type: 'additional_logging',
        reason: 'Medium risk level detected',
        parameters: { logLevel: 'detailed' },
      });
    }

    if (riskLevel === 'high') {
      modifications.push({
        type: 'additional_logging',
        reason: 'High risk level detected',
        parameters: { logLevel: 'verbose' },
      });
      modifications.push({
        type: 'time_limited',
        reason: 'High risk access is time-limited',
        parameters: { durationMinutes: 30 },
      });
    }

    return modifications;
  }

  /**
   * Get human-readable decision reason.
   */
  private getDecisionReason(
    decision: 'permit' | 'deny' | 'indeterminate' | 'not_applicable',
    policies: AppliedPolicy[]
  ): string {
    if (decision === 'not_applicable') {
      return 'No applicable policies found';
    }

    if (decision === 'indeterminate') {
      return 'Unable to determine access (conflicting policies)';
    }

    const relevantPolicies = policies.filter(p => p.decision === decision);
    if (relevantPolicies.length === 0) {
      return `Default decision: ${decision}`;
    }

    const policyNames = relevantPolicies.map(p => p.policyName).join(', ');
    return `${decision === 'permit' ? 'Permitted' : 'Denied'} by: ${policyNames}`;
  }

  /**
   * Pattern matching helper.
   */
  private matchesPattern(value: string, pattern: string): boolean {
    if (pattern === '*') return true;
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(value);
  }

  /**
   * Get cache key for request.
   */
  private getCacheKey(request: AccessRequest): string {
    return `${request.subject.id}:${request.resource.type}:${request.resource.id}:${request.action.type}`;
  }

  /**
   * Get cached decision.
   */
  private getCachedDecision(key: string): CachedDecision | null {
    if (!this.config.cacheEnabled) return null;

    const cached = this.policyCache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.policyCache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Cache a decision.
   */
  private cacheDecision(key: string, decision: AccessDecision): void {
    this.policyCache.set(key, {
      decision,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
    });
  }

  /**
   * Invalidate cache.
   */
  private invalidateCache(): void {
    this.policyCache.clear();
  }
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

interface CachedDecision {
  decision: AccessDecision;
  cachedAt: number;
  expiresAt: number;
}

export interface JitGrantRequest {
  subjectId: string;
  resourcePattern: string;
  actions: string[];
  durationMinutes: number;
  grantedBy: string;
  reason: string;
  approvalId?: string;
}

export interface JitGrant {
  id: string;
  subjectId: string;
  resourcePattern: string;
  actions: string[];
  grantedAt: Date;
  expiresAt: Date;
  grantedBy: string;
  reason: string;
  approvalId?: string;
  status: 'active' | 'expired' | 'revoked';
  lastUsedAt: Date | null;
  usageCount: number;
}

export interface StepUpRequirement {
  required: boolean;
  reason: string;
  methods: ('password' | 'mfa' | 'biometric')[];
  validForMinutes: number;
}

// Export singleton instance
export const abacEngine = new AbacEngine();
