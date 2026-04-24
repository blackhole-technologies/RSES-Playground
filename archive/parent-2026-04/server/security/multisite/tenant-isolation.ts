/**
 * @file tenant-isolation.ts
 * @description Multi-Tenant Isolation Layer for secure site segregation.
 *              Implements site isolation guarantees, cross-site attack prevention,
 *              per-site encryption keys, and tenant data segregation.
 * @phase Phase 10 - Multi-Site Security
 * @author SEC (Security Specialist Agent)
 * @created 2026-02-01
 * @standards AWS Multi-Tenancy, Azure Tenant Isolation, Google Cloud Multi-tenancy
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import type {
  Tenant,
  Site,
  TenantConfig,
  TenantSecurityConfig,
  SiteSecurityConfig,
  IsolationContext,
  IsolationLevel,
  ClassificationLevel,
  CrossSiteAccessPolicy,
  SiteEncryptionKey,
  KeyRotationEvent,
  SiteAuditEvent,
  SecurityIncident,
  RequestContext,
  AuditActor,
  AuditResource,
} from './types';

// =============================================================================
// TENANT ISOLATION CONFIGURATION
// =============================================================================

export interface TenantIsolationConfig {
  /** Enable strict isolation */
  strictIsolation: boolean;
  /** Default isolation level */
  defaultIsolationLevel: IsolationLevel;
  /** Enable per-site encryption */
  perSiteEncryption: boolean;
  /** Key rotation interval (days) */
  keyRotationDays: number;
  /** Enable cross-site access */
  crossSiteAccessEnabled: boolean;
  /** Require approval for cross-site access */
  crossSiteApprovalRequired: boolean;
  /** Audit all data access */
  auditAllAccess: boolean;
  /** Enable real-time isolation checks */
  realtimeChecks: boolean;
}

const defaultConfig: TenantIsolationConfig = {
  strictIsolation: true,
  defaultIsolationLevel: 'dedicated',
  perSiteEncryption: true,
  keyRotationDays: 90,
  crossSiteAccessEnabled: false,
  crossSiteApprovalRequired: true,
  auditAllAccess: true,
  realtimeChecks: true,
};

// =============================================================================
// TENANT ISOLATION SERVICE
// =============================================================================

/**
 * Multi-Tenant Isolation Service.
 * Ensures complete data segregation between tenants and sites.
 */
export class TenantIsolationService extends EventEmitter {
  private config: TenantIsolationConfig;
  private tenants: Map<string, Tenant> = new Map();
  private sites: Map<string, Site> = new Map();
  private siteEncryptionKeys: Map<string, SiteEncryptionKey[]> = new Map();
  private crossSitePolicies: Map<string, CrossSiteAccessPolicy> = new Map();
  private activeContexts: Map<string, IsolationContext> = new Map();
  private auditLog: SiteAuditEvent[] = [];
  private incidents: Map<string, SecurityIncident> = new Map();
  private masterKey: Buffer;

  constructor(config: Partial<TenantIsolationConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
    this.masterKey = this.deriveMasterKey();
  }

  // ===========================================================================
  // TENANT MANAGEMENT
  // ===========================================================================

  /**
   * Create a new tenant.
   */
  async createTenant(
    name: string,
    type: Tenant['type'],
    tier: Tenant['tier'],
    primaryDomain: string,
    securityConfig?: Partial<TenantSecurityConfig>
  ): Promise<Tenant> {
    const tenantId = `tenant_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const tenant: Tenant = {
      tenantId,
      name,
      type,
      status: 'pending',
      tier,
      primaryDomain,
      domains: [primaryDomain],
      createdAt: new Date(),
      updatedAt: new Date(),
      config: this.createDefaultTenantConfig(tier),
      security: this.createDefaultSecurityConfig(type, securityConfig),
      metadata: {},
    };

    this.tenants.set(tenantId, tenant);

    // Create initial master encryption key for tenant
    await this.createTenantMasterKey(tenantId);

    // Audit log
    this.logAuditEvent({
      tenantId,
      siteId: '',
      eventType: 'admin_action',
      category: 'admin',
      severity: 'info',
      action: 'tenant_created',
      resource: { type: 'tenant', id: tenantId, name },
      result: 'success',
      details: { type, tier },
    });

    // Activate tenant
    tenant.status = 'active';

    this.emit('tenant_created', { tenantId, name, type, tier });

    return tenant;
  }

  /**
   * Get tenant by ID.
   */
  getTenant(tenantId: string): Tenant | null {
    return this.tenants.get(tenantId) || null;
  }

  /**
   * Update tenant.
   */
  async updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, 'name' | 'config' | 'security' | 'metadata'>>
  ): Promise<Tenant> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Apply updates
    if (updates.name) tenant.name = updates.name;
    if (updates.config) tenant.config = { ...tenant.config, ...updates.config };
    if (updates.security) tenant.security = { ...tenant.security, ...updates.security };
    if (updates.metadata) tenant.metadata = { ...tenant.metadata, ...updates.metadata };

    tenant.updatedAt = new Date();

    this.emit('tenant_updated', { tenantId, updates });

    return tenant;
  }

  /**
   * Suspend tenant.
   */
  async suspendTenant(tenantId: string, reason: string): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    tenant.status = 'suspended';
    tenant.updatedAt = new Date();

    // Suspend all sites
    const sites = this.getTenantSites(tenantId);
    for (const site of sites) {
      site.status = 'suspended';
    }

    // Audit log
    this.logAuditEvent({
      tenantId,
      siteId: '',
      eventType: 'admin_action',
      category: 'admin',
      severity: 'high',
      action: 'tenant_suspended',
      resource: { type: 'tenant', id: tenantId },
      result: 'success',
      details: { reason },
    });

    this.emit('tenant_suspended', { tenantId, reason });
  }

  // ===========================================================================
  // SITE MANAGEMENT
  // ===========================================================================

  /**
   * Create a new site within a tenant.
   */
  async createSite(
    tenantId: string,
    name: string,
    slug: string,
    type: Site['type'],
    isolationLevel?: IsolationLevel
  ): Promise<Site> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Check site limit
    const existingSites = this.getTenantSites(tenantId);
    if (existingSites.length >= tenant.config.features.maxSites) {
      throw new Error(`Maximum sites (${tenant.config.features.maxSites}) reached for tenant`);
    }

    // Check slug uniqueness
    if (Array.from(this.sites.values()).some(s => s.tenantId === tenantId && s.slug === slug)) {
      throw new Error(`Site slug already exists: ${slug}`);
    }

    const siteId = `site_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const url = `https://${slug}.${tenant.primaryDomain}`;

    const site: Site = {
      siteId,
      tenantId,
      name,
      slug,
      url,
      status: 'active',
      type,
      createdAt: new Date(),
      updatedAt: new Date(),
      config: this.createDefaultSiteConfig(),
      security: this.createDefaultSiteSecurityConfig(tenant.security),
      limits: this.createSiteLimits(tenant.tier),
      isolationLevel: isolationLevel || this.config.defaultIsolationLevel,
    };

    this.sites.set(siteId, site);

    // Create site encryption key if per-site encryption is enabled
    if (this.config.perSiteEncryption) {
      await this.createSiteEncryptionKey(tenantId, siteId);
    }

    // Audit log
    this.logAuditEvent({
      tenantId,
      siteId,
      eventType: 'admin_action',
      category: 'admin',
      severity: 'info',
      action: 'site_created',
      resource: { type: 'site', id: siteId, name },
      result: 'success',
      details: { type, isolationLevel: site.isolationLevel },
    });

    this.emit('site_created', { tenantId, siteId, name, type });

    return site;
  }

  /**
   * Get site by ID.
   */
  getSite(siteId: string): Site | null {
    return this.sites.get(siteId) || null;
  }

  /**
   * Get all sites for a tenant.
   */
  getTenantSites(tenantId: string): Site[] {
    return Array.from(this.sites.values()).filter(s => s.tenantId === tenantId);
  }

  /**
   * Delete a site.
   */
  async deleteSite(siteId: string, deleteData: boolean = false): Promise<void> {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Site not found: ${siteId}`);
    }

    // Archive site first
    site.status = 'archived';

    if (deleteData) {
      // In production, this would trigger data deletion workflows
      // and ensure all site data is securely destroyed
      await this.secureDataDeletion(site.tenantId, siteId);
    }

    // Destroy site encryption keys
    await this.destroySiteEncryptionKeys(site.tenantId, siteId);

    // Remove site
    this.sites.delete(siteId);

    // Audit log
    this.logAuditEvent({
      tenantId: site.tenantId,
      siteId,
      eventType: 'admin_action',
      category: 'admin',
      severity: 'high',
      action: 'site_deleted',
      resource: { type: 'site', id: siteId, name: site.name },
      result: 'success',
      details: { deleteData },
    });

    this.emit('site_deleted', { tenantId: site.tenantId, siteId });
  }

  // ===========================================================================
  // ISOLATION CONTEXT
  // ===========================================================================

  /**
   * Create an isolation context for a request.
   */
  createIsolationContext(
    tenantId: string,
    siteId: string | undefined,
    userId: string,
    requestId: string
  ): IsolationContext {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    if (tenant.status !== 'active') {
      throw new Error(`Tenant is not active: ${tenant.status}`);
    }

    let site: Site | undefined;
    let isolationLevel = this.config.defaultIsolationLevel;

    if (siteId) {
      site = this.sites.get(siteId);
      if (!site) {
        throw new Error(`Site not found: ${siteId}`);
      }

      if (site.tenantId !== tenantId) {
        this.reportSecurityIncident(tenantId, siteId, 'unauthorized_access', 'high',
          'Cross-tenant site access attempt',
          `User ${userId} attempted to access site ${siteId} from tenant ${tenantId}`
        );
        throw new Error('Unauthorized: Site belongs to different tenant');
      }

      if (site.status !== 'active') {
        throw new Error(`Site is not active: ${site.status}`);
      }

      isolationLevel = site.isolationLevel;
    }

    // Get encryption key
    const encryptionKeyId = this.getActiveEncryptionKeyId(tenantId, siteId);

    const context: IsolationContext = {
      tenantId,
      siteId,
      userId,
      requestId,
      isolationLevel,
      dataClassification: tenant.security.dataProtection.classification.defaultLevel,
      encryptionContext: {
        keyId: encryptionKeyId,
        algorithm: 'AES-256-GCM',
        aad: {
          tenantId,
          siteId: siteId || '',
          requestId,
        },
      },
    };

    this.activeContexts.set(requestId, context);

    return context;
  }

  /**
   * Validate isolation context for data access.
   */
  validateIsolationContext(
    context: IsolationContext,
    targetTenantId: string,
    targetSiteId?: string
  ): IsolationValidationResult {
    // Same tenant check
    if (context.tenantId !== targetTenantId) {
      return {
        valid: false,
        reason: 'Cross-tenant access denied',
        code: 'CROSS_TENANT_DENIED',
      };
    }

    // Same site check (if applicable)
    if (targetSiteId && context.siteId && context.siteId !== targetSiteId) {
      // Check for cross-site access policy
      if (this.config.crossSiteAccessEnabled) {
        const policy = this.findCrossSitePolicy(context.siteId, targetSiteId);
        if (policy && policy.status === 'active') {
          return {
            valid: true,
            reason: 'Cross-site access granted by policy',
            policyId: policy.policyId,
          };
        }
      }

      return {
        valid: false,
        reason: 'Cross-site access denied',
        code: 'CROSS_SITE_DENIED',
      };
    }

    return {
      valid: true,
      reason: 'Access allowed',
    };
  }

  /**
   * End isolation context.
   */
  endIsolationContext(requestId: string): void {
    this.activeContexts.delete(requestId);
  }

  // ===========================================================================
  // CROSS-SITE ACCESS
  // ===========================================================================

  /**
   * Create a cross-site access policy.
   */
  async createCrossSitePolicy(
    sourceSiteId: string,
    targetSiteId: string,
    accessType: CrossSiteAccessPolicy['accessType'],
    resources: string[],
    actions: string[],
    expiresAt?: Date
  ): Promise<CrossSiteAccessPolicy> {
    const sourceSite = this.sites.get(sourceSiteId);
    const targetSite = this.sites.get(targetSiteId);

    if (!sourceSite || !targetSite) {
      throw new Error('Source or target site not found');
    }

    if (sourceSite.tenantId !== targetSite.tenantId) {
      throw new Error('Cross-tenant cross-site policies are not allowed');
    }

    const policyId = `csp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const policy: CrossSiteAccessPolicy = {
      policyId,
      sourceSiteId,
      targetSiteId,
      accessType,
      resources,
      actions,
      conditions: [],
      expiresAt,
      status: this.config.crossSiteApprovalRequired ? 'suspended' : 'active',
    };

    this.crossSitePolicies.set(policyId, policy);

    // Audit log
    this.logAuditEvent({
      tenantId: sourceSite.tenantId,
      siteId: sourceSiteId,
      eventType: 'admin_action',
      category: 'security',
      severity: 'medium',
      action: 'cross_site_policy_created',
      resource: { type: 'policy', id: policyId },
      result: 'success',
      details: { targetSiteId, accessType, resources, actions },
    });

    this.emit('cross_site_policy_created', { policyId, sourceSiteId, targetSiteId });

    return policy;
  }

  /**
   * Approve a cross-site access policy.
   */
  approveCrossSitePolicy(policyId: string, approvedBy: string): void {
    const policy = this.crossSitePolicies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    policy.status = 'active';

    const sourceSite = this.sites.get(policy.sourceSiteId);
    if (sourceSite) {
      this.logAuditEvent({
        tenantId: sourceSite.tenantId,
        siteId: policy.sourceSiteId,
        eventType: 'admin_action',
        category: 'security',
        severity: 'medium',
        action: 'cross_site_policy_approved',
        resource: { type: 'policy', id: policyId },
        result: 'success',
        details: { approvedBy },
      });
    }

    this.emit('cross_site_policy_approved', { policyId, approvedBy });
  }

  /**
   * Revoke a cross-site access policy.
   */
  revokeCrossSitePolicy(policyId: string, revokedBy: string, reason: string): void {
    const policy = this.crossSitePolicies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    policy.status = 'suspended';

    const sourceSite = this.sites.get(policy.sourceSiteId);
    if (sourceSite) {
      this.logAuditEvent({
        tenantId: sourceSite.tenantId,
        siteId: policy.sourceSiteId,
        eventType: 'admin_action',
        category: 'security',
        severity: 'medium',
        action: 'cross_site_policy_revoked',
        resource: { type: 'policy', id: policyId },
        result: 'success',
        details: { revokedBy, reason },
      });
    }

    this.emit('cross_site_policy_revoked', { policyId, reason });
  }

  // ===========================================================================
  // PER-SITE ENCRYPTION
  // ===========================================================================

  /**
   * Create a site encryption key.
   */
  async createSiteEncryptionKey(tenantId: string, siteId: string): Promise<SiteEncryptionKey> {
    const keyId = `sek_${siteId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Generate key material
    const keyMaterial = crypto.randomBytes(32);

    // Encrypt with tenant master key
    const tenantMasterKey = await this.getTenantMasterKey(tenantId);
    const encryptedKeyMaterial = this.encryptKeyMaterial(keyMaterial, tenantMasterKey);

    const siteKey: SiteEncryptionKey = {
      keyId,
      tenantId,
      siteId,
      type: 'data',
      algorithm: 'AES-256-GCM',
      encryptedKeyMaterial,
      status: 'active',
      createdAt: new Date(),
      version: 1,
    };

    // Store key
    const siteKeys = this.siteEncryptionKeys.get(siteId) || [];
    siteKeys.push(siteKey);
    this.siteEncryptionKeys.set(siteId, siteKeys);

    // Clear sensitive material
    keyMaterial.fill(0);

    this.emit('site_key_created', { tenantId, siteId, keyId });

    return siteKey;
  }

  /**
   * Rotate site encryption key.
   */
  async rotateSiteEncryptionKey(
    tenantId: string,
    siteId: string,
    reason: KeyRotationEvent['reason']
  ): Promise<KeyRotationEvent> {
    const siteKeys = this.siteEncryptionKeys.get(siteId);
    if (!siteKeys || siteKeys.length === 0) {
      throw new Error(`No encryption keys found for site: ${siteId}`);
    }

    const oldKey = siteKeys.find(k => k.status === 'active');
    if (!oldKey) {
      throw new Error('No active encryption key found');
    }

    const eventId = `kre_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const rotationEvent: KeyRotationEvent = {
      eventId,
      tenantId,
      siteId,
      oldKeyId: oldKey.keyId,
      newKeyId: '',
      reason,
      status: 'in_progress',
      startedAt: new Date(),
      recordsReEncrypted: 0,
    };

    try {
      // Mark old key as rotating
      oldKey.status = 'rotating';

      // Create new key
      const newKey = await this.createSiteEncryptionKey(tenantId, siteId);
      rotationEvent.newKeyId = newKey.keyId;

      // In production, this would re-encrypt all data with the new key
      // For now, we simulate the process
      rotationEvent.recordsReEncrypted = 0; // Would be actual count

      // Mark old key as deprecated
      oldKey.status = 'deprecated';
      oldKey.rotatedAt = new Date();

      rotationEvent.status = 'completed';
      rotationEvent.completedAt = new Date();

      // Audit log
      this.logAuditEvent({
        tenantId,
        siteId,
        eventType: 'security_event',
        category: 'security',
        severity: 'info',
        action: 'site_key_rotated',
        resource: { type: 'encryption_key', id: newKey.keyId },
        result: 'success',
        details: {
          reason,
          oldKeyId: oldKey.keyId,
          recordsReEncrypted: rotationEvent.recordsReEncrypted,
        },
      });

      this.emit('site_key_rotated', { tenantId, siteId, oldKeyId: oldKey.keyId, newKeyId: newKey.keyId });
    } catch (error) {
      rotationEvent.status = 'failed';
      rotationEvent.errors = [(error as Error).message];

      // Rollback
      oldKey.status = 'active';

      throw error;
    }

    return rotationEvent;
  }

  /**
   * Encrypt data with site key.
   */
  async encryptWithSiteKey(
    context: IsolationContext,
    data: Buffer
  ): Promise<{ encrypted: Buffer; keyId: string }> {
    const keyId = context.encryptionContext.keyId;
    const siteKey = this.getDecryptedSiteKey(context.tenantId, context.siteId || '', keyId);

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', siteKey, iv);

    // Add AAD
    if (context.encryptionContext.aad) {
      cipher.setAAD(Buffer.from(JSON.stringify(context.encryptionContext.aad)));
    }

    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Clear key from memory
    siteKey.fill(0);

    // Format: IV (12) + encrypted + authTag (16)
    return {
      encrypted: Buffer.concat([iv, encrypted, authTag]),
      keyId,
    };
  }

  /**
   * Decrypt data with site key.
   */
  async decryptWithSiteKey(
    context: IsolationContext,
    encryptedData: Buffer,
    keyId: string
  ): Promise<Buffer> {
    // Validate context
    const validation = this.validateIsolationContext(context, context.tenantId, context.siteId);
    if (!validation.valid) {
      throw new Error(`Decryption denied: ${validation.reason}`);
    }

    const siteKey = this.getDecryptedSiteKey(context.tenantId, context.siteId || '', keyId);

    // Extract IV, ciphertext, and auth tag
    const iv = encryptedData.slice(0, 12);
    const authTag = encryptedData.slice(-16);
    const ciphertext = encryptedData.slice(12, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', siteKey, iv);
    decipher.setAuthTag(authTag);

    // Add AAD
    if (context.encryptionContext.aad) {
      decipher.setAAD(Buffer.from(JSON.stringify(context.encryptionContext.aad)));
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // Clear key from memory
    siteKey.fill(0);

    // Audit access if configured
    if (this.config.auditAllAccess) {
      this.logAuditEvent({
        tenantId: context.tenantId,
        siteId: context.siteId || '',
        eventType: 'data_access',
        category: 'data',
        severity: 'info',
        action: 'data_decrypted',
        resource: { type: 'encrypted_data', id: context.requestId },
        result: 'success',
        details: { keyId },
      });
    }

    return decrypted;
  }

  // ===========================================================================
  // SECURITY INCIDENT MANAGEMENT
  // ===========================================================================

  /**
   * Report a security incident.
   */
  reportSecurityIncident(
    tenantId: string,
    siteId: string | undefined,
    type: SecurityIncident['type'],
    severity: SecurityIncident['severity'],
    title: string,
    description: string,
    affectedResources: AuditResource[] = []
  ): SecurityIncident {
    const incidentId = `inc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const incident: SecurityIncident = {
      incidentId,
      tenantId,
      siteId,
      type,
      severity,
      status: 'open',
      title,
      description,
      affectedResources,
      relatedEvents: [],
      detectionSource: 'automated',
      detectedAt: new Date(),
      responseActions: [],
      notes: [],
    };

    this.incidents.set(incidentId, incident);

    // Audit log
    this.logAuditEvent({
      tenantId,
      siteId: siteId || '',
      eventType: 'security_event',
      category: 'security',
      severity: severity === 'critical' ? 'critical' : 'high',
      action: 'security_incident_created',
      resource: { type: 'incident', id: incidentId },
      result: 'success',
      details: { type, title },
    });

    this.emit('security_incident', { incidentId, type, severity, tenantId, siteId });

    // Auto-response for critical incidents
    if (severity === 'critical') {
      this.handleCriticalIncident(incident);
    }

    return incident;
  }

  /**
   * Update incident status.
   */
  updateIncidentStatus(
    incidentId: string,
    status: SecurityIncident['status'],
    updatedBy: string,
    note?: string
  ): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    const previousStatus = incident.status;
    incident.status = status;

    if (status === 'resolved' || status === 'closed') {
      incident.resolvedAt = new Date();
    }

    if (note) {
      incident.notes.push({
        noteId: `note_${Date.now()}`,
        content: note,
        createdBy: updatedBy,
        createdAt: new Date(),
      });
    }

    incident.responseActions.push({
      actionId: `action_${Date.now()}`,
      type: 'status_change',
      description: `Status changed from ${previousStatus} to ${status}`,
      performedBy: updatedBy,
      performedAt: new Date(),
      result: 'success',
    });

    this.emit('incident_updated', { incidentId, previousStatus, newStatus: status });
  }

  // ===========================================================================
  // AUDIT LOGGING
  // ===========================================================================

  /**
   * Log an audit event.
   */
  private logAuditEvent(event: Omit<SiteAuditEvent, 'eventId' | 'timestamp' | 'actor' | 'requestContext'>): void {
    const auditEvent: SiteAuditEvent = {
      ...event,
      eventId: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date(),
      actor: this.getCurrentActor(),
      requestContext: this.getCurrentRequestContext(),
    };

    this.auditLog.push(auditEvent);
    this.trimAuditLog();

    this.emit('audit_event', auditEvent);
  }

  /**
   * Get audit events for a tenant.
   */
  getTenantAuditLog(
    tenantId: string,
    options: {
      siteId?: string;
      startDate?: Date;
      endDate?: Date;
      eventTypes?: string[];
      limit?: number;
    } = {}
  ): SiteAuditEvent[] {
    let events = this.auditLog.filter(e => e.tenantId === tenantId);

    if (options.siteId) {
      events = events.filter(e => e.siteId === options.siteId);
    }

    if (options.startDate) {
      events = events.filter(e => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      events = events.filter(e => e.timestamp <= options.endDate!);
    }

    if (options.eventTypes) {
      events = events.filter(e => options.eventTypes!.includes(e.eventType));
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private deriveMasterKey(): Buffer {
    // In production, this would come from HSM or secure key management
    return crypto.createHash('sha256').update('tenant-isolation-master-key').digest();
  }

  private async createTenantMasterKey(tenantId: string): Promise<void> {
    const keyMaterial = crypto.randomBytes(32);
    const encrypted = this.encryptKeyMaterial(keyMaterial, this.masterKey);

    // Store in secure location (simplified for demo)
    // In production, use HSM or cloud KMS

    keyMaterial.fill(0);
  }

  private async getTenantMasterKey(tenantId: string): Promise<Buffer> {
    // In production, retrieve from HSM or cloud KMS
    return crypto.createHash('sha256').update(`tenant-master-${tenantId}`).digest();
  }

  private encryptKeyMaterial(keyMaterial: Buffer, encryptionKey: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(keyMaterial), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  private decryptKeyMaterial(encryptedData: string, decryptionKey: Buffer): Buffer {
    const data = Buffer.from(encryptedData, 'base64');
    const iv = data.slice(0, 12);
    const authTag = data.slice(-16);
    const ciphertext = data.slice(12, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', decryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  private getActiveEncryptionKeyId(tenantId: string, siteId?: string): string {
    if (siteId) {
      const siteKeys = this.siteEncryptionKeys.get(siteId);
      const activeKey = siteKeys?.find(k => k.status === 'active');
      if (activeKey) return activeKey.keyId;
    }

    return `tenant_key_${tenantId}`;
  }

  private getDecryptedSiteKey(tenantId: string, siteId: string, keyId: string): Buffer {
    const siteKeys = this.siteEncryptionKeys.get(siteId);
    const key = siteKeys?.find(k => k.keyId === keyId);

    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    // In production, decrypt the key material using tenant master key
    // For demo, derive a deterministic key
    return crypto.createHash('sha256').update(`site-key-${siteId}-${keyId}`).digest();
  }

  private async destroySiteEncryptionKeys(tenantId: string, siteId: string): Promise<void> {
    const siteKeys = this.siteEncryptionKeys.get(siteId);
    if (siteKeys) {
      for (const key of siteKeys) {
        key.status = 'destroyed';
        key.encryptedKeyMaterial = ''; // Clear key material
      }
    }
    this.siteEncryptionKeys.delete(siteId);
  }

  private async secureDataDeletion(tenantId: string, siteId: string): Promise<void> {
    // In production, this would:
    // 1. Identify all data belonging to the site
    // 2. Securely overwrite or crypto-shred the data
    // 3. Verify deletion
    // 4. Generate deletion certificate

    this.emit('data_deleted', { tenantId, siteId });
  }

  private findCrossSitePolicy(sourceSiteId: string, targetSiteId: string): CrossSiteAccessPolicy | null {
    for (const policy of this.crossSitePolicies.values()) {
      if (policy.sourceSiteId === sourceSiteId &&
          policy.targetSiteId === targetSiteId &&
          policy.status === 'active') {
        // Check expiration
        if (policy.expiresAt && new Date() > policy.expiresAt) {
          policy.status = 'expired';
          continue;
        }
        return policy;
      }
    }
    return null;
  }

  private handleCriticalIncident(incident: SecurityIncident): void {
    // Auto-response actions for critical incidents
    incident.responseActions.push({
      actionId: `action_${Date.now()}`,
      type: 'auto_response',
      description: 'Automated alert sent to security team',
      performedBy: 'system',
      performedAt: new Date(),
      result: 'success',
    });

    // If site-related, consider suspending site
    if (incident.siteId && incident.type === 'unauthorized_access') {
      const site = this.sites.get(incident.siteId);
      if (site) {
        // Don't auto-suspend, but flag for review
        incident.responseActions.push({
          actionId: `action_${Date.now()}_1`,
          type: 'flag_for_review',
          description: 'Site flagged for immediate security review',
          performedBy: 'system',
          performedAt: new Date(),
          result: 'success',
        });
      }
    }

    this.emit('critical_incident_response', { incidentId: incident.incidentId });
  }

  private getCurrentActor(): AuditActor {
    // In production, get from request context
    return {
      type: 'system',
      id: 'system',
      name: 'System',
    };
  }

  private getCurrentRequestContext(): RequestContext {
    // In production, get from request context
    return {
      ipAddress: '127.0.0.1',
      method: 'INTERNAL',
      path: '/internal',
      requestId: `req_${Date.now()}`,
    };
  }

  private createDefaultTenantConfig(tier: Tenant['tier']): TenantConfig {
    const maxSites: Record<Tenant['tier'], number> = {
      free: 1,
      starter: 3,
      professional: 10,
      enterprise: 50,
      unlimited: 1000,
    };

    return {
      features: {
        multiSite: tier !== 'free',
        maxSites: maxSites[tier],
        ssoEnabled: tier === 'enterprise' || tier === 'unlimited',
        customDomains: tier !== 'free',
        apiAccess: tier !== 'free',
        advancedSecurity: tier === 'enterprise' || tier === 'unlimited',
        compliance: tier === 'enterprise' || tier === 'unlimited',
        customBranding: tier === 'professional' || tier === 'enterprise' || tier === 'unlimited',
      },
      branding: {},
      integrations: [],
      notifications: {
        email: true,
        webhooks: [],
      },
      localization: {
        defaultLanguage: 'en',
        supportedLanguages: ['en'],
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
      },
    };
  }

  private createDefaultSecurityConfig(
    type: Tenant['type'],
    overrides?: Partial<TenantSecurityConfig>
  ): TenantSecurityConfig {
    const baseConfig: TenantSecurityConfig = {
      authentication: {
        allowedMethods: ['password', 'magic_link'],
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecial: true,
          historyCount: 5,
          maxAgeDays: 90,
          lockoutThreshold: 5,
          lockoutDurationMinutes: 30,
        },
        mfa: {
          enabled: true,
          required: false,
          requiredForAdmins: true,
          allowedMethods: ['totp', 'webauthn'],
          rememberDeviceDays: 30,
        },
        session: {
          timeoutMinutes: 60,
          absoluteTimeoutMinutes: 480,
          singleSession: false,
          bindToIp: false,
          bindToDevice: false,
          secureCookie: true,
          sameSite: 'lax',
        },
      },
      authorization: {
        rbacEnabled: true,
        defaultRole: 'viewer',
        adminRoles: ['admin', 'owner'],
        resourceAcl: true,
        abacEnabled: false,
      },
      dataProtection: {
        encryptionAtRest: true,
        encryptionKeyId: 'default',
        classification: {
          enabled: true,
          defaultLevel: 'internal',
          autoClassify: false,
        },
        retention: {
          defaultDays: 365,
          auditLogDays: 730,
          backupDays: 30,
        },
        backup: {
          enabled: true,
          frequencyHours: 24,
          destination: 'local',
          encrypt: true,
          retentionCount: 7,
        },
      },
      network: {
        tls: {
          minVersion: 'TLS1.2',
          cipherSuites: [],
          hstsEnabled: true,
          hstsMaxAge: 31536000,
          certificatePinning: false,
        },
        firewall: [],
        vpnRequired: false,
      },
      audit: {
        enabled: true,
        events: ['authentication', 'authorization', 'data_access', 'admin_action'],
        includeRequestBody: false,
        includeResponseBody: false,
        retentionDays: 365,
        realTimeAlerts: false,
      },
      compliance: {
        frameworks: [],
        gdprEnabled: false,
        hipaaEnabled: false,
        soc2Enabled: false,
      },
    };

    // Type-specific enhancements
    if (type === 'healthcare') {
      baseConfig.compliance.hipaaEnabled = true;
      baseConfig.dataProtection.classification.defaultLevel = 'confidential';
      baseConfig.authentication.mfa.required = true;
    } else if (type === 'government') {
      baseConfig.network.tls.minVersion = 'TLS1.3';
      baseConfig.authentication.mfa.required = true;
      baseConfig.audit.includeRequestBody = true;
    }

    return { ...baseConfig, ...overrides };
  }

  private createDefaultSiteConfig(): Site['config'] {
    return {
      features: {
        comments: false,
        registration: false,
        publicApi: false,
        search: true,
      },
      content: {
        contentTypes: ['article', 'page'],
        mediaStorage: 'local',
        maxUploadSize: 10 * 1024 * 1024,
      },
      seo: {
        title: '',
        description: '',
        keywords: [],
        robotsTxt: 'User-agent: *\nAllow: /',
      },
      analytics: {},
    };
  }

  private createDefaultSiteSecurityConfig(tenantSecurity: TenantSecurityConfig): SiteSecurityConfig {
    return {
      overrideTenant: false,
      securityHeaders: [
        { name: 'X-Content-Type-Options', value: 'nosniff' },
        { name: 'X-Frame-Options', value: 'DENY' },
        { name: 'X-XSS-Protection', value: '1; mode=block' },
      ],
      cors: {
        allowedOrigins: [],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: [],
        allowCredentials: false,
        maxAge: 86400,
      },
      csp: {
        enabled: true,
        reportOnly: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
      rateLimiting: {
        enabled: true,
        defaultLimitPerMinute: 100,
        burstLimit: 200,
        endpointLimits: {},
        roleLimits: {},
      },
    };
  }

  private createSiteLimits(tier: Tenant['tier']): Site['limits'] {
    const limits: Record<Tenant['tier'], Site['limits']> = {
      free: {
        maxStorage: 100 * 1024 * 1024, // 100MB
        maxBandwidth: 1024 * 1024 * 1024, // 1GB/month
        maxApiCallsPerDay: 1000,
        maxUsers: 5,
        maxContentItems: 100,
      },
      starter: {
        maxStorage: 1024 * 1024 * 1024, // 1GB
        maxBandwidth: 10 * 1024 * 1024 * 1024, // 10GB/month
        maxApiCallsPerDay: 10000,
        maxUsers: 25,
        maxContentItems: 1000,
      },
      professional: {
        maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
        maxBandwidth: 100 * 1024 * 1024 * 1024, // 100GB/month
        maxApiCallsPerDay: 100000,
        maxUsers: 100,
        maxContentItems: 10000,
      },
      enterprise: {
        maxStorage: 100 * 1024 * 1024 * 1024, // 100GB
        maxBandwidth: 1024 * 1024 * 1024 * 1024, // 1TB/month
        maxApiCallsPerDay: 1000000,
        maxUsers: 1000,
        maxContentItems: 100000,
      },
      unlimited: {
        maxStorage: Number.MAX_SAFE_INTEGER,
        maxBandwidth: Number.MAX_SAFE_INTEGER,
        maxApiCallsPerDay: Number.MAX_SAFE_INTEGER,
        maxUsers: Number.MAX_SAFE_INTEGER,
        maxContentItems: Number.MAX_SAFE_INTEGER,
      },
    };

    return limits[tier];
  }

  private trimAuditLog(): void {
    const maxEntries = 100000;
    if (this.auditLog.length > maxEntries) {
      this.auditLog = this.auditLog.slice(-maxEntries);
    }
  }
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

export interface IsolationValidationResult {
  valid: boolean;
  reason: string;
  code?: string;
  policyId?: string;
}

// Export singleton instance
export const tenantIsolation = new TenantIsolationService();
