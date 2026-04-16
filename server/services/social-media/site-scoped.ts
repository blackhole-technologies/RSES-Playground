/**
 * @file site-scoped.ts
 * @description Site-scoped wrapper for multi-tenant social media operations
 * @phase Phase 3B - Social Media Integration
 */

// getSocialMediaService is exported from ./index.ts (the module aggregator),
// not from the service file itself. The class itself comes from the service file.
import { SocialMediaService } from "./social-media-service";
import { getSocialMediaService } from "./index";
import type {
  SocialPlatform,
  SocialPost,
  SocialAccount,
  SocialCampaign,
  PostQueryOptions,
  AggregatedAnalytics,
  PlatformPerformance,
  PostAnalytics,
  CalendarMonth,
  ScheduledPostInfo,
  SocialMediaEvent,
  SocialMediaEventHandler,
} from "./types";
import { CreatePostRequest } from "../../../shared/social-media-schema";

// =============================================================================
// SITE-SCOPED SERVICE
// =============================================================================

/**
 * Site-scoped wrapper that enforces tenant isolation
 */
export class SiteScopedSocialMediaService {
  private service: SocialMediaService;
  private siteId: string;
  private userId: number;

  constructor(service: SocialMediaService, siteId: string, userId: number) {
    this.service = service;
    this.siteId = siteId;
    this.userId = userId;
  }

  // ===========================================================================
  // ACCOUNT MANAGEMENT
  // ===========================================================================

  getAuthUrl(platform: SocialPlatform, state: string, redirectUri: string): string {
    return this.service.getAuthUrl(platform, state, redirectUri);
  }

  async connectAccount(platform: SocialPlatform, code: string, redirectUri: string): Promise<SocialAccount> {
    return this.service.connectAccount(this.siteId, this.userId, platform, code, redirectUri);
  }

  async disconnectAccount(accountId: string): Promise<boolean> {
    return this.service.disconnectAccount(this.siteId, accountId);
  }

  async getAccounts(): Promise<SocialAccount[]> {
    return this.service.getAccounts(this.siteId);
  }

  async refreshAccountToken(accountId: string): Promise<boolean> {
    return this.service.refreshAccountToken(this.siteId, accountId);
  }

  // ===========================================================================
  // POST MANAGEMENT
  // ===========================================================================

  async createPost(data: CreatePostRequest): Promise<SocialPost> {
    return this.service.createPost(this.siteId, this.userId, data);
  }

  async updatePost(postId: string, updates: Partial<CreatePostRequest>): Promise<SocialPost | null> {
    return this.service.updatePost(this.siteId, postId, updates);
  }

  async deletePost(postId: string): Promise<boolean> {
    return this.service.deletePost(this.siteId, postId);
  }

  async getPosts(options?: PostQueryOptions): Promise<{ posts: SocialPost[]; total: number }> {
    return this.service.getPosts(this.siteId, options);
  }

  async getPost(postId: string): Promise<SocialPost | null> {
    return this.service.getPost(postId, this.siteId);
  }

  // ===========================================================================
  // PUBLISHING
  // ===========================================================================

  async publishPost(postId: string): Promise<void> {
    return this.service.publishPost(postId, this.siteId);
  }

  async schedulePost(postId: string, scheduledAt: Date): Promise<SocialPost | null> {
    return this.service.schedulePost(postId, scheduledAt);
  }

  async cancelScheduledPost(postId: string): Promise<boolean> {
    return this.service.cancelScheduledPost(postId);
  }

  // ===========================================================================
  // CALENDAR
  // ===========================================================================

  async getCalendar(year: number, month: number): Promise<CalendarMonth> {
    return this.service.getCalendar(this.siteId, year, month);
  }

  async getUpcomingPosts(limit?: number): Promise<ScheduledPostInfo[]> {
    return this.service.getUpcomingPosts(this.siteId, limit);
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  async getPostAnalytics(postId: string): Promise<AggregatedAnalytics | null> {
    return this.service.getPostAnalytics(postId);
  }

  async getPlatformPerformance(platform: SocialPlatform, days?: number): Promise<PlatformPerformance> {
    return this.service.getPlatformPerformance(this.siteId, platform, days);
  }

  async getTopPosts(limit?: number): Promise<PostAnalytics[]> {
    return this.service.getTopPosts(this.siteId, limit);
  }

  // ===========================================================================
  // CAMPAIGNS
  // ===========================================================================

  async createCampaign(
    name: string,
    options?: { description?: string; startDate?: Date; endDate?: Date; tags?: string[] }
  ): Promise<SocialCampaign> {
    return this.service.createCampaign(this.siteId, this.userId, name, options);
  }

  async getCampaigns(): Promise<SocialCampaign[]> {
    return this.service.getCampaigns(this.siteId);
  }

  async getCampaignPerformance(campaignId: string): Promise<AggregatedAnalytics | null> {
    return this.service.getCampaignPerformance(campaignId);
  }

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  onEvent(handler: SocialMediaEventHandler): () => void {
    // Filter events for this site
    return this.service.onEvent((event: SocialMediaEvent) => {
      if (!event.siteId || event.siteId === this.siteId) {
        handler(event);
      }
    });
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  getSupportedPlatforms(): SocialPlatform[] {
    return this.service.getSupportedPlatforms();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a site-scoped service instance
 */
export function createSiteScopedService(siteId: string, userId: number): SiteScopedSocialMediaService {
  const service = getSocialMediaService();
  return new SiteScopedSocialMediaService(service, siteId, userId);
}
