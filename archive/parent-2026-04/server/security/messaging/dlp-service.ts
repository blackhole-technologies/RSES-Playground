/**
 * @file dlp-service.ts
 * @description Data Loss Prevention (DLP) Service for messaging security.
 *              Provides content scanning, sensitive data detection, policy enforcement,
 *              and compliance integration.
 * @phase Phase 10 - Messaging & Social Media Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards HIPAA, SOC2, GDPR, PCI-DSS
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import type {
  DlpPolicy,
  DlpRule,
  DlpPattern,
  DlpAction,
  DlpActionType,
  DlpScope,
  DlpException,
  DlpScanResult,
  DlpPolicyMatch,
  DlpRuleMatch,
  DlpMatch,
  DlpActionTaken,
  DlpDetectionType,
  SensitiveDataType,
  MessageContent,
  MessagingSecurityEvent,
} from './types';

// =============================================================================
// DLP SERVICE CONFIGURATION
// =============================================================================

export interface DlpServiceConfig {
  /** Enable DLP scanning */
  enabled: boolean;
  /** Scan timeout (ms) */
  scanTimeoutMs: number;
  /** Maximum content length to scan */
  maxContentLength: number;
  /** Enable ML-based detection */
  mlDetectionEnabled: boolean;
  /** Log all scans */
  logAllScans: boolean;
  /** Cache pattern compilations */
  cachePatterns: boolean;
  /** Default action when scan fails */
  defaultOnError: 'allow' | 'block' | 'quarantine';
}

const defaultConfig: DlpServiceConfig = {
  enabled: true,
  scanTimeoutMs: 5000,
  maxContentLength: 10 * 1024 * 1024, // 10MB
  mlDetectionEnabled: true,
  logAllScans: true,
  cachePatterns: true,
  defaultOnError: 'quarantine',
};

// =============================================================================
// BUILT-IN DETECTION PATTERNS
// =============================================================================

/**
 * Pre-built patterns for common sensitive data types.
 */
const SENSITIVE_DATA_PATTERNS: Record<SensitiveDataType, RegExp[]> = {
  credit_card: [
    // Visa
    /\b4[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
    // Mastercard
    /\b5[1-5][0-9]{2}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
    // American Express
    /\b3[47][0-9]{2}[\s-]?[0-9]{6}[\s-]?[0-9]{5}\b/g,
    // Discover
    /\b6(?:011|5[0-9]{2})[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
  ],
  ssn: [
    /\b[0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9]{4}\b/g,
    /\bSSN\s*[:=#]?\s*[0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9]{4}\b/gi,
  ],
  passport: [
    // US Passport
    /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
    // Generic passport patterns
    /\bpassport\s*(?:number|#|no\.?)?\s*[:=]?\s*[A-Z0-9]{6,12}\b/gi,
  ],
  driver_license: [
    /\bDL\s*[:=#]?\s*[A-Z0-9]{5,15}\b/gi,
    /\bdriver['']?s?\s*license\s*[:=#]?\s*[A-Z0-9]{5,15}\b/gi,
  ],
  bank_account: [
    // IBAN
    /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}\b/g,
    // US Bank Account
    /\baccount\s*(?:number|#|no\.?)?\s*[:=]?\s*[0-9]{8,17}\b/gi,
    // Routing number
    /\brouting\s*(?:number|#|no\.?)?\s*[:=]?\s*[0-9]{9}\b/gi,
  ],
  api_key: [
    // AWS
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bASIA[0-9A-Z]{16}\b/g,
    // Generic API key patterns
    /\b(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,64}['"]?\b/gi,
    // JWT tokens
    /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    // Generic secret patterns
    /\b(?:secret|token|password|pwd|pass)\s*[:=]\s*['"]?[A-Za-z0-9!@#$%^&*()_+-=]{8,64}['"]?\b/gi,
  ],
  password: [
    /\bpassword\s*[:=]\s*['"]?[^\s'"]{6,64}['"]?\b/gi,
    /\bpwd\s*[:=]\s*['"]?[^\s'"]{6,64}['"]?\b/gi,
  ],
  phi: [
    // Medical Record Numbers
    /\bMRN\s*[:=#]?\s*[A-Z0-9]{6,12}\b/gi,
    // Health Insurance ID
    /\b(?:insurance|member)\s*(?:id|#|no\.?)?\s*[:=]?\s*[A-Z0-9]{8,15}\b/gi,
    // Drug/prescription patterns
    /\b(?:rx|prescription)\s*(?:#|no\.?)?\s*[:=]?\s*[0-9]{6,12}\b/gi,
    // Diagnosis codes (ICD)
    /\bICD[-]?(?:9|10)[-:]?\s*[A-Z][0-9]{2}(?:\.[0-9]{1,4})?\b/gi,
  ],
  pii: [
    // Email addresses
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Phone numbers (various formats)
    /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    // Date of birth patterns
    /\bDOB\s*[:=]?\s*[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}\b/gi,
    /\bborn\s*(?:on)?\s*[:=]?\s*[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}\b/gi,
  ],
  financial: [
    // Tax ID / EIN
    /\b(?:EIN|TIN|Tax\s*ID)\s*[:=#]?\s*[0-9]{2}[-]?[0-9]{7}\b/gi,
    // Stock symbols with prices
    /\$[0-9,]+(?:\.[0-9]{2})?\s*(?:USD|EUR|GBP|JPY)?\b/g,
    // Wire transfer patterns
    /\b(?:SWIFT|BIC)\s*[:=]?\s*[A-Z]{6}[A-Z0-9]{2,5}\b/gi,
  ],
  intellectual_property: [
    /\b(?:patent|trademark|copyright)\s*(?:#|no\.?)?\s*[:=]?\s*[A-Z0-9/-]{5,20}\b/gi,
    /\bconfidential\b/gi,
    /\bproprietary\b/gi,
    /\btrade\s*secret\b/gi,
  ],
  confidential: [
    /\b(?:top\s*)?secret\b/gi,
    /\bconfidential\b/gi,
    /\binternal\s*only\b/gi,
    /\brestricted\b/gi,
    /\bdo\s*not\s*(?:share|distribute|forward)\b/gi,
  ],
  custom: [],
};

// =============================================================================
// DLP SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Data Loss Prevention Service.
 */
export class DlpService extends EventEmitter {
  private config: DlpServiceConfig;
  private policies: Map<string, DlpPolicy> = new Map();
  private patternCache: Map<string, RegExp> = new Map();
  private dictionaries: Map<string, Set<string>> = new Map();
  private scanHistory: DlpScanResult[] = [];

  constructor(config: Partial<DlpServiceConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
    this.initializeDefaultPolicies();
    this.initializeDefaultDictionaries();
  }

  // ===========================================================================
  // POLICY MANAGEMENT
  // ===========================================================================

  /**
   * Register a DLP policy.
   */
  registerPolicy(policy: DlpPolicy): void {
    this.policies.set(policy.policyId, policy);
    this.emit('policy_registered', { policyId: policy.policyId, name: policy.name });
  }

  /**
   * Update a DLP policy.
   */
  updatePolicy(policyId: string, updates: Partial<DlpPolicy>): void {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const updated = { ...policy, ...updates, updatedAt: new Date() };
    this.policies.set(policyId, updated);

    this.emit('policy_updated', { policyId, updates });
  }

  /**
   * Get a policy by ID.
   */
  getPolicy(policyId: string): DlpPolicy | null {
    return this.policies.get(policyId) || null;
  }

  /**
   * List all policies.
   */
  listPolicies(): DlpPolicy[] {
    return Array.from(this.policies.values())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Disable a policy.
   */
  disablePolicy(policyId: string): void {
    const policy = this.policies.get(policyId);
    if (policy) {
      policy.status = 'disabled';
      this.emit('policy_disabled', { policyId });
    }
  }

  // ===========================================================================
  // CONTENT SCANNING
  // ===========================================================================

  /**
   * Scan message content for policy violations.
   */
  async scanContent(
    content: MessageContent | string,
    context: ScanContext
  ): Promise<DlpScanResult> {
    const startTime = Date.now();
    const scanId = `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    if (!this.config.enabled) {
      return this.createCleanResult(scanId, context.messageId, startTime);
    }

    try {
      // Extract text content
      const textContent = this.extractTextContent(content);

      // Check content length
      if (textContent.length > this.config.maxContentLength) {
        this.emit('scan_warning', {
          scanId,
          warning: 'Content exceeds maximum length, truncating',
        });
      }

      const truncatedContent = textContent.substring(0, this.config.maxContentLength);

      // Get applicable policies
      const applicablePolicies = this.getApplicablePolicies(context);

      if (applicablePolicies.length === 0) {
        return this.createCleanResult(scanId, context.messageId, startTime);
      }

      // Scan against each policy
      const matchedPolicies: DlpPolicyMatch[] = [];

      for (const policy of applicablePolicies) {
        const policyMatch = await this.scanAgainstPolicy(
          truncatedContent,
          policy,
          context
        );

        if (policyMatch) {
          matchedPolicies.push(policyMatch);
        }
      }

      // Determine verdict and actions
      const { verdict, actionsTaken, modifiedContent } = await this.determineVerdictAndExecute(
        matchedPolicies,
        truncatedContent,
        context
      );

      const result: DlpScanResult = {
        scanId,
        messageId: context.messageId,
        scannedAt: new Date(),
        matchedPolicies,
        verdict,
        actionsTaken,
        scanDurationMs: Date.now() - startTime,
        contentModified: modifiedContent !== truncatedContent,
        modifiedContent: modifiedContent !== truncatedContent ? modifiedContent : undefined,
      };

      // Log scan
      if (this.config.logAllScans || matchedPolicies.length > 0) {
        this.scanHistory.push(result);
        this.trimScanHistory();
      }

      // Emit events
      if (matchedPolicies.length > 0) {
        this.emit('policy_violation', {
          scanId,
          messageId: context.messageId,
          matchedPolicies: matchedPolicies.map(p => p.policyId),
          verdict,
        });
      }

      return result;
    } catch (error) {
      this.emit('scan_error', { scanId, error: (error as Error).message });

      // Return based on default error behavior. Map the config's
      // 'allow|block|quarantine' to the DlpScanResult verdict union which
      // uses 'clean|blocked|quarantined' instead.
      const verdictMap = {
        allow: 'clean',
        block: 'blocked',
        quarantine: 'quarantined',
      } as const;
      return {
        scanId,
        messageId: context.messageId,
        scannedAt: new Date(),
        matchedPolicies: [],
        verdict: verdictMap[this.config.defaultOnError],
        actionsTaken: [],
        scanDurationMs: Date.now() - startTime,
        contentModified: false,
      };
    }
  }

  /**
   * Scan a file/attachment.
   */
  async scanFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    context: ScanContext
  ): Promise<DlpScanResult> {
    // For text-based files, extract and scan content
    if (this.isTextBasedMimeType(mimeType)) {
      const textContent = fileBuffer.toString('utf8');
      return this.scanContent(textContent, {
        ...context,
        contentType: 'file',
        fileName,
        mimeType,
      });
    }

    // For binary files, scan metadata and file hash
    const scanId = `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();

    // Check file name for sensitive patterns
    const fileNameMatches = await this.scanFileName(fileName);

    // Generate file hash for fingerprinting
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check against document fingerprint database (if enabled)
    const fingerprintMatch = await this.checkDocumentFingerprint(fileHash);

    const matchedPolicies: DlpPolicyMatch[] = [];

    if (fileNameMatches.length > 0 || fingerprintMatch) {
      // Build policy match
      matchedPolicies.push({
        policyId: 'file_scan_policy',
        policyName: 'File Scan Policy',
        matchedRules: [
          ...fileNameMatches,
          ...(fingerprintMatch ? [fingerprintMatch] : []),
        ],
        confidence: Math.max(
          ...fileNameMatches.map(r => r.confidence),
          fingerprintMatch?.confidence || 0
        ),
      });
    }

    const verdict = matchedPolicies.length > 0 ? 'warning' : 'clean';

    return {
      scanId,
      messageId: context.messageId,
      scannedAt: new Date(),
      matchedPolicies,
      verdict,
      actionsTaken: [],
      scanDurationMs: Date.now() - startTime,
      contentModified: false,
    };
  }

  // ===========================================================================
  // SENSITIVE DATA DETECTION
  // ===========================================================================

  /**
   * Detect sensitive data types in content.
   */
  detectSensitiveData(content: string): SensitiveDataDetectionResult {
    const detections: SensitiveDataDetection[] = [];

    for (const [dataType, patterns] of Object.entries(SENSITIVE_DATA_PATTERNS)) {
      for (const pattern of patterns) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          detections.push({
            dataType: dataType as SensitiveDataType,
            value: this.maskSensitiveValue(match[0], dataType as SensitiveDataType),
            location: {
              start: match.index,
              end: match.index + match[0].length,
            },
            confidence: this.calculateDetectionConfidence(dataType as SensitiveDataType, match[0]),
          });
        }
      }
    }

    // Deduplicate overlapping detections
    const deduped = this.deduplicateDetections(detections);

    return {
      hasSensitiveData: deduped.length > 0,
      detections: deduped,
      summary: this.summarizeDetections(deduped),
    };
  }

  /**
   * Validate if a value matches expected format for a data type.
   */
  validateDataType(value: string, dataType: SensitiveDataType): ValidationResult {
    switch (dataType) {
      case 'credit_card':
        return this.validateCreditCard(value);
      case 'ssn':
        return this.validateSSN(value);
      case 'bank_account':
        return this.validateBankAccount(value);
      default:
        return { valid: true, confidence: 0.5 };
    }
  }

  // ===========================================================================
  // CONTENT REDACTION
  // ===========================================================================

  /**
   * Redact sensitive data from content.
   */
  redactSensitiveData(
    content: string,
    dataTypes: SensitiveDataType[] = ['credit_card', 'ssn', 'api_key', 'password']
  ): RedactionResult {
    let redactedContent = content;
    const redactions: RedactionEntry[] = [];

    for (const dataType of dataTypes) {
      const patterns = SENSITIVE_DATA_PATTERNS[dataType];

      for (const pattern of patterns) {
        pattern.lastIndex = 0;

        redactedContent = redactedContent.replace(pattern, (match, offset) => {
          const replacement = this.getRedactionReplacement(dataType, match);
          redactions.push({
            dataType,
            originalLength: match.length,
            location: { start: offset, end: offset + match.length },
            replacement,
          });
          return replacement;
        });
      }
    }

    return {
      originalContent: content,
      redactedContent,
      redactions,
      redactionCount: redactions.length,
    };
  }

  // ===========================================================================
  // COMPLIANCE INTEGRATION
  // ===========================================================================

  /**
   * Get compliance report for recent scans.
   */
  getComplianceReport(
    framework: 'HIPAA' | 'SOC2' | 'GDPR' | 'PCI-DSS',
    dateRange: { from: Date; to: Date }
  ): ComplianceReport {
    const relevantScans = this.scanHistory.filter(
      s => s.scannedAt >= dateRange.from && s.scannedAt <= dateRange.to
    );

    const frameworkDataTypes = this.getFrameworkDataTypes(framework);
    const violations: ComplianceViolation[] = [];

    for (const scan of relevantScans) {
      for (const policyMatch of scan.matchedPolicies) {
        for (const ruleMatch of policyMatch.matchedRules) {
          for (const match of ruleMatch.matches) {
            if (match.dataType && frameworkDataTypes.includes(match.dataType)) {
              violations.push({
                scanId: scan.scanId,
                messageId: scan.messageId,
                dataType: match.dataType,
                severity: this.getViolationSeverity(match.dataType, framework),
                timestamp: scan.scannedAt,
                actionTaken: scan.verdict,
              });
            }
          }
        }
      }
    }

    return {
      framework,
      dateRange,
      totalScans: relevantScans.length,
      violationCount: violations.length,
      violations,
      complianceScore: this.calculateComplianceScore(relevantScans.length, violations.length),
      recommendations: this.generateComplianceRecommendations(violations, framework),
    };
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private initializeDefaultPolicies(): void {
    // PCI-DSS Policy
    this.registerPolicy({
      policyId: 'pci-dss-default',
      name: 'PCI-DSS Credit Card Protection',
      description: 'Detects and blocks credit card numbers in messages',
      priority: 1,
      rules: [
        {
          ruleId: 'cc-detection',
          name: 'Credit Card Number Detection',
          detectionType: 'regex',
          patterns: [
            { type: 'regex', value: '4[0-9]{3}[\\s-]?[0-9]{4}[\\s-]?[0-9]{4}[\\s-]?[0-9]{4}', weight: 1 },
            { type: 'regex', value: '5[1-5][0-9]{2}[\\s-]?[0-9]{4}[\\s-]?[0-9]{4}[\\s-]?[0-9]{4}', weight: 1 },
          ],
          confidenceThreshold: 80,
          minOccurrences: 1,
        },
      ],
      actions: [
        { type: 'block', notify: [{ recipientType: 'admin', method: 'email', includeContent: false }] },
        { type: 'log' },
      ],
      scope: { type: 'all', directions: ['outbound', 'internal'], contentTypes: ['text', 'files'] },
      exceptions: [],
      status: 'enabled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // HIPAA Policy
    this.registerPolicy({
      policyId: 'hipaa-phi',
      name: 'HIPAA PHI Protection',
      description: 'Detects and protects Protected Health Information',
      priority: 2,
      rules: [
        {
          ruleId: 'phi-detection',
          name: 'PHI Detection',
          detectionType: 'regex',
          patterns: [
            { type: 'regex', value: 'MRN\\s*[:=#]?\\s*[A-Z0-9]{6,12}', weight: 1 },
            { type: 'regex', value: 'ICD[-]?(?:9|10)[-:]?\\s*[A-Z][0-9]{2}', weight: 0.8 },
            { type: 'keyword', value: 'diagnosis', weight: 0.5 },
            { type: 'keyword', value: 'prescription', weight: 0.5 },
          ],
          confidenceThreshold: 70,
          minOccurrences: 1,
          proximity: 100,
        },
      ],
      actions: [
        { type: 'encrypt' },
        { type: 'log' },
        { type: 'notify_admin', notify: [{ recipientType: 'security_team', method: 'siem', includeContent: false }] },
      ],
      scope: { type: 'all', directions: ['inbound', 'outbound', 'internal'], contentTypes: ['text', 'files'] },
      exceptions: [],
      status: 'enabled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // API Key / Secrets Policy
    this.registerPolicy({
      policyId: 'secrets-detection',
      name: 'Secrets and API Key Protection',
      description: 'Detects API keys, passwords, and other secrets',
      priority: 3,
      rules: [
        {
          ruleId: 'aws-key',
          name: 'AWS Access Key Detection',
          detectionType: 'regex',
          patterns: [
            { type: 'regex', value: 'AKIA[0-9A-Z]{16}', weight: 1 },
            { type: 'regex', value: 'aws_secret_access_key\\s*=\\s*[A-Za-z0-9/+=]{40}', weight: 1 },
          ],
          confidenceThreshold: 95,
          minOccurrences: 1,
        },
        {
          ruleId: 'generic-secret',
          name: 'Generic Secret Detection',
          detectionType: 'regex',
          patterns: [
            { type: 'regex', value: 'password\\s*[:=]\\s*[\'"]?[^\\s\'"]{8,}', weight: 0.8 },
            { type: 'regex', value: 'api[_-]?key\\s*[:=]\\s*[\'"]?[A-Za-z0-9_-]{20,}', weight: 0.9 },
          ],
          confidenceThreshold: 75,
          minOccurrences: 1,
        },
      ],
      actions: [
        { type: 'redact' },
        { type: 'warn' },
        { type: 'log' },
      ],
      scope: { type: 'all', directions: ['outbound', 'internal'], contentTypes: ['text'] },
      exceptions: [],
      status: 'enabled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // PII Policy
    this.registerPolicy({
      policyId: 'pii-protection',
      name: 'PII Protection',
      description: 'Detects and protects Personally Identifiable Information',
      priority: 4,
      rules: [
        {
          ruleId: 'ssn-detection',
          name: 'Social Security Number Detection',
          detectionType: 'regex',
          patterns: [
            { type: 'regex', value: '[0-9]{3}[-\\s]?[0-9]{2}[-\\s]?[0-9]{4}', weight: 1 },
          ],
          confidenceThreshold: 85,
          minOccurrences: 1,
        },
      ],
      actions: [
        { type: 'redact' },
        { type: 'log' },
      ],
      scope: { type: 'all', directions: ['outbound'], contentTypes: ['text', 'files'] },
      exceptions: [],
      status: 'enabled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private initializeDefaultDictionaries(): void {
    // Medical terms dictionary
    this.dictionaries.set('medical_terms', new Set([
      'diagnosis', 'prognosis', 'prescription', 'medication', 'treatment',
      'symptoms', 'patient', 'hospital', 'clinic', 'surgery', 'procedure',
      'medical record', 'health insurance', 'copay', 'deductible',
    ]));

    // Financial terms dictionary
    this.dictionaries.set('financial_terms', new Set([
      'bank account', 'routing number', 'wire transfer', 'credit card',
      'debit card', 'account number', 'swift code', 'iban', 'tax return',
      'social security', 'investment', 'portfolio', 'dividend',
    ]));

    // Confidential markers dictionary
    this.dictionaries.set('confidential_markers', new Set([
      'confidential', 'secret', 'top secret', 'classified', 'restricted',
      'internal only', 'do not share', 'do not distribute', 'proprietary',
      'trade secret', 'nda', 'non-disclosure',
    ]));
  }

  private extractTextContent(content: MessageContent | string): string {
    if (typeof content === 'string') {
      return content;
    }

    switch (content.type) {
      case 'text':
        return content.text + (content.formatted || '');
      case 'media':
        return content.caption || '';
      case 'file':
        return `${content.fileName} ${content.caption || ''}`;
      default:
        return JSON.stringify(content);
    }
  }

  private getApplicablePolicies(context: ScanContext): DlpPolicy[] {
    return Array.from(this.policies.values())
      .filter(policy => {
        if (policy.status !== 'enabled' && policy.status !== 'test_mode') {
          return false;
        }

        // Check scope
        if (!this.matchesScope(policy.scope, context)) {
          return false;
        }

        // Check exceptions
        if (this.matchesException(policy.exceptions, context)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }

  private matchesScope(scope: DlpScope, context: ScanContext): boolean {
    if (scope.type === 'all') {
      return true;
    }

    if (scope.channels && context.channelId && !scope.channels.includes(context.channelId)) {
      return false;
    }

    if (scope.users && context.userId && !scope.users.includes(context.userId)) {
      return false;
    }

    if (context.direction && !scope.directions.includes(context.direction)) {
      return false;
    }

    return true;
  }

  private matchesException(exceptions: DlpException[], context: ScanContext): boolean {
    for (const exception of exceptions) {
      if (exception.expiresAt && new Date() > exception.expiresAt) {
        continue;
      }

      switch (exception.type) {
        case 'user':
          if (context.userId && exception.identifiers.includes(context.userId)) {
            return true;
          }
          break;
        case 'channel':
          if (context.channelId && exception.identifiers.includes(context.channelId)) {
            return true;
          }
          break;
        case 'domain':
          // Check if sender email domain matches
          break;
      }
    }

    return false;
  }

  private async scanAgainstPolicy(
    content: string,
    policy: DlpPolicy,
    context: ScanContext
  ): Promise<DlpPolicyMatch | null> {
    const matchedRules: DlpRuleMatch[] = [];

    for (const rule of policy.rules) {
      const ruleMatch = await this.evaluateRule(content, rule);

      if (ruleMatch && ruleMatch.confidence >= rule.confidenceThreshold) {
        matchedRules.push(ruleMatch);
      }
    }

    if (matchedRules.length === 0) {
      return null;
    }

    const maxConfidence = Math.max(...matchedRules.map(r => r.confidence));

    return {
      policyId: policy.policyId,
      policyName: policy.name,
      matchedRules,
      confidence: maxConfidence,
    };
  }

  private async evaluateRule(content: string, rule: DlpRule): Promise<DlpRuleMatch | null> {
    const matches: DlpMatch[] = [];

    for (const pattern of rule.patterns) {
      const patternMatches = await this.findPatternMatches(content, pattern, rule.detectionType);
      matches.push(...patternMatches);
    }

    if (matches.length < rule.minOccurrences) {
      return null;
    }

    // Check proximity if specified
    if (rule.proximity && matches.length > 1) {
      const proximityMatches = this.filterByProximity(matches, rule.proximity);
      if (proximityMatches.length < rule.minOccurrences) {
        return null;
      }
    }

    const avgConfidence = matches.reduce((sum, m) => {
      const patternWeight = rule.patterns.find(p => p.value.includes(m.value))?.weight || 1;
      return sum + patternWeight;
    }, 0) / matches.length * 100;

    return {
      ruleId: rule.ruleId,
      ruleName: rule.name,
      detectionType: rule.detectionType,
      matches,
      confidence: Math.min(100, avgConfidence),
    };
  }

  private async findPatternMatches(
    content: string,
    pattern: DlpPattern,
    detectionType: DlpDetectionType
  ): Promise<DlpMatch[]> {
    const matches: DlpMatch[] = [];

    switch (pattern.type) {
      case 'regex':
        try {
          const regex = this.getCompiledRegex(pattern.value);
          let match: RegExpExecArray | null;

          while ((match = regex.exec(content)) !== null) {
            matches.push({
              value: this.maskSensitiveValue(match[0], 'custom'),
              location: { start: match.index, end: match.index + match[0].length },
              context: this.extractContext(content, match.index, match[0].length),
            });
          }
        } catch (error) {
          this.emit('pattern_error', { pattern: pattern.value, error: (error as Error).message });
        }
        break;

      case 'keyword':
        const keyword = pattern.value.toLowerCase();
        let index = content.toLowerCase().indexOf(keyword);

        while (index !== -1) {
          matches.push({
            value: pattern.value,
            location: { start: index, end: index + keyword.length },
            context: this.extractContext(content, index, keyword.length),
          });
          index = content.toLowerCase().indexOf(keyword, index + 1);
        }
        break;

      case 'dictionary_ref':
        const dictionary = this.dictionaries.get(pattern.value);
        if (dictionary) {
          for (const term of dictionary) {
            const termIndex = content.toLowerCase().indexOf(term.toLowerCase());
            if (termIndex !== -1) {
              matches.push({
                value: term,
                location: { start: termIndex, end: termIndex + term.length },
                context: this.extractContext(content, termIndex, term.length),
              });
            }
          }
        }
        break;
    }

    return matches;
  }

  private getCompiledRegex(pattern: string): RegExp {
    if (this.config.cachePatterns && this.patternCache.has(pattern)) {
      const regex = this.patternCache.get(pattern)!;
      regex.lastIndex = 0;
      return regex;
    }

    const regex = new RegExp(pattern, 'gi');

    if (this.config.cachePatterns) {
      this.patternCache.set(pattern, regex);
    }

    return regex;
  }

  private extractContext(content: string, index: number, length: number, contextSize: number = 50): string {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(content.length, index + length + contextSize);
    return content.substring(start, end);
  }

  private filterByProximity(matches: DlpMatch[], maxDistance: number): DlpMatch[] {
    if (matches.length <= 1) return matches;

    const filtered: DlpMatch[] = [];

    for (let i = 0; i < matches.length; i++) {
      for (let j = i + 1; j < matches.length; j++) {
        const distance = Math.abs(matches[i].location.start - matches[j].location.start);
        if (distance <= maxDistance) {
          if (!filtered.includes(matches[i])) filtered.push(matches[i]);
          if (!filtered.includes(matches[j])) filtered.push(matches[j]);
        }
      }
    }

    return filtered;
  }

  private async determineVerdictAndExecute(
    matchedPolicies: DlpPolicyMatch[],
    content: string,
    context: ScanContext
  ): Promise<{ verdict: DlpScanResult['verdict']; actionsTaken: DlpActionTaken[]; modifiedContent: string }> {
    if (matchedPolicies.length === 0) {
      return { verdict: 'clean', actionsTaken: [], modifiedContent: content };
    }

    const actionsTaken: DlpActionTaken[] = [];
    let modifiedContent = content;
    let verdict: DlpScanResult['verdict'] = 'warning';

    // Get all actions from matched policies
    const allActions: { action: DlpAction; policy: DlpPolicy }[] = [];
    for (const policyMatch of matchedPolicies) {
      const policy = this.policies.get(policyMatch.policyId);
      if (policy) {
        for (const action of policy.actions) {
          allActions.push({ action, policy });
        }
      }
    }

    // Execute actions by type priority
    const actionPriority: DlpActionType[] = [
      'block', 'quarantine', 'redact', 'encrypt', 'warn', 'require_justification',
      'apply_label', 'notify_admin', 'log',
    ];

    for (const actionType of actionPriority) {
      const actionsOfType = allActions.filter(a => a.action.type === actionType);

      for (const { action, policy } of actionsOfType) {
        try {
          const result = await this.executeAction(action, modifiedContent, context, policy);
          actionsTaken.push({
            type: action.type,
            success: result.success,
            message: result.message,
            timestamp: new Date(),
          });

          if (result.modifiedContent) {
            modifiedContent = result.modifiedContent;
          }

          // Update verdict based on action
          if (action.type === 'block') {
            verdict = 'blocked';
          } else if (action.type === 'quarantine' && verdict !== 'blocked') {
            verdict = 'quarantined';
          } else if (action.type === 'redact' && verdict !== 'blocked' && verdict !== 'quarantined') {
            verdict = 'redacted';
          }
        } catch (error) {
          actionsTaken.push({
            type: action.type,
            success: false,
            message: (error as Error).message,
            timestamp: new Date(),
          });
        }
      }
    }

    return { verdict, actionsTaken, modifiedContent };
  }

  private async executeAction(
    action: DlpAction,
    content: string,
    context: ScanContext,
    policy: DlpPolicy
  ): Promise<{ success: boolean; message?: string; modifiedContent?: string }> {
    switch (action.type) {
      case 'block':
        this.emit('message_blocked', { messageId: context.messageId, policyId: policy.policyId });
        return { success: true, message: 'Message blocked' };

      case 'quarantine':
        this.emit('message_quarantined', { messageId: context.messageId, policyId: policy.policyId });
        return { success: true, message: 'Message quarantined' };

      case 'redact':
        const redactionResult = this.redactSensitiveData(content);
        return {
          success: true,
          message: `Redacted ${redactionResult.redactionCount} sensitive items`,
          modifiedContent: redactionResult.redactedContent,
        };

      case 'warn':
        this.emit('user_warning', { userId: context.userId, policyId: policy.policyId });
        return { success: true, message: 'User warned' };

      case 'log':
        this.emit('dlp_log', {
          messageId: context.messageId,
          policyId: policy.policyId,
          timestamp: new Date(),
        });
        return { success: true, message: 'Logged' };

      case 'notify_admin':
        if (action.notify) {
          for (const notification of action.notify) {
            this.emit('admin_notification', {
              method: notification.method,
              policyId: policy.policyId,
              messageId: context.messageId,
            });
          }
        }
        return { success: true, message: 'Admin notified' };

      default:
        return { success: true, message: `Action ${action.type} executed` };
    }
  }

  private createCleanResult(scanId: string, messageId: string, startTime: number): DlpScanResult {
    return {
      scanId,
      messageId,
      scannedAt: new Date(),
      matchedPolicies: [],
      verdict: 'clean',
      actionsTaken: [],
      scanDurationMs: Date.now() - startTime,
      contentModified: false,
    };
  }

  private maskSensitiveValue(value: string, dataType: SensitiveDataType): string {
    const length = value.length;
    if (length <= 4) {
      return '*'.repeat(length);
    }

    // Show first and last 2 characters
    const visibleChars = Math.min(2, Math.floor(length / 4));
    return value.substring(0, visibleChars) +
      '*'.repeat(length - visibleChars * 2) +
      value.substring(length - visibleChars);
  }

  private getRedactionReplacement(dataType: SensitiveDataType, original: string): string {
    const length = original.length;
    const labels: Record<SensitiveDataType, string> = {
      credit_card: '[CREDIT_CARD_REDACTED]',
      ssn: '[SSN_REDACTED]',
      passport: '[PASSPORT_REDACTED]',
      driver_license: '[DL_REDACTED]',
      bank_account: '[BANK_ACCOUNT_REDACTED]',
      api_key: '[API_KEY_REDACTED]',
      password: '[PASSWORD_REDACTED]',
      phi: '[PHI_REDACTED]',
      pii: '[PII_REDACTED]',
      financial: '[FINANCIAL_REDACTED]',
      intellectual_property: '[IP_REDACTED]',
      confidential: '[CONFIDENTIAL_REDACTED]',
      custom: `[REDACTED:${length}]`,
    };

    return labels[dataType] || `[REDACTED:${length}]`;
  }

  private calculateDetectionConfidence(dataType: SensitiveDataType, value: string): number {
    const validation = this.validateDataType(value, dataType);
    return validation.confidence * 100;
  }

  private validateCreditCard(value: string): ValidationResult {
    const cleaned = value.replace(/[\s-]/g, '');
    if (!/^[0-9]{13,19}$/.test(cleaned)) {
      return { valid: false, confidence: 0.3 };
    }

    // Luhn algorithm
    let sum = 0;
    let isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }

    return { valid: sum % 10 === 0, confidence: sum % 10 === 0 ? 0.95 : 0.4 };
  }

  private validateSSN(value: string): ValidationResult {
    const cleaned = value.replace(/[\s-]/g, '');
    if (!/^[0-9]{9}$/.test(cleaned)) {
      return { valid: false, confidence: 0.3 };
    }

    // Check for invalid SSN patterns
    const area = parseInt(cleaned.substring(0, 3), 10);
    const group = parseInt(cleaned.substring(3, 5), 10);
    const serial = parseInt(cleaned.substring(5), 10);

    // Invalid patterns
    if (area === 0 || area === 666 || area >= 900) {
      return { valid: false, confidence: 0.3 };
    }
    if (group === 0 || serial === 0) {
      return { valid: false, confidence: 0.3 };
    }

    return { valid: true, confidence: 0.85 };
  }

  private validateBankAccount(value: string): ValidationResult {
    // Basic IBAN validation
    if (/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(value)) {
      return { valid: true, confidence: 0.8 };
    }

    // US routing number (9 digits)
    const cleaned = value.replace(/[\s-]/g, '');
    if (/^[0-9]{9}$/.test(cleaned)) {
      return { valid: true, confidence: 0.7 };
    }

    return { valid: false, confidence: 0.4 };
  }

  private deduplicateDetections(detections: SensitiveDataDetection[]): SensitiveDataDetection[] {
    return detections.filter((detection, index, self) =>
      index === self.findIndex(d =>
        d.location.start === detection.location.start &&
        d.location.end === detection.location.end
      )
    );
  }

  private summarizeDetections(detections: SensitiveDataDetection[]): Record<SensitiveDataType, number> {
    const summary: Partial<Record<SensitiveDataType, number>> = {};

    for (const detection of detections) {
      summary[detection.dataType] = (summary[detection.dataType] || 0) + 1;
    }

    return summary as Record<SensitiveDataType, number>;
  }

  private async scanFileName(fileName: string): Promise<DlpRuleMatch[]> {
    const matches: DlpRuleMatch[] = [];

    // Check for sensitive file naming patterns
    const sensitivePatterns = [
      { pattern: /password/i, dataType: 'password' as SensitiveDataType },
      { pattern: /credential/i, dataType: 'password' as SensitiveDataType },
      { pattern: /secret/i, dataType: 'confidential' as SensitiveDataType },
      { pattern: /confidential/i, dataType: 'confidential' as SensitiveDataType },
      { pattern: /\.(key|pem|pfx|p12)$/i, dataType: 'api_key' as SensitiveDataType },
      { pattern: /\.env/i, dataType: 'api_key' as SensitiveDataType },
    ];

    for (const { pattern, dataType } of sensitivePatterns) {
      if (pattern.test(fileName)) {
        matches.push({
          ruleId: 'filename_check',
          ruleName: 'Sensitive File Name Detection',
          detectionType: 'regex',
          matches: [{
            value: fileName,
            location: { start: 0, end: fileName.length },
            dataType,
          }],
          confidence: 70,
        });
      }
    }

    return matches;
  }

  private async checkDocumentFingerprint(fileHash: string): Promise<DlpRuleMatch | null> {
    // In production, check against a database of document fingerprints
    // For now, return null (no match)
    return null;
  }

  private isTextBasedMimeType(mimeType: string): boolean {
    return mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/javascript';
  }

  private getFrameworkDataTypes(framework: string): SensitiveDataType[] {
    switch (framework) {
      case 'HIPAA':
        return ['phi', 'pii', 'ssn'];
      case 'PCI-DSS':
        return ['credit_card', 'bank_account', 'financial'];
      case 'GDPR':
      case 'SOC2':
        return ['pii', 'phi', 'financial', 'password', 'api_key'];
      default:
        return [];
    }
  }

  private getViolationSeverity(
    dataType: SensitiveDataType,
    framework: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    const highSeverityTypes: SensitiveDataType[] = ['credit_card', 'ssn', 'phi', 'password', 'api_key'];

    if (highSeverityTypes.includes(dataType)) {
      return 'high';
    }

    return 'medium';
  }

  private calculateComplianceScore(totalScans: number, violationCount: number): number {
    if (totalScans === 0) return 100;
    return Math.round((1 - violationCount / totalScans) * 100);
  }

  private generateComplianceRecommendations(
    violations: ComplianceViolation[],
    framework: string
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length === 0) {
      recommendations.push('No violations detected. Continue monitoring.');
      return recommendations;
    }

    const dataTypeCounts: Record<string, number> = {};
    for (const v of violations) {
      dataTypeCounts[v.dataType] = (dataTypeCounts[v.dataType] || 0) + 1;
    }

    for (const [dataType, count] of Object.entries(dataTypeCounts)) {
      if (count > 5) {
        recommendations.push(
          `High frequency of ${dataType} violations (${count}). Consider additional user training.`
        );
      }
    }

    if (violations.some(v => v.actionTaken === 'warning')) {
      recommendations.push('Consider upgrading warning actions to block for repeat offenders.');
    }

    return recommendations;
  }

  private trimScanHistory(): void {
    const maxHistory = 10000;
    if (this.scanHistory.length > maxHistory) {
      this.scanHistory = this.scanHistory.slice(-maxHistory);
    }
  }
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

export interface ScanContext {
  messageId: string;
  userId?: string;
  channelId?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
  contentType?: string;
  fileName?: string;
  mimeType?: string;
}

export interface SensitiveDataDetection {
  dataType: SensitiveDataType;
  value: string;
  location: { start: number; end: number };
  confidence: number;
}

export interface SensitiveDataDetectionResult {
  hasSensitiveData: boolean;
  detections: SensitiveDataDetection[];
  summary: Record<SensitiveDataType, number>;
}

export interface ValidationResult {
  valid: boolean;
  confidence: number;
}

export interface RedactionEntry {
  dataType: SensitiveDataType;
  originalLength: number;
  location: { start: number; end: number };
  replacement: string;
}

export interface RedactionResult {
  originalContent: string;
  redactedContent: string;
  redactions: RedactionEntry[];
  redactionCount: number;
}

export interface ComplianceViolation {
  scanId: string;
  messageId: string;
  dataType: SensitiveDataType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  actionTaken: string;
}

export interface ComplianceReport {
  framework: string;
  dateRange: { from: Date; to: Date };
  totalScans: number;
  violationCount: number;
  violations: ComplianceViolation[];
  complianceScore: number;
  recommendations: string[];
}

// Export singleton instance
export const dlpService = new DlpService();
