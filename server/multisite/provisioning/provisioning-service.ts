/**
 * @file provisioning-service.ts
 * @description Automated site provisioning service for multi-site deployment
 * @module multisite/provisioning
 * @author Project Architect Agent
 * @created 2026-02-01
 */

import type {
  ProvisioningRequest,
  ProvisioningStatus,
  ProvisioningStep,
  ProvisioningOverallStatus,
  ProvisioningStepStatus,
  SiteConfig,
  SiteTemplate,
  DomainMapping,
  ShardInfo,
  Result,
} from '../types';
import { ok, err } from '../types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Provisioning service configuration.
 */
export interface ProvisioningConfig {
  /** Maximum concurrent provisioning jobs */
  maxConcurrent: number;

  /** Job timeout in milliseconds */
  jobTimeoutMs: number;

  /** Retry attempts for failed steps */
  maxRetries: number;

  /** Delay between retries in milliseconds */
  retryDelayMs: number;

  /** Queue processing interval in milliseconds */
  queueIntervalMs: number;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: ProvisioningConfig = {
  maxConcurrent: 5,
  jobTimeoutMs: 300000, // 5 minutes
  maxRetries: 3,
  retryDelayMs: 5000,
  queueIntervalMs: 1000,
};

/**
 * Database provisioning result.
 */
export interface DatabaseProvisioningResult {
  shardId: string;
  schemaName: string;
  connectionInfo: {
    host: string;
    port: number;
    database: string;
  };
}

/**
 * DNS setup result.
 */
export interface DNSSetupResult {
  subdomain: string;
  customDomain?: string;
  verificationRequired: boolean;
  records: Array<{
    type: string;
    name: string;
    value: string;
  }>;
}

/**
 * SSL provisioning result.
 */
export interface SSLProvisioningResult {
  certificateId: string;
  domain: string;
  expiresAt: Date;
  status: 'active' | 'pending';
}

// =============================================================================
// DEPENDENCIES
// =============================================================================

/**
 * Network database interface.
 */
export interface NetworkDatabase {
  getNetwork(networkId: string): Promise<Network | null>;
  getSiteCount(networkId: string): Promise<number>;
  getSiteBySlug(slug: string): Promise<SiteConfig | null>;
  createSite(site: Omit<SiteConfig, 'createdAt' | 'updatedAt'>): Promise<SiteConfig>;
  updateSite(siteId: string, updates: Partial<SiteConfig>): Promise<SiteConfig>;
  createProvisioningRequest(request: ProvisioningRequest): Promise<void>;
  updateProvisioningStatus(requestId: string, status: ProvisioningStatus): Promise<void>;
  getProvisioningStatus(requestId: string): Promise<ProvisioningStatus | null>;
  getPendingProvisioningRequests(): Promise<ProvisioningRequest[]>;
}

/**
 * Network type (simplified).
 */
export interface Network {
  id: string;
  name: string;
  quota: {
    maxSites: number;
    maxStorageBytes: number;
  };
  features: {
    customDomains: boolean;
    enterpriseTier: boolean;
  };
}

/**
 * Shard router interface.
 */
export interface ShardRouter {
  assignShard(region: string): Promise<ShardInfo>;
  createSchema(shard: ShardInfo, schemaName: string): Promise<void>;
  runMigrations(shard: ShardInfo, schemaName: string): Promise<void>;
}

/**
 * DNS service interface.
 */
export interface DNSService {
  createSubdomain(slug: string, suffix: string): Promise<string>;
  createVerificationRecord(domain: string, token: string): Promise<void>;
  deleteRecord(name: string, type: string): Promise<void>;
}

/**
 * SSL service interface.
 */
export interface SSLService {
  provisionCertificate(domain: string): Promise<SSLProvisioningResult>;
  scheduleRenewal(certificateId: string, expiresAt: Date): Promise<void>;
}

/**
 * CDN service interface.
 */
export interface CDNService {
  configureSite(siteId: string, domain: string, region: string): Promise<void>;
  purgeSite(siteId: string): Promise<void>;
}

/**
 * Template service interface.
 */
export interface TemplateService {
  getTemplate(templateId: string): Promise<SiteTemplate | null>;
  applyTemplate(siteId: string, template: SiteTemplate): Promise<void>;
}

/**
 * Event bus interface.
 */
export interface EventBus {
  publish(event: { type: string; payload: unknown }): Promise<void>;
}

/**
 * Logger interface.
 */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

// =============================================================================
// PROVISIONING SERVICE
// =============================================================================

/**
 * Site provisioning service.
 * Handles the complete lifecycle of creating a new site.
 */
export class ProvisioningService {
  private readonly config: ProvisioningConfig;
  private readonly networkDb: NetworkDatabase;
  private readonly shardRouter: ShardRouter;
  private readonly dnsService: DNSService;
  private readonly sslService: SSLService;
  private readonly cdnService: CDNService;
  private readonly templateService: TemplateService;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;

  /** Currently running jobs */
  private runningJobs: Map<string, Promise<void>> = new Map();

  /** Queue processing interval */
  private queueInterval?: NodeJS.Timer;

  constructor(
    networkDb: NetworkDatabase,
    shardRouter: ShardRouter,
    dnsService: DNSService,
    sslService: SSLService,
    cdnService: CDNService,
    templateService: TemplateService,
    eventBus: EventBus,
    logger: Logger,
    config: Partial<ProvisioningConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.networkDb = networkDb;
    this.shardRouter = shardRouter;
    this.dnsService = dnsService;
    this.sslService = sslService;
    this.cdnService = cdnService;
    this.templateService = templateService;
    this.eventBus = eventBus;
    this.logger = logger;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Starts the provisioning queue processor.
   */
  start(): void {
    if (this.queueInterval) {
      return;
    }

    this.logger.info('Starting provisioning queue processor');

    this.queueInterval = setInterval(
      () => this.processQueue(),
      this.config.queueIntervalMs
    );

    // Initial processing
    this.processQueue();
  }

  /**
   * Stops the provisioning queue processor.
   */
  stop(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = undefined;
    }

    this.logger.info('Stopped provisioning queue processor');
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Queues a new site provisioning request.
   */
  async queueProvisioning(request: ProvisioningRequest): Promise<string> {
    // Validate request
    const validation = await this.validateRequest(request);
    if (!validation.ok) {
      throw new ProvisioningError(validation.error.message, validation.error.code);
    }

    // Create initial status
    const status: ProvisioningStatus = {
      requestId: request.requestId,
      status: 'queued',
      steps: this.createInitialSteps(request),
      queuedAt: new Date(),
      overallProgress: 0,
      estimatedCompletion: this.estimateCompletion(request),
    };

    // Store request and status
    await this.networkDb.createProvisioningRequest(request);
    await this.networkDb.updateProvisioningStatus(request.requestId, status);

    this.logger.info('Provisioning request queued', {
      requestId: request.requestId,
      siteSlug: request.site.slug,
      networkId: request.networkId,
    });

    // Emit event
    await this.eventBus.publish({
      type: 'ProvisioningQueued',
      payload: { requestId: request.requestId },
    });

    return request.requestId;
  }

  /**
   * Gets the status of a provisioning request.
   */
  async getStatus(requestId: string): Promise<ProvisioningStatus | null> {
    return this.networkDb.getProvisioningStatus(requestId);
  }

  /**
   * Cancels a queued provisioning request.
   */
  async cancel(requestId: string): Promise<Result<void, ProvisioningError>> {
    const status = await this.networkDb.getProvisioningStatus(requestId);

    if (!status) {
      return err(new ProvisioningError('Request not found', 'NOT_FOUND'));
    }

    if (status.status !== 'queued') {
      return err(new ProvisioningError(
        'Can only cancel queued requests',
        'INVALID_STATUS'
      ));
    }

    status.status = 'cancelled';
    status.completedAt = new Date();
    await this.networkDb.updateProvisioningStatus(requestId, status);

    this.logger.info('Provisioning request cancelled', { requestId });

    return ok(undefined);
  }

  /**
   * Retries a failed provisioning request.
   */
  async retry(requestId: string): Promise<Result<void, ProvisioningError>> {
    const status = await this.networkDb.getProvisioningStatus(requestId);

    if (!status) {
      return err(new ProvisioningError('Request not found', 'NOT_FOUND'));
    }

    if (status.status !== 'failed') {
      return err(new ProvisioningError(
        'Can only retry failed requests',
        'INVALID_STATUS'
      ));
    }

    // Reset failed steps to pending
    for (const step of status.steps) {
      if (step.status === 'failed') {
        step.status = 'pending';
        step.error = undefined;
        step.startedAt = undefined;
        step.completedAt = undefined;
      }
    }

    status.status = 'queued';
    status.error = undefined;
    status.completedAt = undefined;
    await this.networkDb.updateProvisioningStatus(requestId, status);

    this.logger.info('Provisioning request queued for retry', { requestId });

    return ok(undefined);
  }

  // ===========================================================================
  // QUEUE PROCESSING
  // ===========================================================================

  /**
   * Processes the provisioning queue.
   */
  private async processQueue(): Promise<void> {
    // Check capacity
    if (this.runningJobs.size >= this.config.maxConcurrent) {
      return;
    }

    // Get pending requests
    const pending = await this.networkDb.getPendingProvisioningRequests();

    for (const request of pending) {
      if (this.runningJobs.size >= this.config.maxConcurrent) {
        break;
      }

      if (this.runningJobs.has(request.requestId)) {
        continue;
      }

      // Start provisioning
      const job = this.runProvisioning(request);
      this.runningJobs.set(request.requestId, job);

      // Clean up when done
      job.finally(() => {
        this.runningJobs.delete(request.requestId);
      });
    }
  }

  /**
   * Runs the provisioning process for a request.
   */
  private async runProvisioning(request: ProvisioningRequest): Promise<void> {
    const startTime = Date.now();

    // Update status to running
    const status = await this.networkDb.getProvisioningStatus(request.requestId);
    if (!status) {
      return;
    }

    status.status = 'running';
    status.startedAt = new Date();
    await this.networkDb.updateProvisioningStatus(request.requestId, status);

    this.logger.info('Starting provisioning', {
      requestId: request.requestId,
      siteSlug: request.site.slug,
    });

    try {
      // Execute provisioning steps
      let site: SiteConfig | undefined;
      let dbResult: DatabaseProvisioningResult | undefined;
      let dnsResult: DNSSetupResult | undefined;

      // Step 1: Validate
      await this.executeStep(request.requestId, 'validate', async () => {
        const result = await this.validateRequest(request);
        if (!result.ok) {
          throw new Error(result.error.message);
        }
      });

      // Step 2: Provision database
      await this.executeStep(request.requestId, 'provision_database', async () => {
        dbResult = await this.provisionDatabase(request);
        return dbResult;
      });

      // Step 3: Create site record
      await this.executeStep(request.requestId, 'create_site', async () => {
        site = await this.createSiteRecord(request, dbResult!);
        return { siteId: site.siteId };
      });

      // Step 4: Configure storage
      await this.executeStep(request.requestId, 'configure_storage', async () => {
        await this.configureStorage(site!);
      });

      // Step 5: Configure cache
      await this.executeStep(request.requestId, 'configure_cache', async () => {
        await this.configureCache(site!);
      });

      // Step 6: Setup DNS
      await this.executeStep(request.requestId, 'setup_dns', async () => {
        dnsResult = await this.setupDNS(request, site!);
        return dnsResult;
      });

      // Step 7: Provision SSL
      await this.executeStep(request.requestId, 'provision_ssl', async () => {
        await this.provisionSSL(request, site!, dnsResult!);
      });

      // Step 8: Configure CDN
      await this.executeStep(request.requestId, 'configure_cdn', async () => {
        await this.cdnService.configureSite(
          site!.siteId,
          dnsResult!.subdomain,
          site!.region
        );
      });

      // Step 9: Apply template (if specified)
      if (request.site.template) {
        await this.executeStep(request.requestId, 'apply_template', async () => {
          const template = await this.templateService.getTemplate(request.site.template!);
          if (template) {
            await this.templateService.applyTemplate(site!.siteId, template);
          }
        });
      } else {
        await this.skipStep(request.requestId, 'apply_template');
      }

      // Step 10: Activate site
      await this.executeStep(request.requestId, 'activate', async () => {
        await this.activateSite(site!);
      });

      // Mark as completed
      const finalStatus = await this.networkDb.getProvisioningStatus(request.requestId);
      if (finalStatus) {
        finalStatus.status = 'completed';
        finalStatus.siteId = site!.siteId;
        finalStatus.completedAt = new Date();
        finalStatus.overallProgress = 100;
        await this.networkDb.updateProvisioningStatus(request.requestId, finalStatus);
      }

      const duration = Date.now() - startTime;

      this.logger.info('Provisioning completed', {
        requestId: request.requestId,
        siteId: site!.siteId,
        durationMs: duration,
      });

      // Emit success event
      await this.eventBus.publish({
        type: 'SiteProvisioned',
        payload: {
          requestId: request.requestId,
          siteId: site!.siteId,
          networkId: request.networkId,
          duration,
        },
      });

    } catch (error) {
      const finalStatus = await this.networkDb.getProvisioningStatus(request.requestId);
      if (finalStatus) {
        finalStatus.status = 'failed';
        finalStatus.error = (error as Error).message;
        finalStatus.completedAt = new Date();
        await this.networkDb.updateProvisioningStatus(request.requestId, finalStatus);
      }

      this.logger.error('Provisioning failed', {
        requestId: request.requestId,
        error: (error as Error).message,
      });

      // Emit failure event
      await this.eventBus.publish({
        type: 'ProvisioningFailed',
        payload: {
          requestId: request.requestId,
          error: (error as Error).message,
        },
      });
    }
  }

  // ===========================================================================
  // STEP EXECUTION
  // ===========================================================================

  /**
   * Executes a provisioning step with status tracking.
   */
  private async executeStep<T>(
    requestId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const status = await this.networkDb.getProvisioningStatus(requestId);
    if (!status) {
      throw new Error('Status not found');
    }

    const step = status.steps.find((s) => s.name === stepName);
    if (!step) {
      throw new Error(`Step ${stepName} not found`);
    }

    // Update step status to running
    step.status = 'running';
    step.startedAt = new Date();
    step.progress = 0;
    await this.networkDb.updateProvisioningStatus(requestId, status);

    try {
      const result = await fn();

      // Update step status to completed
      step.status = 'completed';
      step.completedAt = new Date();
      step.progress = 100;
      step.output = result as Record<string, unknown>;

      // Update overall progress
      status.overallProgress = this.calculateOverallProgress(status.steps);
      await this.networkDb.updateProvisioningStatus(requestId, status);

      return result;
    } catch (error) {
      // Update step status to failed
      step.status = 'failed';
      step.completedAt = new Date();
      step.error = (error as Error).message;
      await this.networkDb.updateProvisioningStatus(requestId, status);

      throw error;
    }
  }

  /**
   * Skips a step.
   */
  private async skipStep(requestId: string, stepName: string): Promise<void> {
    const status = await this.networkDb.getProvisioningStatus(requestId);
    if (!status) {
      return;
    }

    const step = status.steps.find((s) => s.name === stepName);
    if (step) {
      step.status = 'skipped';
      step.completedAt = new Date();
      status.overallProgress = this.calculateOverallProgress(status.steps);
      await this.networkDb.updateProvisioningStatus(requestId, status);
    }
  }

  // ===========================================================================
  // PROVISIONING STEPS
  // ===========================================================================

  /**
   * Validates a provisioning request.
   */
  private async validateRequest(
    request: ProvisioningRequest
  ): Promise<Result<void, { code: string; message: string }>> {
    // Check network exists and has quota
    const network = await this.networkDb.getNetwork(request.networkId);
    if (!network) {
      return err({ code: 'NETWORK_NOT_FOUND', message: 'Network not found' });
    }

    // Check site quota
    const siteCount = await this.networkDb.getSiteCount(request.networkId);
    if (siteCount >= network.quota.maxSites) {
      return err({
        code: 'QUOTA_EXCEEDED',
        message: `Site quota exceeded (${network.quota.maxSites})`,
      });
    }

    // Check slug availability
    const existingSlug = await this.networkDb.getSiteBySlug(request.site.slug);
    if (existingSlug) {
      return err({
        code: 'SLUG_EXISTS',
        message: `Site slug "${request.site.slug}" already exists`,
      });
    }

    // Check tier permission
    if (request.site.tier === 'enterprise' && !network.features.enterpriseTier) {
      return err({
        code: 'TIER_NOT_AVAILABLE',
        message: 'Enterprise tier not available for this network',
      });
    }

    // Check custom domain permission
    if (request.domain?.custom && !network.features.customDomains) {
      return err({
        code: 'CUSTOM_DOMAINS_DISABLED',
        message: 'Custom domains not enabled for this network',
      });
    }

    return ok(undefined);
  }

  /**
   * Provisions database resources for the site.
   */
  private async provisionDatabase(
    request: ProvisioningRequest
  ): Promise<DatabaseProvisioningResult> {
    // Assign shard based on region
    const shard = await this.shardRouter.assignShard(request.site.region);

    // Generate schema name
    const schemaName = `site_${request.site.slug.replace(/-/g, '_')}`;

    // Create schema
    await this.shardRouter.createSchema(shard, schemaName);

    // Run migrations
    await this.shardRouter.runMigrations(shard, schemaName);

    this.logger.info('Database provisioned', {
      siteSlug: request.site.slug,
      shardId: shard.shardId,
      schemaName,
    });

    return {
      shardId: shard.shardId,
      schemaName,
      connectionInfo: {
        host: shard.primaryHost,
        port: 5432,
        database: 'rses_cms',
      },
    };
  }

  /**
   * Creates the site record in the network database.
   */
  private async createSiteRecord(
    request: ProvisioningRequest,
    dbResult: DatabaseProvisioningResult
  ): Promise<SiteConfig> {
    const siteId = generateSiteId();
    const primaryDomain = `${request.site.slug}.rses-network.com`;

    const site = await this.networkDb.createSite({
      siteId,
      networkId: request.networkId,
      name: request.site.name,
      slug: request.site.slug,
      primaryDomain,
      status: 'pending',
      tier: request.site.tier,
      region: request.site.region,
      shardId: dbResult.shardId,
      schemaName: dbResult.schemaName,
      features: this.getDefaultFeatures(request.site.tier),
      config: this.getDefaultConfig(request),
    });

    return site;
  }

  /**
   * Configures storage for the site.
   */
  private async configureStorage(site: SiteConfig): Promise<void> {
    // Create storage bucket/directory
    // In production, this would create an S3 bucket or similar
    this.logger.debug('Storage configured', { siteId: site.siteId });
  }

  /**
   * Configures cache for the site.
   */
  private async configureCache(site: SiteConfig): Promise<void> {
    // Configure cache namespace
    // In production, this would set up Redis namespace or similar
    this.logger.debug('Cache configured', { siteId: site.siteId });
  }

  /**
   * Sets up DNS for the site.
   */
  private async setupDNS(
    request: ProvisioningRequest,
    site: SiteConfig
  ): Promise<DNSSetupResult> {
    // Create subdomain
    const subdomain = await this.dnsService.createSubdomain(
      request.site.slug,
      'rses-network.com'
    );

    const result: DNSSetupResult = {
      subdomain,
      verificationRequired: false,
      records: [
        {
          type: 'CNAME',
          name: subdomain,
          value: 'edge.rses-network.com',
        },
      ],
    };

    // Handle custom domain
    if (request.domain?.custom) {
      const verificationToken = `rses-verify=${site.siteId}-${Date.now()}`;
      await this.dnsService.createVerificationRecord(
        request.domain.custom,
        verificationToken
      );

      result.customDomain = request.domain.custom;
      result.verificationRequired = true;
      result.records.push({
        type: 'TXT',
        name: `_rses-verify.${request.domain.custom}`,
        value: verificationToken,
      });
    }

    return result;
  }

  /**
   * Provisions SSL certificate for the site.
   */
  private async provisionSSL(
    request: ProvisioningRequest,
    site: SiteConfig,
    dnsResult: DNSSetupResult
  ): Promise<void> {
    // Provision SSL for subdomain
    const cert = await this.sslService.provisionCertificate(dnsResult.subdomain);
    await this.sslService.scheduleRenewal(cert.certificateId, cert.expiresAt);

    // Custom domain SSL will be provisioned after DNS verification
    if (dnsResult.customDomain && !dnsResult.verificationRequired) {
      const customCert = await this.sslService.provisionCertificate(
        dnsResult.customDomain
      );
      await this.sslService.scheduleRenewal(
        customCert.certificateId,
        customCert.expiresAt
      );
    }
  }

  /**
   * Activates the site.
   */
  private async activateSite(site: SiteConfig): Promise<void> {
    await this.networkDb.updateSite(site.siteId, {
      status: 'active',
    });

    this.logger.info('Site activated', { siteId: site.siteId });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Creates initial step definitions.
   */
  private createInitialSteps(request: ProvisioningRequest): ProvisioningStep[] {
    const steps: ProvisioningStep[] = [
      { name: 'validate', description: 'Validating request', status: 'pending', progress: 0 },
      { name: 'provision_database', description: 'Provisioning database', status: 'pending', progress: 0 },
      { name: 'create_site', description: 'Creating site record', status: 'pending', progress: 0 },
      { name: 'configure_storage', description: 'Configuring storage', status: 'pending', progress: 0 },
      { name: 'configure_cache', description: 'Configuring cache', status: 'pending', progress: 0 },
      { name: 'setup_dns', description: 'Setting up DNS', status: 'pending', progress: 0 },
      { name: 'provision_ssl', description: 'Provisioning SSL', status: 'pending', progress: 0 },
      { name: 'configure_cdn', description: 'Configuring CDN', status: 'pending', progress: 0 },
      { name: 'apply_template', description: 'Applying template', status: 'pending', progress: 0 },
      { name: 'activate', description: 'Activating site', status: 'pending', progress: 0 },
    ];

    return steps;
  }

  /**
   * Calculates overall progress from steps.
   */
  private calculateOverallProgress(steps: ProvisioningStep[]): number {
    const totalSteps = steps.length;
    const completedSteps = steps.filter(
      (s) => s.status === 'completed' || s.status === 'skipped'
    ).length;
    return Math.round((completedSteps / totalSteps) * 100);
  }

  /**
   * Estimates completion time.
   */
  private estimateCompletion(request: ProvisioningRequest): Date {
    // Base estimate: 2 minutes
    let estimateMs = 120000;

    // Add time for template
    if (request.site.template) {
      estimateMs += 30000;
    }

    // Add time for custom domain
    if (request.domain?.custom) {
      estimateMs += 60000;
    }

    return new Date(Date.now() + estimateMs);
  }

  /**
   * Gets default features for a tier.
   */
  private getDefaultFeatures(tier: string): SiteConfig['features'] {
    const baseFeatures = {
      rsesEnabled: true,
      aiEnabled: false,
      quantumEnabled: false,
      realTimeEnabled: false,
      versioningEnabled: true,
      workflowEnabled: false,
      customCodeEnabled: false,
    };

    switch (tier) {
      case 'pro':
        return {
          ...baseFeatures,
          aiEnabled: true,
          realTimeEnabled: true,
          workflowEnabled: true,
        };
      case 'enterprise':
        return {
          ...baseFeatures,
          aiEnabled: true,
          quantumEnabled: true,
          realTimeEnabled: true,
          workflowEnabled: true,
          customCodeEnabled: true,
        };
      default:
        return baseFeatures;
    }
  }

  /**
   * Gets default site configuration.
   */
  private getDefaultConfig(request: ProvisioningRequest): SiteConfig['config'] {
    return {
      theme: {
        name: 'default',
      },
      localization: {
        defaultLocale: 'en',
        supportedLocales: ['en'],
        timezone: 'UTC',
      },
      media: {
        maxUploadSizeBytes: request.site.tier === 'enterprise' ? 104857600 : 10485760,
        allowedMimeTypes: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
        ],
        imageOptimization: true,
      },
      api: {
        rateLimitPerMinute: request.site.tier === 'enterprise' ? 1000 : 100,
        allowedOrigins: ['*'],
      },
      seo: {
        siteName: request.site.name,
      },
      security: {
        requireAuth: false,
        sessionTimeout: 3600,
      },
      ...request.config,
    };
  }
}

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Provisioning error.
 */
export class ProvisioningError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ProvisioningError';
    this.code = code;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generates a unique site ID.
 */
function generateSiteId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `site_${timestamp}${random}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_CONFIG as DEFAULT_PROVISIONING_CONFIG };
