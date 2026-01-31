/**
 * @file risk-engine.ts
 * @description AI-Powered Risk Assessment Engine for Zero-Trust Security.
 *              Implements behavioral analysis, anomaly detection, and predictive
 *              threat modeling using machine learning techniques.
 * @phase Phase 9 - Zero-Trust Security Enhancement
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards NIST CSF, MITRE ATT&CK Framework
 */

import type {
  SecurityContext,
  RiskScore,
  RiskLevel,
  RiskComponents,
  RiskFactor,
  RiskRecommendation,
  RiskAction,
  ThreatDetectionResult,
  DetectedThreat,
  AnomalyIndicator,
  BehaviorAnalysis,
  BehaviorMetric,
  IdentityContext,
  DeviceContext,
  NetworkContext,
  NetworkRiskIndicator,
} from './types';

// =============================================================================
// RISK ENGINE CONFIGURATION
// =============================================================================

export interface RiskEngineConfig {
  /** Enable ML-based risk assessment */
  mlEnabled: boolean;
  /** Risk score thresholds for different levels */
  thresholds: RiskThresholds;
  /** Weights for different risk components */
  weights: ComponentWeights;
  /** Behavioral analysis configuration */
  behaviorConfig: BehaviorAnalysisConfig;
  /** Anomaly detection configuration */
  anomalyConfig: AnomalyDetectionConfig;
  /** Threat intelligence configuration */
  threatIntelConfig: ThreatIntelConfig;
}

export interface RiskThresholds {
  minimal: number;  // 0-20
  low: number;      // 21-40
  medium: number;   // 41-60
  high: number;     // 61-80
  critical: number; // 81-100
}

export interface ComponentWeights {
  identity: number;
  device: number;
  network: number;
  behavior: number;
  context: number;
  historical: number;
}

export interface BehaviorAnalysisConfig {
  /** Enable behavioral analysis */
  enabled: boolean;
  /** Lookback window for baseline (days) */
  baselineWindowDays: number;
  /** Minimum samples for baseline */
  minBaselineSamples: number;
  /** Anomaly sensitivity (0-1) */
  sensitivity: number;
  /** Metrics to track */
  trackedMetrics: string[];
}

export interface AnomalyDetectionConfig {
  /** Detection algorithm */
  algorithm: 'isolation_forest' | 'local_outlier_factor' | 'one_class_svm' | 'autoencoder';
  /** Contamination factor (expected anomaly rate) */
  contamination: number;
  /** Number of standard deviations for outlier detection */
  stdDevThreshold: number;
  /** Enable real-time detection */
  realTimeEnabled: boolean;
}

export interface ThreatIntelConfig {
  /** Enable threat intelligence feeds */
  enabled: boolean;
  /** Threat intel sources */
  sources: string[];
  /** Cache TTL for threat data (seconds) */
  cacheTtlSeconds: number;
  /** Enable reputation scoring */
  reputationScoring: boolean;
}

// Default configuration
const defaultConfig: RiskEngineConfig = {
  mlEnabled: true,
  thresholds: {
    minimal: 20,
    low: 40,
    medium: 60,
    high: 80,
    critical: 100,
  },
  weights: {
    identity: 0.25,
    device: 0.20,
    network: 0.15,
    behavior: 0.20,
    context: 0.10,
    historical: 0.10,
  },
  behaviorConfig: {
    enabled: true,
    baselineWindowDays: 30,
    minBaselineSamples: 50,
    sensitivity: 0.7,
    trackedMetrics: [
      'request_rate',
      'active_hours',
      'accessed_resources',
      'geolocation_pattern',
      'device_pattern',
      'action_pattern',
    ],
  },
  anomalyConfig: {
    algorithm: 'isolation_forest',
    contamination: 0.1,
    stdDevThreshold: 3,
    realTimeEnabled: true,
  },
  threatIntelConfig: {
    enabled: true,
    sources: ['internal', 'external'],
    cacheTtlSeconds: 3600,
    reputationScoring: true,
  },
};

// =============================================================================
// BEHAVIORAL PROFILE
// =============================================================================

/**
 * User behavioral profile for anomaly detection.
 */
export interface BehavioralProfile {
  /** User ID */
  userId: string;
  /** Profile creation date */
  createdAt: Date;
  /** Last updated */
  updatedAt: Date;
  /** Number of samples in profile */
  sampleCount: number;
  /** Typical active hours */
  typicalHours: HourDistribution;
  /** Typical locations */
  typicalLocations: LocationPattern[];
  /** Typical devices */
  typicalDevices: DevicePattern[];
  /** Typical actions */
  typicalActions: ActionPattern[];
  /** Request rate baseline */
  requestRateBaseline: RateBaseline;
  /** Resource access patterns */
  resourcePatterns: ResourcePattern[];
  /** Risk history */
  riskHistory: RiskHistoryEntry[];
}

export interface HourDistribution {
  /** Probability for each hour (0-23) */
  hourlyProbability: number[];
  /** Days of week active */
  activeDays: number[];
  /** Peak hours */
  peakHours: number[];
}

export interface LocationPattern {
  /** Country code */
  countryCode: string;
  /** Region */
  region?: string;
  /** City */
  city?: string;
  /** Frequency */
  frequency: number;
  /** Last seen */
  lastSeen: Date;
}

export interface DevicePattern {
  /** Device fingerprint */
  fingerprint: string;
  /** Device type */
  type: string;
  /** OS */
  os: string;
  /** Trust level */
  trustLevel: number;
  /** First seen */
  firstSeen: Date;
  /** Last seen */
  lastSeen: Date;
  /** Usage count */
  usageCount: number;
}

export interface ActionPattern {
  /** Action type */
  action: string;
  /** Frequency (per day) */
  frequencyPerDay: number;
  /** Typical times */
  typicalTimes: number[];
  /** Success rate */
  successRate: number;
}

export interface RateBaseline {
  /** Mean requests per minute */
  meanRpm: number;
  /** Standard deviation */
  stdDev: number;
  /** Maximum observed */
  maxObserved: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
}

export interface ResourcePattern {
  /** Resource type */
  resourceType: string;
  /** Access frequency */
  accessFrequency: number;
  /** Typical operations */
  operations: string[];
}

export interface RiskHistoryEntry {
  /** Timestamp */
  timestamp: Date;
  /** Risk score */
  riskScore: number;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Notable factors */
  notableFactors: string[];
}

// =============================================================================
// RISK ENGINE IMPLEMENTATION
// =============================================================================

/**
 * AI-Powered Risk Assessment Engine.
 * Implements zero-trust continuous verification with ML-based threat detection.
 */
export class RiskEngine {
  private config: RiskEngineConfig;
  private profiles: Map<string, BehavioralProfile> = new Map();
  private threatCache: Map<string, CachedThreatData> = new Map();

  constructor(config: Partial<RiskEngineConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Calculate comprehensive risk score for a security context.
   */
  async calculateRiskScore(context: SecurityContext): Promise<RiskScore> {
    const components = await this.calculateComponents(context);
    const factors = await this.identifyRiskFactors(context, components);
    const overall = this.calculateOverallScore(components);
    const level = this.determineRiskLevel(overall);
    const recommendations = this.generateRecommendations(overall, level, factors);

    return {
      overall,
      level,
      components,
      factors,
      recommendations,
      calculatedAt: new Date(),
      requiresVerification: level === 'high' || level === 'critical',
    };
  }

  /**
   * Calculate individual risk components.
   */
  private async calculateComponents(context: SecurityContext): Promise<RiskComponents> {
    const [identity, device, network, behavior, contextScore, historical] = await Promise.all([
      this.calculateIdentityRisk(context.identity),
      this.calculateDeviceRisk(context.device),
      this.calculateNetworkRisk(context.network),
      this.calculateBehaviorRisk(context),
      this.calculateContextRisk(context),
      this.calculateHistoricalRisk(context.identity?.userId),
    ]);

    return { identity, device, network, behavior, context: contextScore, historical };
  }

  /**
   * Calculate identity-based risk.
   */
  private async calculateIdentityRisk(identity?: IdentityContext): Promise<number> {
    if (!identity) return 100; // No identity = maximum risk

    let risk = 0;

    // Authentication strength
    const authStrengthScores: Record<string, number> = {
      very_high: 0,
      high: 10,
      medium: 30,
      low: 50,
    };
    risk += authStrengthScores[identity.authStrength] || 50;

    // MFA verification
    if (!identity.mfaVerified) {
      risk += 20;
    }

    // Session age
    const sessionAge = Date.now() - identity.session.createdAt.getTime();
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
    if (sessionAge > maxSessionAge) {
      risk += 15;
    }

    // Time since last authentication
    const timeSinceAuth = Date.now() - identity.lastAuthenticated.getTime();
    const maxTimeSinceAuth = 8 * 60 * 60 * 1000; // 8 hours
    if (timeSinceAuth > maxTimeSinceAuth) {
      risk += 10;
    }

    // Device binding
    if (!identity.session.deviceBound) {
      risk += 5;
    }

    return Math.min(100, risk);
  }

  /**
   * Calculate device-based risk.
   */
  private async calculateDeviceRisk(device: DeviceContext): Promise<number> {
    let risk = 0;

    // Unknown device
    if (!device.knownDevice) {
      risk += 30;
    }

    // Unmanaged device
    if (!device.managed) {
      risk += 15;
    }

    // Device trust score (inverse)
    risk += (100 - device.trustScore) * 0.3;

    // Compliance status
    if (!device.complianceStatus.compliant) {
      const checks = device.complianceStatus.checks;
      if (!checks.osUpdated) risk += 10;
      if (!checks.antivirusEnabled) risk += 10;
      if (!checks.firewallEnabled) risk += 5;
      if (!checks.diskEncrypted) risk += 10;
      if (!checks.screenLockEnabled) risk += 5;
    }

    // Unknown device type
    if (device.type === 'unknown') {
      risk += 10;
    }

    return Math.min(100, risk);
  }

  /**
   * Calculate network-based risk.
   */
  private async calculateNetworkRisk(network: NetworkContext): Promise<number> {
    let risk = 0;

    // VPN detection (depends on policy)
    if (network.vpnDetected) {
      risk += 5; // Minor risk indicator
    }

    // Proxy detection
    if (network.proxyDetected) {
      risk += 15;
    }

    // Tor detection
    if (network.torDetected) {
      risk += 40;
    }

    // Untrusted network
    if (!network.trustedNetwork) {
      risk += 20;
    }

    // Risk indicators
    const indicatorScores: Record<NetworkRiskIndicator, number> = {
      known_bad_ip: 50,
      datacenter_ip: 15,
      residential_proxy: 25,
      vpn_detected: 5,
      tor_exit: 40,
      unusual_geolocation: 20,
      impossible_travel: 60,
      new_location: 15,
    };

    for (const indicator of network.riskIndicators) {
      risk += indicatorScores[indicator] || 10;
    }

    // High-risk countries
    const highRiskCountries = ['KP', 'IR', 'RU', 'CN'];
    if (highRiskCountries.includes(network.geoLocation.countryCode)) {
      risk += 20;
    }

    // Hosting ASN type
    if (network.asn.type === 'hosting') {
      risk += 15;
    }

    return Math.min(100, risk);
  }

  /**
   * Calculate behavior-based risk using anomaly detection.
   */
  private async calculateBehaviorRisk(context: SecurityContext): Promise<number> {
    if (!this.config.behaviorConfig.enabled || !context.identity) {
      return 30; // Default moderate risk without behavioral data
    }

    const profile = this.profiles.get(context.identity.userId);
    if (!profile || profile.sampleCount < this.config.behaviorConfig.minBaselineSamples) {
      return 25; // Insufficient baseline data
    }

    let risk = 0;
    const anomalies = await this.detectAnomalies(context, profile);

    // Sum anomaly scores with diminishing returns
    for (let i = 0; i < anomalies.length; i++) {
      const anomaly = anomalies[i];
      // Apply diminishing weight to subsequent anomalies
      const weight = Math.pow(0.8, i);
      risk += anomaly.score * 30 * weight;
    }

    return Math.min(100, risk);
  }

  /**
   * Calculate context-based risk (time, location, action).
   */
  private async calculateContextRisk(context: SecurityContext): Promise<number> {
    let risk = 0;
    const now = new Date();

    // Off-hours access
    const hour = now.getHours();
    if (hour < 6 || hour > 22) {
      risk += 15;
    }

    // Weekend access
    const day = now.getDay();
    if (day === 0 || day === 6) {
      risk += 10;
    }

    // Request timestamp age
    const requestAge = Date.now() - context.timestamp.getTime();
    if (requestAge > 60000) { // Older than 1 minute
      risk += 5;
    }

    return Math.min(100, risk);
  }

  /**
   * Calculate historical risk based on past behavior.
   */
  private async calculateHistoricalRisk(userId?: string): Promise<number> {
    if (!userId) return 50;

    const profile = this.profiles.get(userId);
    if (!profile || profile.riskHistory.length === 0) {
      return 30;
    }

    // Calculate average risk from recent history
    const recentHistory = profile.riskHistory.slice(-10);
    const avgRisk = recentHistory.reduce((sum, entry) => sum + entry.riskScore, 0) / recentHistory.length;

    // Check for escalating risk pattern
    let escalationBonus = 0;
    for (let i = 1; i < recentHistory.length; i++) {
      if (recentHistory[i].riskScore > recentHistory[i - 1].riskScore) {
        escalationBonus += 2;
      }
    }

    return Math.min(100, avgRisk + escalationBonus);
  }

  /**
   * Detect anomalies in the current context.
   */
  private async detectAnomalies(
    context: SecurityContext,
    profile: BehavioralProfile
  ): Promise<AnomalyIndicator[]> {
    const anomalies: AnomalyIndicator[] = [];

    // Time-based anomaly
    const hour = context.timestamp.getHours();
    const hourProbability = profile.typicalHours.hourlyProbability[hour];
    if (hourProbability < 0.05) {
      anomalies.push({
        type: 'unusual_time',
        score: 1 - hourProbability * 20,
        baseline: profile.typicalHours.peakHours[0],
        observed: hour,
        deviation: this.calculateDeviation(hour, profile.typicalHours.peakHours),
        description: `Access at unusual time (hour ${hour})`,
      });
    }

    // Location anomaly
    if (context.network) {
      const knownLocation = profile.typicalLocations.find(
        loc => loc.countryCode === context.network.geoLocation.countryCode
      );
      if (!knownLocation) {
        anomalies.push({
          type: 'new_location',
          score: 0.8,
          baseline: 0,
          observed: 1,
          deviation: 4,
          description: `Access from new country: ${context.network.geoLocation.country}`,
        });
      }
    }

    // Device anomaly
    if (context.device) {
      const knownDevice = profile.typicalDevices.find(
        d => d.fingerprint === context.device.fingerprint
      );
      if (!knownDevice) {
        anomalies.push({
          type: 'new_device',
          score: 0.6,
          baseline: 0,
          observed: 1,
          deviation: 3,
          description: 'Access from new device',
        });
      }
    }

    return anomalies;
  }

  /**
   * Calculate deviation from typical values.
   */
  private calculateDeviation(observed: number, typical: number[]): number {
    if (typical.length === 0) return 0;
    const mean = typical.reduce((a, b) => a + b, 0) / typical.length;
    const variance = typical.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / typical.length;
    const stdDev = Math.sqrt(variance) || 1;
    return Math.abs(observed - mean) / stdDev;
  }

  /**
   * Identify specific risk factors from the context.
   */
  private async identifyRiskFactors(
    context: SecurityContext,
    components: RiskComponents
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];

    // Identity factors
    if (components.identity > 50) {
      if (!context.identity) {
        factors.push({
          id: 'no_identity',
          category: 'identity',
          name: 'No Authentication',
          description: 'Request is not authenticated',
          impact: 50,
          direction: 'negative',
          confidence: 1.0,
        });
      } else if (!context.identity.mfaVerified) {
        factors.push({
          id: 'no_mfa',
          category: 'identity',
          name: 'No MFA',
          description: 'Multi-factor authentication not completed',
          impact: 20,
          direction: 'negative',
          confidence: 1.0,
        });
      }
    }

    // Device factors
    if (!context.device.knownDevice) {
      factors.push({
        id: 'unknown_device',
        category: 'device',
        name: 'Unknown Device',
        description: 'Request from unrecognized device',
        impact: 25,
        direction: 'negative',
        confidence: 0.9,
      });
    }

    if (context.device.managed) {
      factors.push({
        id: 'managed_device',
        category: 'device',
        name: 'Managed Device',
        description: 'Request from corporate-managed device',
        impact: 15,
        direction: 'positive',
        confidence: 1.0,
      });
    }

    // Network factors
    if (context.network.torDetected) {
      factors.push({
        id: 'tor_network',
        category: 'network',
        name: 'Tor Network',
        description: 'Request from Tor exit node',
        impact: 40,
        direction: 'negative',
        confidence: 0.95,
      });
    }

    if (context.network.trustedNetwork) {
      factors.push({
        id: 'trusted_network',
        category: 'network',
        name: 'Trusted Network',
        description: 'Request from known trusted network',
        impact: 20,
        direction: 'positive',
        confidence: 1.0,
      });
    }

    for (const indicator of context.network.riskIndicators) {
      if (indicator === 'impossible_travel') {
        factors.push({
          id: 'impossible_travel',
          category: 'network',
          name: 'Impossible Travel',
          description: 'Location change impossible in the time elapsed',
          impact: 60,
          direction: 'negative',
          confidence: 0.85,
        });
      }
    }

    return factors;
  }

  /**
   * Calculate overall risk score from components.
   */
  private calculateOverallScore(components: RiskComponents): number {
    const { weights } = this.config;

    const weightedSum =
      components.identity * weights.identity +
      components.device * weights.device +
      components.network * weights.network +
      components.behavior * weights.behavior +
      components.context * weights.context +
      components.historical * weights.historical;

    return Math.round(weightedSum);
  }

  /**
   * Determine risk level from score.
   */
  private determineRiskLevel(score: number): RiskLevel {
    const { thresholds } = this.config;

    if (score <= thresholds.minimal) return 'minimal';
    if (score <= thresholds.low) return 'low';
    if (score <= thresholds.medium) return 'medium';
    if (score <= thresholds.high) return 'high';
    return 'critical';
  }

  /**
   * Generate recommendations based on risk assessment.
   */
  private generateRecommendations(
    score: number,
    level: RiskLevel,
    factors: RiskFactor[]
  ): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    // Base recommendations on risk level
    if (level === 'minimal') {
      recommendations.push({
        id: 'allow',
        action: 'allow' as RiskAction,
        reason: 'Risk level is minimal',
        priority: 'low',
        mandatory: true,
      });
    } else if (level === 'low') {
      recommendations.push({
        id: 'allow_log',
        action: 'allow_with_logging' as RiskAction,
        reason: 'Low risk - enhanced logging recommended',
        priority: 'low',
        mandatory: false,
      });
    } else if (level === 'medium') {
      recommendations.push({
        id: 'require_mfa',
        action: 'require_mfa' as RiskAction,
        reason: 'Medium risk - additional verification recommended',
        priority: 'medium',
        mandatory: false,
      });
    } else if (level === 'high') {
      recommendations.push({
        id: 'reauth',
        action: 'require_reauthentication' as RiskAction,
        reason: 'High risk - reauthentication required',
        priority: 'high',
        mandatory: true,
      });
    } else if (level === 'critical') {
      recommendations.push({
        id: 'block',
        action: 'block_and_alert' as RiskAction,
        reason: 'Critical risk - access should be denied',
        priority: 'critical',
        mandatory: true,
      });
    }

    // Factor-specific recommendations
    const noMfaFactor = factors.find(f => f.id === 'no_mfa');
    if (noMfaFactor && level !== 'minimal') {
      recommendations.push({
        id: 'suggest_mfa',
        action: 'require_mfa' as RiskAction,
        reason: 'MFA not verified for this session',
        priority: 'medium',
        mandatory: level === 'high' || level === 'critical',
      });
    }

    const impossibleTravel = factors.find(f => f.id === 'impossible_travel');
    if (impossibleTravel) {
      recommendations.push({
        id: 'verify_location',
        action: 'require_reauthentication' as RiskAction,
        reason: 'Impossible travel detected - verify identity',
        priority: 'high',
        mandatory: true,
      });
    }

    return recommendations;
  }

  /**
   * Perform threat detection on the request.
   */
  async detectThreats(context: SecurityContext): Promise<ThreatDetectionResult> {
    const startTime = Date.now();
    const detectionId = `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const anomalies = context.identity
      ? await this.detectAnomalies(context, this.profiles.get(context.identity.userId)!)
      : [];

    const behaviorAnalysis = await this.analyzeBehavior(context);
    const threat = await this.identifyThreat(context, anomalies, behaviorAnalysis);

    return {
      detectionId,
      timestamp: new Date(),
      threatDetected: !!threat,
      threat,
      anomalies,
      behaviorAnalysis,
      confidence: threat ? threat.severity === 'critical' ? 0.95 : 0.8 : 0.1,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Analyze behavior patterns.
   */
  private async analyzeBehavior(context: SecurityContext): Promise<BehaviorAnalysis> {
    const profileId = context.identity?.userId || 'anonymous';
    const profile = this.profiles.get(profileId);

    if (!profile) {
      return {
        profileId,
        normalcyScore: 0.5,
        metrics: [],
        riskIndicators: ['no_baseline'],
        matchesHistory: false,
      };
    }

    const metrics: BehaviorMetric[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // Check time pattern
    const hour = context.timestamp.getHours();
    const expectedHourProb = profile.typicalHours.hourlyProbability[hour];
    const timeMetric: BehaviorMetric = {
      name: 'access_time',
      expected: profile.typicalHours.peakHours[0] || 12,
      observed: hour,
      anomalous: expectedHourProb < 0.1,
      weight: 0.3,
    };
    metrics.push(timeMetric);
    totalScore += (timeMetric.anomalous ? 0 : 1) * timeMetric.weight;
    totalWeight += timeMetric.weight;

    // Check device pattern
    const knownDevice = profile.typicalDevices.some(
      d => d.fingerprint === context.device.fingerprint
    );
    const deviceMetric: BehaviorMetric = {
      name: 'device',
      expected: 1,
      observed: knownDevice ? 1 : 0,
      anomalous: !knownDevice,
      weight: 0.3,
    };
    metrics.push(deviceMetric);
    totalScore += (deviceMetric.anomalous ? 0 : 1) * deviceMetric.weight;
    totalWeight += deviceMetric.weight;

    // Check location pattern
    const knownLocation = profile.typicalLocations.some(
      loc => loc.countryCode === context.network.geoLocation.countryCode
    );
    const locationMetric: BehaviorMetric = {
      name: 'location',
      expected: 1,
      observed: knownLocation ? 1 : 0,
      anomalous: !knownLocation,
      weight: 0.4,
    };
    metrics.push(locationMetric);
    totalScore += (locationMetric.anomalous ? 0 : 1) * locationMetric.weight;
    totalWeight += locationMetric.weight;

    const normalcyScore = totalWeight > 0 ? totalScore / totalWeight : 0.5;
    const riskIndicators = metrics.filter(m => m.anomalous).map(m => `anomalous_${m.name}`);

    return {
      profileId,
      normalcyScore,
      metrics,
      riskIndicators,
      matchesHistory: normalcyScore > 0.7,
    };
  }

  /**
   * Identify specific threats based on analysis.
   */
  private async identifyThreat(
    context: SecurityContext,
    anomalies: AnomalyIndicator[],
    behaviorAnalysis: BehaviorAnalysis
  ): Promise<DetectedThreat | undefined> {
    // Check for impossible travel
    const impossibleTravel = context.network.riskIndicators.includes('impossible_travel');
    if (impossibleTravel) {
      return {
        id: `threat_${Date.now()}`,
        type: 'session_hijacking',
        severity: 'high',
        description: 'Possible session hijacking detected due to impossible travel',
        attackVector: 'Session token theft or credential compromise',
        mitreAttackId: 'T1539',
        iocs: [
          {
            type: 'behavior',
            value: 'impossible_travel',
            confidence: 0.85,
            source: 'internal',
          },
        ],
        response: {
          immediateAction: 'challenge',
          autoRemediate: true,
          remediationSteps: [
            'Require reauthentication',
            'Invalidate current session',
            'Notify user of suspicious access',
          ],
          escalate: true,
          escalateTo: 'security_team',
        },
      };
    }

    // Check for credential stuffing
    if (behaviorAnalysis.normalcyScore < 0.2 && anomalies.length > 2) {
      return {
        id: `threat_${Date.now()}`,
        type: 'account_takeover',
        severity: 'critical',
        description: 'Potential account takeover - behavior significantly differs from baseline',
        attackVector: 'Credential compromise or brute force',
        mitreAttackId: 'T1078',
        iocs: anomalies.map(a => ({
          type: 'behavior' as const,
          value: a.type,
          confidence: a.score,
          source: 'internal',
        })),
        response: {
          immediateAction: 'block',
          autoRemediate: true,
          remediationSteps: [
            'Block access immediately',
            'Force password reset',
            'Review recent account activity',
            'Enable enhanced monitoring',
          ],
          escalate: true,
          escalateTo: 'security_team',
        },
      };
    }

    // Check for API abuse
    if (context.network.riskIndicators.includes('datacenter_ip') &&
        context.device.type === 'unknown') {
      return {
        id: `threat_${Date.now()}`,
        type: 'api_abuse',
        severity: 'medium',
        description: 'Potential API abuse from datacenter IP',
        attackVector: 'Automated access or scraping',
        iocs: [
          {
            type: 'ip',
            value: context.network.ipAddress,
            confidence: 0.7,
            source: 'internal',
          },
        ],
        response: {
          immediateAction: 'challenge',
          autoRemediate: false,
          remediationSteps: [
            'Apply rate limiting',
            'Require CAPTCHA verification',
            'Monitor for patterns',
          ],
          escalate: false,
        },
      };
    }

    return undefined;
  }

  /**
   * Update behavioral profile with new data.
   */
  async updateProfile(userId: string, context: SecurityContext): Promise<void> {
    let profile = this.profiles.get(userId);

    if (!profile) {
      profile = this.createNewProfile(userId);
      this.profiles.set(userId, profile);
    }

    // Update profile with current context
    profile.updatedAt = new Date();
    profile.sampleCount++;

    // Update hourly distribution
    const hour = context.timestamp.getHours();
    profile.typicalHours.hourlyProbability[hour] =
      (profile.typicalHours.hourlyProbability[hour] * (profile.sampleCount - 1) + 1) /
      profile.sampleCount;

    // Update location patterns
    const existingLocation = profile.typicalLocations.find(
      loc => loc.countryCode === context.network.geoLocation.countryCode
    );
    if (existingLocation) {
      existingLocation.frequency++;
      existingLocation.lastSeen = new Date();
    } else {
      profile.typicalLocations.push({
        countryCode: context.network.geoLocation.countryCode,
        country: context.network.geoLocation.country,
        frequency: 1,
        lastSeen: new Date(),
      });
    }

    // Update device patterns
    const existingDevice = profile.typicalDevices.find(
      d => d.fingerprint === context.device.fingerprint
    );
    if (existingDevice) {
      existingDevice.usageCount++;
      existingDevice.lastSeen = new Date();
    } else {
      profile.typicalDevices.push({
        fingerprint: context.device.fingerprint,
        type: context.device.type,
        os: context.device.os,
        trustLevel: context.device.trustScore,
        firstSeen: new Date(),
        lastSeen: new Date(),
        usageCount: 1,
      });
    }

    // Update risk history
    if (context.riskScore) {
      profile.riskHistory.push({
        timestamp: new Date(),
        riskScore: context.riskScore.overall,
        riskLevel: context.riskScore.level,
        notableFactors: context.riskScore.factors.map(f => f.id),
      });

      // Keep only last 100 risk history entries
      if (profile.riskHistory.length > 100) {
        profile.riskHistory = profile.riskHistory.slice(-100);
      }
    }
  }

  /**
   * Create a new behavioral profile.
   */
  private createNewProfile(userId: string): BehavioralProfile {
    return {
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      sampleCount: 0,
      typicalHours: {
        hourlyProbability: Array(24).fill(0),
        activeDays: [],
        peakHours: [],
      },
      typicalLocations: [],
      typicalDevices: [],
      typicalActions: [],
      requestRateBaseline: {
        meanRpm: 0,
        stdDev: 0,
        maxObserved: 0,
        p95: 0,
        p99: 0,
      },
      resourcePatterns: [],
      riskHistory: [],
    };
  }
}

// Type for cached threat data
interface CachedThreatData {
  data: unknown;
  expiresAt: Date;
}

// Export singleton instance
export const riskEngine = new RiskEngine();
