/**
 * @file analytics-collector.ts
 * @description Post analytics collection and aggregation
 * @phase Phase 3B - Social Media Integration
 */

import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import { getConnectorRegistry, type PlatformConnectorRegistry } from "./platform-connectors";
import type {
  SocialPlatform,
  SocialPost,
  PostAnalytics,
  SocialAccount,
  IPostAnalyticsStorage,
  ISocialPostStorage,
  ISocialAccountStorage,
  AggregatedAnalytics,
  PlatformPerformance,
  OAuth2Tokens,
  AnalyticsSnapshot,
  SocialMediaEvent,
  SocialMediaEventHandler,
} from "./types";

const log = createModuleLogger("social-media-analytics");

// =============================================================================
// ANALYTICS COLLECTOR
// =============================================================================

export interface AnalyticsCollectorConfig {
  /** Fetch interval in ms */
  fetchIntervalMs: number;
  /** How long to track posts after publishing (days) */
  trackingPeriodDays: number;
  /** Max posts to fetch per interval */
  batchSize: number;
}

const DEFAULT_CONFIG: AnalyticsCollectorConfig = {
  fetchIntervalMs: 300000, // 5 minutes
  trackingPeriodDays: 7,
  batchSize: 50,
};

export class AnalyticsCollector {
  private config: AnalyticsCollectorConfig;
  private analyticsStorage: IPostAnalyticsStorage;
  private postStorage: ISocialPostStorage;
  private accountStorage: ISocialAccountStorage;
  private connectorRegistry: PlatformConnectorRegistry;

  private timer: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private eventHandlers: SocialMediaEventHandler[] = [];

  constructor(
    analyticsStorage: IPostAnalyticsStorage,
    postStorage: ISocialPostStorage,
    accountStorage: ISocialAccountStorage,
    config: Partial<AnalyticsCollectorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analyticsStorage = analyticsStorage;
    this.postStorage = postStorage;
    this.accountStorage = accountStorage;
    this.connectorRegistry = getConnectorRegistry();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleFetch();
    log.info({ intervalMs: this.config.fetchIntervalMs }, "Analytics collector started");
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info("Analytics collector stopped");
  }

  // ===========================================================================
  // TRACKING
  // ===========================================================================

  /**
   * Start tracking a newly published post
   */
  async trackPost(post: SocialPost): Promise<void> {
    const platformStatuses = post.platformStatuses as Record<string, { externalId?: string; status: string }>;

    for (const target of post.platforms) {
      if (!target.enabled) continue;

      const platformStatus = platformStatuses[target.platform];
      if (!platformStatus?.externalId || platformStatus.status !== "published") continue;

      // Create initial analytics record
      const analytics: Omit<PostAnalytics, "createdAt" | "updatedAt"> = {
        id: randomUUID(),
        postId: post.id,
        platform: target.platform,
        externalId: platformStatus.externalId,
        impressions: 0,
        reach: 0,
        likes: 0,
        shares: 0,
        comments: 0,
        clicks: 0,
        saves: 0,
        videoViews: null,
        watchTime: null,
        engagementRate: 0,
        fetchedAt: new Date(),
        history: [],
      };

      await this.analyticsStorage.create(analytics);
      log.debug({ postId: post.id, platform: target.platform }, "Started tracking post");
    }
  }

  /**
   * Fetch analytics for a specific post/platform combination
   */
  async fetchPostAnalytics(postId: string, platform: SocialPlatform): Promise<PostAnalytics | null> {
    const existing = await this.analyticsStorage.getByPostAndPlatform(postId, platform);
    if (!existing) return null;

    const post = await this.postStorage.getById(postId);
    if (!post) return null;

    const target = post.platforms.find(t => t.platform === platform);
    if (!target) return null;

    const account = await this.accountStorage.getById(target.accountId);
    if (!account || !account.connected) return null;

    try {
      const connector = this.connectorRegistry.getConnector(platform);
      const tokens: OAuth2Tokens = {
        accessToken: account.credentialId, // Simplified
        tokenType: "bearer",
      };

      const result = await connector.getPostAnalytics(tokens, existing.externalId);

      // Update analytics
      const updated = await this.analyticsStorage.upsert({
        ...existing,
        impressions: result.impressions,
        reach: result.reach,
        likes: result.likes,
        shares: result.shares,
        comments: result.comments,
        clicks: result.clicks,
        saves: result.saves,
        videoViews: result.videoViews ?? null,
        watchTime: result.watchTime ?? null,
        engagementRate: result.engagementRate,
        fetchedAt: new Date(),
      });

      this.emitEvent({
        type: "analytics:updated",
        timestamp: new Date(),
        siteId: post.siteId,
        data: { postId, platform, analytics: result },
      });

      return updated;
    } catch (error) {
      log.error({ postId, platform, error }, "Failed to fetch analytics");
      return existing;
    }
  }

  /**
   * Fetch analytics for all platforms of a post
   */
  async fetchAllPostAnalytics(postId: string): Promise<Map<SocialPlatform, PostAnalytics>> {
    const results = new Map<SocialPlatform, PostAnalytics>();
    const analytics = await this.analyticsStorage.getByPostId(postId);

    for (const a of analytics) {
      const updated = await this.fetchPostAnalytics(postId, a.platform);
      if (updated) {
        results.set(a.platform, updated);
      }
    }

    return results;
  }

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  /**
   * Get aggregated analytics for a post across all platforms
   */
  async getPostPerformance(postId: string): Promise<AggregatedAnalytics | null> {
    return this.analyticsStorage.getAggregatedByPost(postId);
  }

  /**
   * Get aggregated analytics for a campaign
   */
  async getCampaignPerformance(campaignId: string): Promise<AggregatedAnalytics | null> {
    return this.analyticsStorage.getAggregatedByCampaign(campaignId);
  }

  /**
   * Get platform performance summary
   */
  async getPlatformPerformance(
    siteId: string,
    platform: SocialPlatform,
    days: number = 30
  ): Promise<PlatformPerformance> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { posts } = await this.postStorage.getAllBySite(siteId, {
      platforms: [platform],
      status: ["published"],
      startDate,
      limit: 1000,
    });

    let totalImpressions = 0;
    let totalEngagements = 0;
    let engagementSum = 0;
    const topPosts: PlatformPerformance["topPosts"] = [];

    for (const post of posts) {
      const analytics = await this.analyticsStorage.getByPostAndPlatform(post.id, platform);
      if (!analytics) continue;

      totalImpressions += analytics.impressions;
      totalEngagements += analytics.likes + analytics.shares + analytics.comments + analytics.clicks;
      engagementSum += analytics.engagementRate;

      topPosts.push({
        postId: post.id,
        externalUrl: (post.platformStatuses as Record<string, { externalUrl?: string }>)[platform]?.externalUrl,
        impressions: analytics.impressions,
        engagementRate: analytics.engagementRate,
      });
    }

    // Sort top posts by engagement rate
    topPosts.sort((a, b) => b.engagementRate - a.engagementRate);

    return {
      platform,
      postCount: posts.length,
      totalImpressions,
      totalEngagements,
      averageEngagementRate: posts.length > 0 ? engagementSum / posts.length : 0,
      topPosts: topPosts.slice(0, 10),
    };
  }

  /**
   * Get top performing posts
   */
  async getTopPerformingPosts(
    siteId: string,
    limit: number = 10,
    metric: "impressions" | "engagementRate" = "engagementRate"
  ): Promise<PostAnalytics[]> {
    return this.analyticsStorage.getTopPerforming(siteId, limit, metric);
  }

  // ===========================================================================
  // INTERNAL PROCESSING
  // ===========================================================================

  private scheduleFetch(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      await this.processFetchQueue();
      this.scheduleFetch();
    }, this.config.fetchIntervalMs);
  }

  private async processFetchQueue(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.config.trackingPeriodDays * 24 * 60 * 60 * 1000);

      // Find recently published posts that need analytics updates
      const posts = await this.findPostsForAnalytics(cutoffDate, this.config.batchSize);

      for (const post of posts) {
        await this.fetchAllPostAnalytics(post.id);
      }

      if (posts.length > 0) {
        log.debug({ count: posts.length }, "Fetched analytics for posts");
      }
    } catch (error) {
      log.error({ error }, "Error processing analytics fetch queue");
    }
  }

  private async findPostsForAnalytics(sinceDate: Date, limit: number): Promise<SocialPost[]> {
    // Get published posts from tracking period
    const result = await this.postStorage.getAllBySite("*", {
      status: ["published"],
      startDate: sinceDate,
      limit,
      sortBy: "publishedAt",
      sortOrder: "desc",
    });

    return result.posts;
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
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createAnalyticsCollector(
  analyticsStorage: IPostAnalyticsStorage,
  postStorage: ISocialPostStorage,
  accountStorage: ISocialAccountStorage,
  config?: Partial<AnalyticsCollectorConfig>
): AnalyticsCollector {
  return new AnalyticsCollector(analyticsStorage, postStorage, accountStorage, config);
}
