/**
 * @file scheduler.ts
 * @description Content calendar and scheduled post processing
 * @phase Phase 3B - Social Media Integration
 */

import { createModuleLogger } from "../../logger";
import { PublishingQueue } from "./publishing-queue";
import type {
  SocialPost,
  ISocialPostStorage,
  ScheduledPostInfo,
  CalendarDay,
  CalendarMonth,
  SocialPlatform,
} from "./types";

const log = createModuleLogger("social-media-scheduler");

// =============================================================================
// CONTENT SCHEDULER
// =============================================================================

export interface ContentSchedulerConfig {
  /** Check interval in ms */
  checkIntervalMs: number;
  /** Lookahead window in ms (how far ahead to check) */
  lookaheadMs: number;
}

const DEFAULT_CONFIG: ContentSchedulerConfig = {
  checkIntervalMs: 60000, // 1 minute
  lookaheadMs: 300000, // 5 minutes
};

export class ContentScheduler {
  private config: ContentSchedulerConfig;
  private postStorage: ISocialPostStorage;
  private queue: PublishingQueue;
  private timer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(
    postStorage: ISocialPostStorage,
    queue: PublishingQueue,
    config: Partial<ContentSchedulerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.postStorage = postStorage;
    this.queue = queue;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleCheck();
    log.info({ intervalMs: this.config.checkIntervalMs }, "Content scheduler started");
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info("Content scheduler stopped");
  }

  // ===========================================================================
  // SCHEDULING OPERATIONS
  // ===========================================================================

  /**
   * Schedule a post for a specific time
   */
  async schedulePost(postId: string, scheduledAt: Date): Promise<SocialPost | null> {
    const post = await this.postStorage.getById(postId);
    if (!post) return null;

    const updated = await this.postStorage.update(postId, {
      scheduledAt,
      status: "scheduled",
    });

    if (updated) {
      log.info({ postId, scheduledAt }, "Post scheduled");
    }

    return updated;
  }

  /**
   * Reschedule an existing scheduled post
   */
  async reschedulePost(postId: string, newScheduledAt: Date): Promise<SocialPost | null> {
    const post = await this.postStorage.getById(postId);
    if (!post) return null;

    if (post.status !== "scheduled" && post.status !== "draft") {
      log.warn({ postId, status: post.status }, "Cannot reschedule post in current status");
      return null;
    }

    // Cancel existing queue jobs
    await this.queue.cancelPost(postId);

    return this.schedulePost(postId, newScheduledAt);
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(postId: string): Promise<boolean> {
    const post = await this.postStorage.getById(postId);
    if (!post || post.status !== "scheduled") return false;

    await this.queue.cancelPost(postId);
    await this.postStorage.update(postId, {
      status: "draft",
      scheduledAt: null,
    });

    log.info({ postId }, "Scheduled post cancelled");
    return true;
  }

  // ===========================================================================
  // CALENDAR QUERIES
  // ===========================================================================

  /**
   * Get scheduled posts within a date range
   */
  async getScheduledPosts(siteId: string, start: Date, end: Date): Promise<ScheduledPostInfo[]> {
    const posts = await this.postStorage.getByDateRange(siteId, start, end);

    return posts
      .filter(p => p.status === "scheduled" || p.status === "published")
      .map(p => ({
        postId: p.id,
        scheduledAt: p.scheduledAt ?? p.publishedAt ?? new Date(),
        platforms: p.platforms.filter(t => t.enabled).map(t => t.platform),
        status: p.status,
      }));
  }

  /**
   * Get posts grouped by day
   */
  async getPostsByDay(siteId: string, date: Date): Promise<CalendarDay> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const posts = await this.getScheduledPosts(siteId, startOfDay, endOfDay);

    return {
      date: startOfDay,
      posts,
    };
  }

  /**
   * Get calendar view for a month
   */
  async getCalendarMonth(siteId: string, year: number, month: number): Promise<CalendarMonth> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const allPosts = await this.getScheduledPosts(siteId, startOfMonth, endOfMonth);

    // Group by day
    const dayMap = new Map<string, ScheduledPostInfo[]>();
    for (const post of allPosts) {
      const dayKey = post.scheduledAt.toISOString().split("T")[0];
      const existing = dayMap.get(dayKey) ?? [];
      existing.push(post);
      dayMap.set(dayKey, existing);
    }

    // Build days array
    const days: CalendarDay[] = [];
    const daysInMonth = endOfMonth.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayKey = date.toISOString().split("T")[0];
      days.push({
        date,
        posts: dayMap.get(dayKey) ?? [],
      });
    }

    return {
      year,
      month,
      days,
      totalPosts: allPosts.length,
    };
  }

  /**
   * Get upcoming posts
   */
  async getUpcomingPosts(siteId: string, limit: number = 10): Promise<ScheduledPostInfo[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

    const posts = await this.getScheduledPosts(siteId, now, futureDate);
    return posts
      .filter(p => p.status === "scheduled")
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get posting frequency stats
   */
  async getPostingStats(siteId: string, days: number = 30): Promise<{
    totalPosts: number;
    postsPerDay: number;
    byPlatform: Record<SocialPlatform, number>;
    byDayOfWeek: Record<number, number>;
    byHour: Record<number, number>;
  }> {
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const posts = await this.getScheduledPosts(siteId, start, now);
    const publishedPosts = posts.filter(p => p.status === "published");

    const byPlatform: Record<string, number> = {};
    const byDayOfWeek: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const byHour: Record<number, number> = {};
    for (let i = 0; i < 24; i++) byHour[i] = 0;

    for (const post of publishedPosts) {
      // Count by platform
      for (const platform of post.platforms) {
        byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
      }

      // Count by day of week
      const dayOfWeek = post.scheduledAt.getDay();
      byDayOfWeek[dayOfWeek]++;

      // Count by hour
      const hour = post.scheduledAt.getHours();
      byHour[hour]++;
    }

    return {
      totalPosts: publishedPosts.length,
      postsPerDay: publishedPosts.length / days,
      byPlatform: byPlatform as Record<SocialPlatform, number>,
      byDayOfWeek,
      byHour,
    };
  }

  // ===========================================================================
  // INTERNAL PROCESSING
  // ===========================================================================

  private scheduleCheck(): void {
    if (!this.running) return;

    this.timer = setTimeout(async () => {
      await this.checkScheduledPosts();
      this.scheduleCheck();
    }, this.config.checkIntervalMs);
  }

  private async checkScheduledPosts(): Promise<void> {
    try {
      const now = new Date();
      const lookahead = new Date(now.getTime() + this.config.lookaheadMs);

      // Get all sites - simplified, actual impl would iterate sites
      // For now, we'll check all scheduled posts across all sites
      const duePosts = await this.findDuePosts(lookahead);

      for (const post of duePosts) {
        await this.publishDuePost(post);
      }

      if (duePosts.length > 0) {
        log.info({ count: duePosts.length }, "Processed scheduled posts");
      }
    } catch (error) {
      log.error({ error }, "Error checking scheduled posts");
    }
  }

  private async findDuePosts(before: Date): Promise<SocialPost[]> {
    // This would need to be implemented per-site in production
    // Simplified: use a dummy siteId or query across all
    const result = await this.postStorage.getAllBySite("*", {
      status: ["scheduled"],
      endDate: before,
      limit: 100,
    });

    return result.posts.filter(
      p => p.status === "scheduled" &&
           p.scheduledAt &&
           new Date(p.scheduledAt) <= before
    );
  }

  private async publishDuePost(post: SocialPost): Promise<void> {
    try {
      // Enqueue for immediate publishing
      await this.queue.enqueue(post);
      log.info({ postId: post.id, scheduledAt: post.scheduledAt }, "Due post queued for publishing");
    } catch (error) {
      log.error({ postId: post.id, error }, "Failed to queue due post");
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createContentScheduler(
  postStorage: ISocialPostStorage,
  queue: PublishingQueue,
  config?: Partial<ContentSchedulerConfig>
): ContentScheduler {
  return new ContentScheduler(postStorage, queue, config);
}
