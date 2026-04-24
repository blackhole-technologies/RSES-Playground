/**
 * @file publishing-queue.ts
 * @description Queue-based bulk publishing with retry and rate limiting
 * @phase Phase 3B - Social Media Integration
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../logger";
import { getConnectorRegistry, type PlatformConnectorRegistry } from "./platform-connectors";
import type {
  SocialPlatform,
  SocialPost,
  PublishJob,
  SocialAccount,
  IPublishQueueStorage,
  ISocialPostStorage,
  ISocialAccountStorage,
  SocialMediaEvent,
  SocialMediaEventHandler,
  OAuth2Tokens,
  PlatformPostStatus,
} from "./types";

const log = createModuleLogger("social-media-queue");

// =============================================================================
// PUBLISHING QUEUE
// =============================================================================

export interface PublishingQueueConfig {
  /** Number of parallel workers */
  workers: number;
  /** Processing interval in ms */
  intervalMs: number;
  /** Max retry attempts */
  maxRetryAttempts: number;
  /** Base retry delay in ms */
  retryBaseDelayMs: number;
  /** Max retry delay in ms */
  retryMaxDelayMs: number;
}

const DEFAULT_CONFIG: PublishingQueueConfig = {
  workers: 3,
  intervalMs: 5000,
  maxRetryAttempts: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000,
};

export class PublishingQueue extends EventEmitter {
  private config: PublishingQueueConfig;
  private queueStorage: IPublishQueueStorage;
  private postStorage: ISocialPostStorage;
  private accountStorage: ISocialAccountStorage;
  private connectorRegistry: PlatformConnectorRegistry;

  private processing: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private activeWorkers: number = 0;
  private eventHandlers: SocialMediaEventHandler[] = [];

  constructor(
    queueStorage: IPublishQueueStorage,
    postStorage: ISocialPostStorage,
    accountStorage: ISocialAccountStorage,
    config: Partial<PublishingQueueConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queueStorage = queueStorage;
    this.postStorage = postStorage;
    this.accountStorage = accountStorage;
    this.connectorRegistry = getConnectorRegistry();
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  start(): void {
    if (this.processing) return;
    this.processing = true;
    this.scheduleProcessing();
    log.info({ workers: this.config.workers, intervalMs: this.config.intervalMs }, "Publishing queue started");
  }

  stop(): void {
    this.processing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info("Publishing queue stopped");
  }

  // ===========================================================================
  // QUEUE OPERATIONS
  // ===========================================================================

  /**
   * Enqueue a post for publishing to all targeted platforms
   */
  async enqueue(post: SocialPost, scheduledAt?: Date): Promise<PublishJob[]> {
    const jobs: PublishJob[] = [];
    const effectiveScheduledAt = scheduledAt ?? new Date();

    for (const target of post.platforms) {
      if (!target.enabled) continue;

      const job: Omit<PublishJob, "createdAt" | "updatedAt"> = {
        id: randomUUID(),
        postId: post.id,
        platform: target.platform,
        accountId: target.accountId,
        priority: 0,
        scheduledAt: effectiveScheduledAt,
        attempts: 0,
        maxAttempts: this.config.maxRetryAttempts,
        lastAttemptAt: null,
        nextAttemptAt: null,
        lastError: null,
        status: "pending",
        externalId: null,
        externalUrl: null,
      };

      const created = await this.queueStorage.create(job);
      jobs.push(created);

      this.emitEvent({
        type: "post:queued",
        timestamp: new Date(),
        siteId: post.siteId,
        userId: post.userId,
        data: { postId: post.id, platform: target.platform, jobId: created.id },
      });
    }

    // Update post status
    await this.postStorage.updateStatus(post.id, "queued");

    log.info({ postId: post.id, jobCount: jobs.length }, "Post enqueued for publishing");
    return jobs;
  }

  /**
   * Schedule a post for future publishing
   */
  async schedulePost(post: SocialPost, scheduledAt: Date): Promise<PublishJob[]> {
    await this.postStorage.update(post.id, { scheduledAt, status: "scheduled" });

    this.emitEvent({
      type: "post:scheduled",
      timestamp: new Date(),
      siteId: post.siteId,
      userId: post.userId,
      data: { postId: post.id, scheduledAt: scheduledAt.toISOString() },
    });

    return this.enqueue(post, scheduledAt);
  }

  /**
   * Cancel a pending job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.queueStorage.getById(jobId);
    if (!job || job.status !== "pending") return false;

    await this.queueStorage.delete(jobId);
    return true;
  }

  /**
   * Cancel all jobs for a post
   */
  async cancelPost(postId: string): Promise<number> {
    const jobs = await this.queueStorage.getByPostId(postId);
    let cancelled = 0;

    for (const job of jobs) {
      if (job.status === "pending") {
        await this.queueStorage.delete(job.id);
        cancelled++;
      }
    }

    if (cancelled > 0) {
      await this.postStorage.updateStatus(postId, "draft");
    }

    return cancelled;
  }

  // ===========================================================================
  // PROCESSING
  // ===========================================================================

  private scheduleProcessing(): void {
    if (!this.processing) return;

    this.timer = setTimeout(async () => {
      await this.processQueue();
      this.scheduleProcessing();
    }, this.config.intervalMs);
  }

  private async processQueue(): Promise<void> {
    if (this.activeWorkers >= this.config.workers) return;

    const availableSlots = this.config.workers - this.activeWorkers;
    const jobs = await this.queueStorage.getNextBatch(availableSlots);

    for (const job of jobs) {
      this.activeWorkers++;
      this.processJob(job).finally(() => {
        this.activeWorkers--;
      });
    }
  }

  private async processJob(job: PublishJob): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark as processing
      await this.queueStorage.markProcessing(job.id);

      this.emitEvent({
        type: "queue:job_started",
        timestamp: new Date(),
        data: { jobId: job.id, postId: job.postId, platform: job.platform },
      });

      // Get required data
      const [post, account] = await Promise.all([
        this.postStorage.getById(job.postId),
        this.accountStorage.getById(job.accountId),
      ]);

      if (!post) {
        throw new Error(`Post not found: ${job.postId}`);
      }
      if (!account) {
        throw new Error(`Account not found: ${job.accountId}`);
      }
      if (!account.connected) {
        throw new Error(`Account disconnected: ${account.accountName}`);
      }

      // Check rate limit
      const connector = this.connectorRegistry.getConnector(job.platform);
      const rateLimitInfo = await connector.checkRateLimit(account.id);
      if (rateLimitInfo.remaining <= 0) {
        // Reschedule after rate limit resets
        await this.queueStorage.update(job.id, {
          status: "pending",
          nextAttemptAt: rateLimitInfo.resetAt,
          lastError: "Rate limit exceeded",
        });
        log.warn({ jobId: job.id, platform: job.platform, resetAt: rateLimitInfo.resetAt }, "Rate limited, rescheduling");
        return;
      }

      // Get tokens (would normally decrypt from credential store)
      const tokens: OAuth2Tokens = {
        accessToken: account.credentialId, // Simplified - actual impl would decrypt
        tokenType: "bearer",
      };

      // Get platform-specific content
      const target = post.platforms.find(t => t.platform === job.platform && t.accountId === job.accountId);
      const content = target?.customContent ?? post.content;
      const mediaUrls = target?.customMediaUrls ?? (post.mediaUrls as string[]);

      // Publish
      await this.postStorage.updateStatus(post.id, "publishing");
      const result = await connector.publishPost(tokens, content, mediaUrls, post.link ?? undefined);

      if (result.success) {
        // Success
        await this.queueStorage.markCompleted(job.id, result.externalId!, result.externalUrl);

        // Update post platform status
        const platformStatus: PlatformPostStatus = {
          status: "published",
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          publishedAt: new Date().toISOString(),
          retryCount: job.attempts,
        };
        await this.postStorage.updatePlatformStatus(post.id, job.platform, platformStatus);

        // Check if all platforms are published
        await this.checkAllPlatformsPublished(post.id);

        this.emitEvent({
          type: "queue:job_completed",
          timestamp: new Date(),
          siteId: post.siteId,
          userId: post.userId,
          data: {
            jobId: job.id,
            postId: post.id,
            platform: job.platform,
            externalId: result.externalId,
            externalUrl: result.externalUrl,
            durationMs: Date.now() - startTime,
          },
        });

        log.info({ jobId: job.id, postId: post.id, platform: job.platform, externalId: result.externalId }, "Post published successfully");
      } else {
        throw new Error(result.error ?? "Unknown publish error");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.handleFailure(job, errorMessage);
    }
  }

  private async handleFailure(job: PublishJob, error: string): Promise<void> {
    const attempts = job.attempts + 1;

    if (attempts >= job.maxAttempts) {
      // Move to dead letter
      await this.queueStorage.moveToDeadLetter(job.id);

      // Update post platform status
      const platformStatus: PlatformPostStatus = {
        status: "failed",
        error,
        retryCount: attempts,
      };
      const post = await this.postStorage.getById(job.postId);
      if (post) {
        await this.postStorage.updatePlatformStatus(post.id, job.platform, platformStatus);
      }

      this.emitEvent({
        type: "queue:job_dead_letter",
        timestamp: new Date(),
        data: { jobId: job.id, postId: job.postId, platform: job.platform, error, attempts },
      });

      log.error({ jobId: job.id, postId: job.postId, platform: job.platform, error, attempts }, "Job moved to dead letter");
    } else {
      // Schedule retry
      const nextAttemptAt = this.calculateRetryDelay(attempts);
      await this.queueStorage.markFailed(job.id, error);

      this.emitEvent({
        type: "queue:job_retrying",
        timestamp: new Date(),
        data: { jobId: job.id, postId: job.postId, platform: job.platform, error, attempts, nextAttemptAt },
      });

      log.warn({ jobId: job.id, postId: job.postId, platform: job.platform, error, attempts, nextAttemptAt }, "Job failed, scheduling retry");
    }
  }

  private calculateRetryDelay(attempts: number): Date {
    const delay = Math.min(
      this.config.retryBaseDelayMs * Math.pow(2, attempts - 1),
      this.config.retryMaxDelayMs
    );
    const jitter = Math.random() * delay * 0.25;
    return new Date(Date.now() + delay + jitter);
  }

  private async checkAllPlatformsPublished(postId: string): Promise<void> {
    const post = await this.postStorage.getById(postId);
    if (!post) return;

    const platformStatuses = post.platformStatuses as Record<string, PlatformPostStatus>;
    const enabledPlatforms = post.platforms.filter(p => p.enabled);

    const allPublished = enabledPlatforms.every(
      target => platformStatuses[target.platform]?.status === "published"
    );

    if (allPublished) {
      await this.postStorage.update(postId, {
        status: "published",
        publishedAt: new Date(),
      });

      this.emitEvent({
        type: "post:published",
        timestamp: new Date(),
        siteId: post.siteId,
        userId: post.userId,
        data: { postId, platforms: enabledPlatforms.map(p => p.platform) },
      });
    }
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

  // ===========================================================================
  // STATS
  // ===========================================================================

  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    deadLetter: number;
  }> {
    const all = await this.queueStorage.getPending();
    const stats = { pending: 0, processing: 0, completed: 0, failed: 0, deadLetter: 0 };

    // This is a simplified version - actual impl would have dedicated count queries
    for (const job of all) {
      if (job.status === "pending") stats.pending++;
      else if (job.status === "processing") stats.processing++;
      else if (job.status === "completed") stats.completed++;
      else if (job.status === "failed") stats.failed++;
      else if (job.status === "dead_letter") stats.deadLetter++;
    }

    return stats;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createPublishingQueue(
  queueStorage: IPublishQueueStorage,
  postStorage: ISocialPostStorage,
  accountStorage: ISocialAccountStorage,
  config?: Partial<PublishingQueueConfig>
): PublishingQueue {
  return new PublishingQueue(queueStorage, postStorage, accountStorage, config);
}
