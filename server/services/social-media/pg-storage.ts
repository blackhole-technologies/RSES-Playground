/**
 * @file pg-storage.ts
 * @description PostgreSQL storage implementation for Social Media service
 * @phase Phase 3B - Social Media Integration
 */

import { eq, and, desc, asc, sql, gte, lte, or, ilike } from "drizzle-orm";
import { db } from "../../db";
import {
  socialAccounts,
  socialPosts,
  socialPublishQueue,
  socialPostAnalytics,
  socialCampaigns,
  type SocialPlatform,
  type PostStatus,
  type PlatformPostStatus,
} from "../../../shared/social-media-schema";
import type {
  SocialAccount,
  SocialPost,
  PublishJob,
  PostAnalytics,
  SocialCampaign,
  ISocialAccountStorage,
  ISocialPostStorage,
  IPublishQueueStorage,
  IPostAnalyticsStorage,
  ICampaignStorage,
  PostQueryOptions,
  AggregatedAnalytics,
  AnalyticsMetric,
} from "./types";
import { createModuleLogger } from "../../logger";
import { escapeLikePattern } from "../../lib/sql-utils";

const log = createModuleLogger("social-media-storage");

// =============================================================================
// SOCIAL ACCOUNT STORAGE
// =============================================================================

export class PgSocialAccountStorage implements ISocialAccountStorage {
  async getById(id: string): Promise<SocialAccount | null> {
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    return account ?? null;
  }

  async getByPlatformAccountId(platform: SocialPlatform, accountId: string): Promise<SocialAccount | null> {
    const [account] = await db.select().from(socialAccounts)
      .where(and(
        eq(socialAccounts.platform, platform),
        eq(socialAccounts.accountId, accountId)
      ));
    return account ?? null;
  }

  async getAllBySite(siteId: string): Promise<SocialAccount[]> {
    return db.select().from(socialAccounts)
      .where(eq(socialAccounts.siteId, siteId))
      .orderBy(desc(socialAccounts.createdAt));
  }

  async getAllByUser(userId: number): Promise<SocialAccount[]> {
    return db.select().from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .orderBy(desc(socialAccounts.createdAt));
  }

  async create(account: Omit<SocialAccount, "createdAt" | "updatedAt">): Promise<SocialAccount> {
    const [created] = await db.insert(socialAccounts)
      .values({ ...account, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    log.info({ accountId: created.id, platform: account.platform }, "Social account created");
    return created;
  }

  async update(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount | null> {
    const [updated] = await db.update(socialAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialAccounts.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getConnectedBySite(siteId: string): Promise<SocialAccount[]> {
    return db.select().from(socialAccounts)
      .where(and(
        eq(socialAccounts.siteId, siteId),
        eq(socialAccounts.connected, true)
      ))
      .orderBy(socialAccounts.platform);
  }

  async getByPlatform(siteId: string, platform: SocialPlatform): Promise<SocialAccount[]> {
    return db.select().from(socialAccounts)
      .where(and(
        eq(socialAccounts.siteId, siteId),
        eq(socialAccounts.platform, platform)
      ));
  }

  async getExpiringSoon(hours: number): Promise<SocialAccount[]> {
    const threshold = new Date(Date.now() + hours * 60 * 60 * 1000);
    return db.select().from(socialAccounts)
      .where(and(
        eq(socialAccounts.connected, true),
        lte(socialAccounts.tokenExpiresAt, threshold)
      ));
  }
}

// =============================================================================
// SOCIAL POST STORAGE
// =============================================================================

export class PgSocialPostStorage implements ISocialPostStorage {
  async getById(id: string): Promise<SocialPost | null> {
    const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    return post ?? null;
  }

  async getAllBySite(siteId: string, options: PostQueryOptions = {}): Promise<{ posts: SocialPost[]; total: number }> {
    const {
      limit = 50,
      offset = 0,
      status,
      platforms,
      campaignId,
      startDate,
      endDate,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const conditions = [eq(socialPosts.siteId, siteId)];

    if (status?.length) {
      conditions.push(sql`${socialPosts.status} = ANY(${status})`);
    }
    if (campaignId) {
      conditions.push(eq(socialPosts.campaignId, campaignId));
    }
    if (startDate) {
      conditions.push(gte(socialPosts.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(socialPosts.createdAt, endDate));
    }
    if (search) {
      conditions.push(ilike(socialPosts.content, `%${escapeLikePattern(search)}%`));
    }

    const sortColumn = socialPosts[sortBy] ?? socialPosts.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const posts = await db.select().from(socialPosts)
      .where(and(...conditions))
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(socialPosts)
      .where(and(...conditions));

    return { posts, total: Number(count) };
  }

  async create(post: Omit<SocialPost, "createdAt" | "updatedAt">): Promise<SocialPost> {
    const [created] = await db.insert(socialPosts)
      .values({ ...post, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    log.info({ postId: created.id, status: post.status }, "Social post created");
    return created;
  }

  async update(id: string, updates: Partial<SocialPost>): Promise<SocialPost | null> {
    const [updated] = await db.update(socialPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPosts.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(socialPosts).where(eq(socialPosts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateStatus(id: string, status: PostStatus): Promise<SocialPost | null> {
    return this.update(id, { status });
  }

  async updatePlatformStatus(id: string, platform: SocialPlatform, platformStatus: PlatformPostStatus): Promise<SocialPost | null> {
    const post = await this.getById(id);
    if (!post) return null;

    const platformStatuses = { ...(post.platformStatuses as Record<string, PlatformPostStatus>), [platform]: platformStatus };
    return this.update(id, { platformStatuses });
  }

  async getScheduled(siteId: string, before: Date): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(and(
        eq(socialPosts.siteId, siteId),
        eq(socialPosts.status, "scheduled"),
        lte(socialPosts.scheduledAt, before)
      ))
      .orderBy(asc(socialPosts.scheduledAt));
  }

  async getByCampaign(campaignId: string): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(eq(socialPosts.campaignId, campaignId))
      .orderBy(desc(socialPosts.createdAt));
  }

  async getByDateRange(siteId: string, start: Date, end: Date): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(and(
        eq(socialPosts.siteId, siteId),
        or(
          and(gte(socialPosts.scheduledAt, start), lte(socialPosts.scheduledAt, end)),
          and(gte(socialPosts.publishedAt, start), lte(socialPosts.publishedAt, end))
        )
      ))
      .orderBy(asc(socialPosts.scheduledAt));
  }

  async getByStatus(siteId: string, status: PostStatus): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(and(
        eq(socialPosts.siteId, siteId),
        eq(socialPosts.status, status)
      ))
      .orderBy(desc(socialPosts.createdAt));
  }
}

// =============================================================================
// PUBLISH QUEUE STORAGE
// =============================================================================

export class PgPublishQueueStorage implements IPublishQueueStorage {
  async getById(id: string): Promise<PublishJob | null> {
    const [job] = await db.select().from(socialPublishQueue).where(eq(socialPublishQueue.id, id));
    return job ?? null;
  }

  async create(job: Omit<PublishJob, "createdAt" | "updatedAt">): Promise<PublishJob> {
    const [created] = await db.insert(socialPublishQueue)
      .values({ ...job, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    log.debug({ jobId: created.id, postId: job.postId, platform: job.platform }, "Publish job created");
    return created;
  }

  async update(id: string, updates: Partial<PublishJob>): Promise<PublishJob | null> {
    const [updated] = await db.update(socialPublishQueue)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPublishQueue.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(socialPublishQueue).where(eq(socialPublishQueue.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getNextBatch(limit: number): Promise<PublishJob[]> {
    const now = new Date();
    return db.select().from(socialPublishQueue)
      .where(and(
        eq(socialPublishQueue.status, "pending"),
        lte(socialPublishQueue.scheduledAt, now),
        or(
          sql`${socialPublishQueue.nextAttemptAt} IS NULL`,
          lte(socialPublishQueue.nextAttemptAt, now)
        )
      ))
      .orderBy(desc(socialPublishQueue.priority), asc(socialPublishQueue.scheduledAt))
      .limit(limit);
  }

  async getByPostId(postId: string): Promise<PublishJob[]> {
    return db.select().from(socialPublishQueue)
      .where(eq(socialPublishQueue.postId, postId))
      .orderBy(socialPublishQueue.platform);
  }

  async getPending(): Promise<PublishJob[]> {
    return db.select().from(socialPublishQueue)
      .where(eq(socialPublishQueue.status, "pending"))
      .orderBy(asc(socialPublishQueue.scheduledAt));
  }

  async getFailedForRetry(): Promise<PublishJob[]> {
    const now = new Date();
    return db.select().from(socialPublishQueue)
      .where(and(
        eq(socialPublishQueue.status, "failed"),
        sql`${socialPublishQueue.attempts} < ${socialPublishQueue.maxAttempts}`,
        or(
          sql`${socialPublishQueue.nextAttemptAt} IS NULL`,
          lte(socialPublishQueue.nextAttemptAt, now)
        )
      ))
      .orderBy(asc(socialPublishQueue.nextAttemptAt));
  }

  async markProcessing(id: string): Promise<PublishJob | null> {
    return this.update(id, { status: "processing", lastAttemptAt: new Date() });
  }

  async markCompleted(id: string, externalId: string, externalUrl?: string): Promise<PublishJob | null> {
    return this.update(id, { status: "completed", externalId, externalUrl });
  }

  async markFailed(id: string, error: string): Promise<PublishJob | null> {
    const job = await this.getById(id);
    if (!job) return null;

    const attempts = job.attempts + 1;
    const nextAttemptAt = this.calculateNextAttempt(attempts);

    return this.update(id, {
      status: attempts >= job.maxAttempts ? "failed" : "pending",
      attempts,
      lastError: error,
      nextAttemptAt,
    });
  }

  async moveToDeadLetter(id: string): Promise<PublishJob | null> {
    return this.update(id, { status: "dead_letter" });
  }

  async deleteCompletedOlderThan(date: Date): Promise<number> {
    const result = await db.delete(socialPublishQueue)
      .where(and(
        eq(socialPublishQueue.status, "completed"),
        lte(socialPublishQueue.updatedAt, date)
      ));
    return result.rowCount ?? 0;
  }

  private calculateNextAttempt(attempts: number): Date {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s... capped at 5 minutes
    const baseDelay = 1000;
    const maxDelay = 300000;
    const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);
    // Add jitter (0-25% of delay)
    const jitter = Math.random() * delay * 0.25;
    return new Date(Date.now() + delay + jitter);
  }
}

// =============================================================================
// POST ANALYTICS STORAGE
// =============================================================================

export class PgPostAnalyticsStorage implements IPostAnalyticsStorage {
  async getById(id: string): Promise<PostAnalytics | null> {
    const [analytics] = await db.select().from(socialPostAnalytics).where(eq(socialPostAnalytics.id, id));
    return analytics ?? null;
  }

  async getByPostId(postId: string): Promise<PostAnalytics[]> {
    return db.select().from(socialPostAnalytics)
      .where(eq(socialPostAnalytics.postId, postId));
  }

  async getByPostAndPlatform(postId: string, platform: SocialPlatform): Promise<PostAnalytics | null> {
    const [analytics] = await db.select().from(socialPostAnalytics)
      .where(and(
        eq(socialPostAnalytics.postId, postId),
        eq(socialPostAnalytics.platform, platform)
      ));
    return analytics ?? null;
  }

  async create(analytics: Omit<PostAnalytics, "createdAt" | "updatedAt">): Promise<PostAnalytics> {
    const [created] = await db.insert(socialPostAnalytics)
      .values({ ...analytics, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return created;
  }

  async update(id: string, updates: Partial<PostAnalytics>): Promise<PostAnalytics | null> {
    const [updated] = await db.update(socialPostAnalytics)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPostAnalytics.id, id))
      .returning();
    return updated ?? null;
  }

  async upsert(analytics: Omit<PostAnalytics, "createdAt" | "updatedAt">): Promise<PostAnalytics> {
    const existing = await this.getByPostAndPlatform(analytics.postId, analytics.platform);
    if (existing) {
      const updated = await this.update(existing.id, {
        ...analytics,
        history: [...(existing.history as unknown[]), this.createSnapshot(analytics)] as PostAnalytics["history"],
        fetchedAt: new Date(),
      });
      return updated!;
    }
    return this.create(analytics);
  }

  async getAggregatedByPost(postId: string): Promise<AggregatedAnalytics | null> {
    const analytics = await this.getByPostId(postId);
    if (!analytics.length) return null;
    return this.aggregate(analytics);
  }

  async getAggregatedByCampaign(campaignId: string): Promise<AggregatedAnalytics | null> {
    const posts = await db.select().from(socialPosts)
      .where(eq(socialPosts.campaignId, campaignId));

    if (!posts.length) return null;

    const allAnalytics: PostAnalytics[] = [];
    for (const post of posts) {
      const postAnalytics = await this.getByPostId(post.id);
      allAnalytics.push(...postAnalytics);
    }

    if (!allAnalytics.length) return null;
    return this.aggregate(allAnalytics);
  }

  async getTopPerforming(siteId: string, limit: number, metric: AnalyticsMetric): Promise<PostAnalytics[]> {
    const column = socialPostAnalytics[metric] ?? socialPostAnalytics.engagementRate;
    return db.select().from(socialPostAnalytics)
      .innerJoin(socialPosts, eq(socialPostAnalytics.postId, socialPosts.id))
      .where(eq(socialPosts.siteId, siteId))
      .orderBy(desc(column))
      .limit(limit)
      .then(rows => rows.map(r => r.social_post_analytics));
  }

  private createSnapshot(analytics: Partial<PostAnalytics>): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      impressions: analytics.impressions ?? 0,
      reach: analytics.reach ?? 0,
      likes: analytics.likes ?? 0,
      shares: analytics.shares ?? 0,
      comments: analytics.comments ?? 0,
      clicks: analytics.clicks ?? 0,
      saves: analytics.saves ?? 0,
      videoViews: analytics.videoViews,
      engagementRate: analytics.engagementRate ?? 0,
    };
  }

  private aggregate(analytics: PostAnalytics[]): AggregatedAnalytics {
    const byPlatform: AggregatedAnalytics["byPlatform"] = {} as AggregatedAnalytics["byPlatform"];
    let totalImpressions = 0, totalReach = 0, totalLikes = 0, totalShares = 0;
    let totalComments = 0, totalClicks = 0, totalSaves = 0, engagementSum = 0;

    for (const a of analytics) {
      totalImpressions += a.impressions;
      totalReach += a.reach;
      totalLikes += a.likes;
      totalShares += a.shares;
      totalComments += a.comments;
      totalClicks += a.clicks;
      totalSaves += a.saves;
      engagementSum += a.engagementRate;

      if (!byPlatform[a.platform]) {
        byPlatform[a.platform] = {
          impressions: 0, reach: 0, likes: 0, shares: 0,
          comments: 0, clicks: 0, engagementRate: 0,
        };
      }
      byPlatform[a.platform].impressions += a.impressions;
      byPlatform[a.platform].reach += a.reach;
      byPlatform[a.platform].likes += a.likes;
      byPlatform[a.platform].shares += a.shares;
      byPlatform[a.platform].comments += a.comments;
      byPlatform[a.platform].clicks += a.clicks;
    }

    // Calculate average engagement rates per platform
    const platformCounts: Record<string, number> = {};
    for (const a of analytics) {
      platformCounts[a.platform] = (platformCounts[a.platform] ?? 0) + 1;
    }
    for (const [platform, data] of Object.entries(byPlatform)) {
      const count = platformCounts[platform] ?? 1;
      data.engagementRate = analytics
        .filter(a => a.platform === platform)
        .reduce((sum, a) => sum + a.engagementRate, 0) / count;
    }

    return {
      totalImpressions,
      totalReach,
      totalLikes,
      totalShares,
      totalComments,
      totalClicks,
      totalSaves,
      averageEngagementRate: analytics.length ? engagementSum / analytics.length : 0,
      byPlatform,
    };
  }
}

// =============================================================================
// CAMPAIGN STORAGE
// =============================================================================

export class PgCampaignStorage implements ICampaignStorage {
  async getById(id: string): Promise<SocialCampaign | null> {
    const [campaign] = await db.select().from(socialCampaigns).where(eq(socialCampaigns.id, id));
    return campaign ?? null;
  }

  async getAllBySite(siteId: string): Promise<SocialCampaign[]> {
    return db.select().from(socialCampaigns)
      .where(eq(socialCampaigns.siteId, siteId))
      .orderBy(desc(socialCampaigns.createdAt));
  }

  async create(campaign: Omit<SocialCampaign, "createdAt" | "updatedAt">): Promise<SocialCampaign> {
    const [created] = await db.insert(socialCampaigns)
      .values({ ...campaign, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    log.info({ campaignId: created.id, name: campaign.name }, "Campaign created");
    return created;
  }

  async update(id: string, updates: Partial<SocialCampaign>): Promise<SocialCampaign | null> {
    const [updated] = await db.update(socialCampaigns)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialCampaigns.id, id))
      .returning();
    return updated ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(socialCampaigns).where(eq(socialCampaigns.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getActive(siteId: string): Promise<SocialCampaign[]> {
    return db.select().from(socialCampaigns)
      .where(and(
        eq(socialCampaigns.siteId, siteId),
        eq(socialCampaigns.status, "active")
      ))
      .orderBy(desc(socialCampaigns.startDate));
  }

  async updateMetrics(id: string): Promise<SocialCampaign | null> {
    const campaign = await this.getById(id);
    if (!campaign) return null;

    // Count posts and aggregate metrics
    const posts = await db.select().from(socialPosts)
      .where(eq(socialPosts.campaignId, id));

    const analyticsStorage = new PgPostAnalyticsStorage();
    let totalImpressions = 0;
    let totalEngagements = 0;

    for (const post of posts) {
      const postAnalytics = await analyticsStorage.getByPostId(post.id);
      for (const a of postAnalytics) {
        totalImpressions += a.impressions;
        totalEngagements += a.likes + a.shares + a.comments + a.clicks;
      }
    }

    return this.update(id, {
      totalPosts: posts.length,
      totalImpressions,
      totalEngagements,
    });
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createAccountStorage(): ISocialAccountStorage {
  return new PgSocialAccountStorage();
}

export function createPostStorage(): ISocialPostStorage {
  return new PgSocialPostStorage();
}

export function createQueueStorage(): IPublishQueueStorage {
  return new PgPublishQueueStorage();
}

export function createAnalyticsStorage(): IPostAnalyticsStorage {
  return new PgPostAnalyticsStorage();
}

export function createCampaignStorage(): ICampaignStorage {
  return new PgCampaignStorage();
}
