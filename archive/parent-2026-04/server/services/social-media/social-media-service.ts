/**
 * @file social-media-service.ts
 * @description Core Social Media Integration service
 * @phase Phase 3B - Social Media Integration
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import { getConnectorRegistry, type PlatformConnectorRegistry } from "./platform-connectors";
import { PublishingQueue, createPublishingQueue } from "./publishing-queue";
import { ContentScheduler, createContentScheduler } from "./scheduler";
import { AnalyticsCollector, createAnalyticsCollector } from "./analytics-collector";
import {
  createAccountStorage,
  createPostStorage,
  createQueueStorage,
  createAnalyticsStorage,
  createCampaignStorage,
} from "./pg-storage";
import type {
  SocialMediaServiceConfig,
  DEFAULT_CONFIG,
  SocialPlatform,
  SocialPost,
  SocialAccount,
  SocialCampaign,
  PostAnalytics,
  ISocialAccountStorage,
  ISocialPostStorage,
  IPublishQueueStorage,
  IPostAnalyticsStorage,
  ICampaignStorage,
  PostQueryOptions,
  AggregatedAnalytics,
  PlatformPerformance,
  SocialMediaEvent,
  SocialMediaEventHandler,
  OAuth2Tokens,
  PlatformTarget,
  CalendarMonth,
  ScheduledPostInfo,
} from "./types";
import { InsertSocialPost, CreatePostRequest } from "../../../shared/social-media-schema";

const log = createModuleLogger("social-media-service");

// =============================================================================
// SOCIAL MEDIA SERVICE
// =============================================================================

export class SocialMediaService extends EventEmitter {
  private config: SocialMediaServiceConfig;
  private connectorRegistry: PlatformConnectorRegistry;

  // Storage
  private accountStorage: ISocialAccountStorage;
  private postStorage: ISocialPostStorage;
  private queueStorage: IPublishQueueStorage;
  private analyticsStorage: IPostAnalyticsStorage;
  private campaignStorage: ICampaignStorage;

  // Sub-services
  private publishingQueue: PublishingQueue | null = null;
  private scheduler: ContentScheduler | null = null;
  private analyticsCollector: AnalyticsCollector | null = null;

  // State
  private initialized: boolean = false;
  private eventHandlers: SocialMediaEventHandler[] = [];

  constructor(config: Partial<SocialMediaServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
    this.connectorRegistry = getConnectorRegistry();

    // Initialize storage
    this.accountStorage = createAccountStorage();
    this.postStorage = createPostStorage();
    this.queueStorage = createQueueStorage();
    this.analyticsStorage = createAnalyticsStorage();
    this.campaignStorage = createCampaignStorage();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize publishing queue
    if (this.config.enableQueue) {
      this.publishingQueue = createPublishingQueue(
        this.queueStorage,
        this.postStorage,
        this.accountStorage,
        {
          workers: this.config.queueWorkers,
          intervalMs: this.config.queueIntervalMs,
          maxRetryAttempts: this.config.maxRetryAttempts,
          retryBaseDelayMs: this.config.retryBaseDelayMs,
          retryMaxDelayMs: this.config.retryMaxDelayMs,
        }
      );
      this.setupQueueEvents();
      this.publishingQueue.start();
    }

    // Initialize scheduler
    if (this.config.enableScheduler) {
      this.scheduler = createContentScheduler(
        this.postStorage,
        this.publishingQueue!,
        { checkIntervalMs: this.config.schedulerIntervalMs }
      );
      this.scheduler.start();
    }

    // Initialize analytics collector
    if (this.config.enableAnalytics) {
      this.analyticsCollector = createAnalyticsCollector(
        this.analyticsStorage,
        this.postStorage,
        this.accountStorage,
        { fetchIntervalMs: this.config.analyticsFetchIntervalMs }
      );
      this.setupAnalyticsEvents();
      this.analyticsCollector.start();
    }

    this.initialized = true;
    log.info({ config: this.config }, "Social media service initialized");
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    this.publishingQueue?.stop();
    this.scheduler?.stop();
    this.analyticsCollector?.stop();

    this.initialized = false;
    log.info("Social media service shut down");
  }

  // ===========================================================================
  // ACCOUNT MANAGEMENT
  // ===========================================================================

  /**
   * Get OAuth authorization URL for connecting an account
   */
  getAuthUrl(platform: SocialPlatform, state: string, redirectUri: string): string {
    const connector = this.connectorRegistry.getConnector(platform);
    return connector.getAuthUrl(state, redirectUri);
  }

  /**
   * Connect a social media account after OAuth callback
   */
  async connectAccount(
    siteId: string,
    userId: number,
    platform: SocialPlatform,
    code: string,
    redirectUri: string
  ): Promise<SocialAccount> {
    const connector = this.connectorRegistry.getConnector(platform);

    // Exchange code for tokens
    const tokens = await connector.exchangeCode(code, redirectUri);

    // Get account info
    const accountInfo = await connector.getAccountInfo(tokens);

    // Check if account already exists (cross-tenant by platform+accountId)
    const existing = await this.accountStorage.getByPlatformAccountId(platform, accountInfo.accountId);
    if (existing) {
      // Update existing account — use the caller's siteId for scoping
      const updated = await this.accountStorage.update(existing.id, {
        connected: true,
        credentialId: tokens.accessToken, // Simplified - would encrypt
        tokenExpiresAt: tokens.expiresAt,
        lastSyncAt: new Date(),
        followerCount: accountInfo.followerCount,
      }, siteId);

      this.emitEvent({
        type: "account:refreshed",
        timestamp: new Date(),
        siteId,
        userId,
        data: { accountId: existing.id, platform },
      });

      return updated!;
    }

    // Create new account
    const account: Omit<SocialAccount, "createdAt" | "updatedAt"> = {
      id: randomUUID(),
      siteId,
      userId,
      platform,
      accountName: accountInfo.accountName,
      accountId: accountInfo.accountId,
      accountUrl: accountInfo.accountUrl ?? null,
      avatarUrl: accountInfo.avatarUrl ?? null,
      followerCount: accountInfo.followerCount ?? null,
      credentialId: tokens.accessToken, // Simplified - would encrypt
      connected: true,
      lastSyncAt: new Date(),
      tokenExpiresAt: tokens.expiresAt ?? null,
      rateLimitRemaining: null,
      rateLimitResetAt: null,
      metadata: {},
    };

    const created = await this.accountStorage.create(account);

    this.emitEvent({
      type: "account:connected",
      timestamp: new Date(),
      siteId,
      userId,
      data: { accountId: created.id, platform, accountName: accountInfo.accountName },
    });

    log.info({ siteId, platform, accountName: accountInfo.accountName }, "Social account connected");
    return created;
  }

  /**
   * Disconnect a social media account
   */
  async disconnectAccount(siteId: string, accountId: string): Promise<boolean> {
    const account = await this.accountStorage.getById(accountId, siteId);
    if (!account) return false;

    // Revoke tokens
    try {
      const connector = this.connectorRegistry.getConnector(account.platform);
      await connector.revokeTokens(account.credentialId);
    } catch (error) {
      log.warn({ accountId, error }, "Failed to revoke tokens, proceeding with disconnect");
    }

    // Mark as disconnected
    await this.accountStorage.update(accountId, { connected: false }, siteId);

    this.emitEvent({
      type: "account:disconnected",
      timestamp: new Date(),
      siteId: account.siteId,
      userId: account.userId,
      data: { accountId, platform: account.platform },
    });

    log.info({ accountId, platform: account.platform }, "Social account disconnected");
    return true;
  }

  /**
   * Get all connected accounts for a site
   */
  async getAccounts(siteId: string): Promise<SocialAccount[]> {
    return this.accountStorage.getConnectedBySite(siteId);
  }

  /**
   * Refresh token for an account
   */
  async refreshAccountToken(siteId: string, accountId: string): Promise<boolean> {
    const account = await this.accountStorage.getById(accountId, siteId);
    if (!account || !account.connected) return false;

    try {
      const connector = this.connectorRegistry.getConnector(account.platform);
      const tokens = await connector.refreshTokens(account.credentialId);

      await this.accountStorage.update(accountId, {
        credentialId: tokens.accessToken,
        tokenExpiresAt: tokens.expiresAt,
        lastSyncAt: new Date(),
      }, siteId);

      return true;
    } catch (error) {
      log.error({ accountId, error }, "Failed to refresh token");
      await this.accountStorage.update(accountId, { connected: false }, siteId);

      this.emitEvent({
        type: "account:error",
        timestamp: new Date(),
        siteId: account.siteId,
        data: { accountId, platform: account.platform, error: "Token refresh failed" },
      });

      return false;
    }
  }

  // ===========================================================================
  // POST MANAGEMENT
  // ===========================================================================

  /**
   * Create a new social media post
   */
  async createPost(siteId: string, userId: number, data: CreatePostRequest): Promise<SocialPost> {
    const post: Omit<SocialPost, "createdAt" | "updatedAt"> = {
      id: randomUUID(),
      siteId,
      userId,
      content: data.content,
      mediaUrls: data.mediaUrls ?? [],
      link: data.link ?? null,
      platforms: data.platforms,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      publishedAt: null,
      status: data.scheduledAt ? "scheduled" : "draft",
      platformStatuses: {},
      tags: data.tags ?? [],
      campaignId: data.campaignId ?? null,
      analyticsId: null,
      metadata: {},
    };

    const created = await this.postStorage.create(post);

    this.emitEvent({
      type: "post:created",
      timestamp: new Date(),
      siteId,
      userId,
      data: { postId: created.id, status: created.status },
    });

    log.info({ postId: created.id, status: created.status }, "Social post created");
    return created;
  }

  /**
   * Update an existing post
   */
  async updatePost(siteId: string, postId: string, updates: Partial<CreatePostRequest>): Promise<SocialPost | null> {
    const post = await this.postStorage.getById(postId, siteId);
    if (!post) return null;

    if (post.status === "published" || post.status === "publishing") {
      throw new Error("Cannot update published post");
    }

    const updated = await this.postStorage.update(postId, {
      content: updates.content ?? post.content,
      mediaUrls: updates.mediaUrls ?? post.mediaUrls,
      link: updates.link ?? post.link,
      platforms: updates.platforms ?? post.platforms,
      tags: updates.tags ?? post.tags,
      campaignId: updates.campaignId ?? post.campaignId,
    }, siteId);

    if (updated) {
      this.emitEvent({
        type: "post:updated",
        timestamp: new Date(),
        siteId: post.siteId,
        userId: post.userId,
        data: { postId },
      });
    }

    return updated;
  }

  /**
   * Delete a post
   */
  async deletePost(siteId: string, postId: string): Promise<boolean> {
    const post = await this.postStorage.getById(postId, siteId);
    if (!post) return false;

    // Cancel any pending queue jobs
    await this.publishingQueue?.cancelPost(postId);

    // Delete the post
    const deleted = await this.postStorage.delete(postId, siteId);

    if (deleted) {
      this.emitEvent({
        type: "post:deleted",
        timestamp: new Date(),
        siteId: post.siteId,
        userId: post.userId,
        data: { postId },
      });
    }

    return deleted;
  }

  /**
   * Get posts for a site
   */
  async getPosts(siteId: string, options?: PostQueryOptions): Promise<{ posts: SocialPost[]; total: number }> {
    return this.postStorage.getAllBySite(siteId, options);
  }

  /**
   * Get a single post
   */
  async getPost(postId: string, siteId?: string): Promise<SocialPost | null> {
    return this.postStorage.getById(postId, siteId);
  }

  // ===========================================================================
  // PUBLISHING
  // ===========================================================================

  /**
   * Publish a post immediately
   */
  async publishPost(postId: string, siteId?: string): Promise<void> {
    const post = await this.postStorage.getById(postId, siteId);
    if (!post) throw new Error("Post not found");

    if (post.status === "published" || post.status === "publishing") {
      throw new Error("Post already published");
    }

    if (!this.publishingQueue) {
      throw new Error("Publishing queue not available");
    }

    await this.publishingQueue.enqueue(post);
  }

  /**
   * Schedule a post for later
   */
  async schedulePost(postId: string, scheduledAt: Date): Promise<SocialPost | null> {
    if (!this.scheduler) {
      throw new Error("Scheduler not available");
    }

    return this.scheduler.schedulePost(postId, scheduledAt);
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(postId: string): Promise<boolean> {
    if (!this.scheduler) return false;
    return this.scheduler.cancelScheduledPost(postId);
  }

  // ===========================================================================
  // CALENDAR
  // ===========================================================================

  /**
   * Get calendar view for a month
   */
  async getCalendar(siteId: string, year: number, month: number): Promise<CalendarMonth> {
    if (!this.scheduler) {
      throw new Error("Scheduler not available");
    }
    return this.scheduler.getCalendarMonth(siteId, year, month);
  }

  /**
   * Get upcoming scheduled posts
   */
  async getUpcomingPosts(siteId: string, limit?: number): Promise<ScheduledPostInfo[]> {
    if (!this.scheduler) {
      throw new Error("Scheduler not available");
    }
    return this.scheduler.getUpcomingPosts(siteId, limit);
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  /**
   * Get analytics for a post
   */
  async getPostAnalytics(postId: string): Promise<AggregatedAnalytics | null> {
    if (!this.analyticsCollector) {
      throw new Error("Analytics collector not available");
    }
    return this.analyticsCollector.getPostPerformance(postId);
  }

  /**
   * Get platform performance
   */
  async getPlatformPerformance(siteId: string, platform: SocialPlatform, days?: number): Promise<PlatformPerformance> {
    if (!this.analyticsCollector) {
      throw new Error("Analytics collector not available");
    }
    return this.analyticsCollector.getPlatformPerformance(siteId, platform, days);
  }

  /**
   * Get top performing posts
   */
  async getTopPosts(siteId: string, limit?: number): Promise<PostAnalytics[]> {
    if (!this.analyticsCollector) {
      throw new Error("Analytics collector not available");
    }
    return this.analyticsCollector.getTopPerformingPosts(siteId, limit);
  }

  // ===========================================================================
  // CAMPAIGNS
  // ===========================================================================

  /**
   * Create a campaign
   */
  async createCampaign(
    siteId: string,
    userId: number,
    name: string,
    options: { description?: string; startDate?: Date; endDate?: Date; tags?: string[] } = {}
  ): Promise<SocialCampaign> {
    const campaign: Omit<SocialCampaign, "createdAt" | "updatedAt"> = {
      id: randomUUID(),
      siteId,
      userId,
      name,
      description: options.description ?? null,
      startDate: options.startDate ?? null,
      endDate: options.endDate ?? null,
      status: "draft",
      totalPosts: 0,
      totalImpressions: 0,
      totalEngagements: 0,
      tags: options.tags ?? [],
      metadata: {},
    };

    const created = await this.campaignStorage.create(campaign);

    this.emitEvent({
      type: "campaign:created",
      timestamp: new Date(),
      siteId,
      userId,
      data: { campaignId: created.id, name },
    });

    return created;
  }

  /**
   * Get campaigns for a site
   */
  async getCampaigns(siteId: string): Promise<SocialCampaign[]> {
    return this.campaignStorage.getAllBySite(siteId);
  }

  /**
   * Get campaign performance
   */
  async getCampaignPerformance(campaignId: string): Promise<AggregatedAnalytics | null> {
    if (!this.analyticsCollector) {
      throw new Error("Analytics collector not available");
    }
    return this.analyticsCollector.getCampaignPerformance(campaignId);
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  onEvent(handler: SocialMediaEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) this.eventHandlers.splice(index, 1);
    };
  }

  private emitEvent(event: SocialMediaEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        log.error({ error, eventType: event.type }, "Error in event handler");
      }
    }
    this.emit(event.type, event);
  }

  private setupQueueEvents(): void {
    if (!this.publishingQueue) return;

    this.publishingQueue.onEvent((event) => {
      // Forward queue events
      this.emitEvent(event);

      // Track published posts for analytics
      if (event.type === "post:published" && this.analyticsCollector) {
        const postId = event.data.postId as string;
        this.postStorage.getById(postId).then(post => {
          if (post) {
            this.analyticsCollector!.trackPost(post);
          }
        });
      }
    });
  }

  private setupAnalyticsEvents(): void {
    if (!this.analyticsCollector) return;

    this.analyticsCollector.onEvent((event) => {
      this.emitEvent(event);
    });
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  getSupportedPlatforms(): SocialPlatform[] {
    return this.connectorRegistry.getSupportedPlatforms();
  }
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_SERVICE_CONFIG: SocialMediaServiceConfig = {
  enableQueue: true,
  enableScheduler: true,
  enableAnalytics: true,
  queueWorkers: 3,
  queueIntervalMs: 5000,
  schedulerIntervalMs: 60000,
  analyticsFetchIntervalMs: 300000,
  maxRetryAttempts: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000,
};
