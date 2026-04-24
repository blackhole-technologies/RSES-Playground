/**
 * @file index.ts
 * @description Social Media Integration service entry point
 * @phase Phase 3B - Social Media Integration
 */

import { SocialMediaService } from "./social-media-service";
import type { SocialMediaServiceConfig } from "./types";
import { createModuleLogger } from "../../logger";

const log = createModuleLogger("social-media");

// =============================================================================
// SINGLETON MANAGEMENT
// =============================================================================

let instance: SocialMediaService | null = null;

/**
 * Get the social media service instance (lazy initialization)
 */
export function getSocialMediaService(): SocialMediaService {
  if (!instance) {
    instance = new SocialMediaService();
  }
  return instance;
}

/**
 * Create and initialize the social media service
 */
export async function createSocialMediaService(
  config?: Partial<SocialMediaServiceConfig>
): Promise<SocialMediaService> {
  if (!instance) {
    instance = new SocialMediaService(config);
  }
  await instance.initialize();
  log.info("Social media service created and initialized");
  return instance;
}

/**
 * Shutdown the social media service
 */
export async function shutdownSocialMediaService(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
    log.info("Social media service shut down");
  }
}

/**
 * Reset the service (for testing)
 */
export function resetSocialMediaService(): void {
  if (instance) {
    instance.shutdown().catch(() => {});
    instance = null;
  }
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { SocialMediaService } from "./social-media-service";
export { SiteScopedSocialMediaService, createSiteScopedService } from "./site-scoped";
export { PublishingQueue, createPublishingQueue } from "./publishing-queue";
export { ContentScheduler, createContentScheduler } from "./scheduler";
export { AnalyticsCollector, createAnalyticsCollector } from "./analytics-collector";
export {
  getConnectorRegistry,
  PlatformConnectorRegistry,
  TwitterConnector,
  FacebookConnector,
  InstagramConnector,
  LinkedInConnector,
  TikTokConnector,
  YouTubeConnector,
} from "./platform-connectors";
export {
  createAccountStorage,
  createPostStorage,
  createQueueStorage,
  createAnalyticsStorage,
  createCampaignStorage,
} from "./pg-storage";

// Type exports
export type {
  SocialMediaServiceConfig,
  SocialPlatform,
  PostStatus,
  PublishJobStatus,
  SocialAccount,
  SocialPost,
  PublishJob,
  PostAnalytics,
  SocialCampaign,
  PlatformTarget,
  PlatformPostStatus,
  AnalyticsSnapshot,
  OAuth2Tokens,
  PlatformAccountInfo,
  PlatformPublishResult,
  PlatformAnalyticsResult,
  RateLimitInfo,
  AggregatedAnalytics,
  PlatformPerformance,
  PostQueryOptions,
  SocialMediaEvent,
  SocialMediaEventHandler,
  CalendarDay,
  CalendarMonth,
  ScheduledPostInfo,
  IPlatformConnector,
  ISocialAccountStorage,
  ISocialPostStorage,
  IPublishQueueStorage,
  IPostAnalyticsStorage,
  ICampaignStorage,
} from "./types";
