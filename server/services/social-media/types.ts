/**
 * @file types.ts
 * @description Type definitions for Social Media Integration service
 * @phase Phase 3B - Social Media Integration
 */

import type {
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
} from "../../../shared/social-media-schema";

// Re-export schema types
export type {
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
};

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

export interface SocialMediaServiceConfig {
  /** Enable publishing queue processing */
  enableQueue: boolean;
  /** Enable scheduled post processing */
  enableScheduler: boolean;
  /** Enable analytics collection */
  enableAnalytics: boolean;
  /** Number of parallel publish workers */
  queueWorkers: number;
  /** Queue processing interval in ms */
  queueIntervalMs: number;
  /** Scheduler check interval in ms */
  schedulerIntervalMs: number;
  /** Analytics fetch interval in ms */
  analyticsFetchIntervalMs: number;
  /** Max retry attempts for failed publishes */
  maxRetryAttempts: number;
  /** Base retry delay in ms */
  retryBaseDelayMs: number;
  /** Max retry delay in ms */
  retryMaxDelayMs: number;
}

export const DEFAULT_CONFIG: SocialMediaServiceConfig = {
  enableQueue: true,
  enableScheduler: true,
  enableAnalytics: true,
  queueWorkers: 3,
  queueIntervalMs: 5000, // 5 seconds
  schedulerIntervalMs: 60000, // 1 minute
  analyticsFetchIntervalMs: 300000, // 5 minutes
  maxRetryAttempts: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000, // 5 minutes
};

// =============================================================================
// PLATFORM CONNECTOR TYPES
// =============================================================================

export interface OAuth2Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
}

export interface PlatformAccountInfo {
  accountId: string;
  accountName: string;
  accountUrl?: string;
  avatarUrl?: string;
  followerCount?: number;
  metadata?: Record<string, unknown>;
}

export interface PlatformPublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  rateLimitInfo?: RateLimitInfo;
}

export interface PlatformAnalyticsResult {
  impressions: number;
  reach: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  saves: number;
  videoViews?: number;
  watchTime?: number;
  engagementRate: number;
  rawData?: Record<string, unknown>;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

export interface PlatformRateLimits {
  requestsPerWindow: number;
  windowSeconds: number;
  dailyLimit?: number;
}

export const PLATFORM_RATE_LIMITS: Record<SocialPlatform, PlatformRateLimits> = {
  twitter: { requestsPerWindow: 300, windowSeconds: 900, dailyLimit: 2400 }, // 15 min window
  facebook: { requestsPerWindow: 200, windowSeconds: 3600 }, // 1 hour window
  instagram: { requestsPerWindow: 200, windowSeconds: 3600 },
  linkedin: { requestsPerWindow: 100, windowSeconds: 60, dailyLimit: 100000 },
  tiktok: { requestsPerWindow: 1000, windowSeconds: 86400 }, // Daily limit
  youtube: { requestsPerWindow: 10000, windowSeconds: 86400 },
};

// =============================================================================
// STORAGE INTERFACES
// =============================================================================

export interface ISocialAccountStorage {
  // CRUD
  getById(id: string): Promise<SocialAccount | null>;
  getByPlatformAccountId(platform: SocialPlatform, accountId: string): Promise<SocialAccount | null>;
  getAllBySite(siteId: string): Promise<SocialAccount[]>;
  getAllByUser(userId: number): Promise<SocialAccount[]>;
  create(account: Omit<SocialAccount, "createdAt" | "updatedAt">): Promise<SocialAccount>;
  update(id: string, updates: Partial<SocialAccount>): Promise<SocialAccount | null>;
  delete(id: string): Promise<boolean>;

  // Queries
  getConnectedBySite(siteId: string): Promise<SocialAccount[]>;
  getByPlatform(siteId: string, platform: SocialPlatform): Promise<SocialAccount[]>;
  getExpiringSoon(hours: number): Promise<SocialAccount[]>;
}

export interface ISocialPostStorage {
  // CRUD
  getById(id: string): Promise<SocialPost | null>;
  getAllBySite(siteId: string, options?: PostQueryOptions): Promise<{ posts: SocialPost[]; total: number }>;
  create(post: Omit<SocialPost, "createdAt" | "updatedAt">): Promise<SocialPost>;
  update(id: string, updates: Partial<SocialPost>): Promise<SocialPost | null>;
  delete(id: string): Promise<boolean>;

  // Status updates
  updateStatus(id: string, status: PostStatus): Promise<SocialPost | null>;
  updatePlatformStatus(id: string, platform: SocialPlatform, status: PlatformPostStatus): Promise<SocialPost | null>;

  // Queries
  getScheduled(siteId: string, before: Date): Promise<SocialPost[]>;
  getByCampaign(campaignId: string): Promise<SocialPost[]>;
  getByDateRange(siteId: string, start: Date, end: Date): Promise<SocialPost[]>;
  getByStatus(siteId: string, status: PostStatus): Promise<SocialPost[]>;
}

export interface IPublishQueueStorage {
  // CRUD
  getById(id: string): Promise<PublishJob | null>;
  create(job: Omit<PublishJob, "createdAt" | "updatedAt">): Promise<PublishJob>;
  update(id: string, updates: Partial<PublishJob>): Promise<PublishJob | null>;
  delete(id: string): Promise<boolean>;

  // Queue operations
  getNextBatch(limit: number): Promise<PublishJob[]>;
  getByPostId(postId: string): Promise<PublishJob[]>;
  getPending(): Promise<PublishJob[]>;
  getFailedForRetry(): Promise<PublishJob[]>;
  markProcessing(id: string): Promise<PublishJob | null>;
  markCompleted(id: string, externalId: string, externalUrl?: string): Promise<PublishJob | null>;
  markFailed(id: string, error: string): Promise<PublishJob | null>;
  moveToDeadLetter(id: string): Promise<PublishJob | null>;

  // Cleanup
  deleteCompletedOlderThan(date: Date): Promise<number>;
}

export interface IPostAnalyticsStorage {
  // CRUD
  getById(id: string): Promise<PostAnalytics | null>;
  getByPostId(postId: string): Promise<PostAnalytics[]>;
  getByPostAndPlatform(postId: string, platform: SocialPlatform): Promise<PostAnalytics | null>;
  create(analytics: Omit<PostAnalytics, "createdAt" | "updatedAt">): Promise<PostAnalytics>;
  update(id: string, updates: Partial<PostAnalytics>): Promise<PostAnalytics | null>;
  upsert(analytics: Omit<PostAnalytics, "createdAt" | "updatedAt">): Promise<PostAnalytics>;

  // Queries
  getAggregatedByPost(postId: string): Promise<AggregatedAnalytics | null>;
  getAggregatedByCampaign(campaignId: string): Promise<AggregatedAnalytics | null>;
  getTopPerforming(siteId: string, limit: number, metric: AnalyticsMetric): Promise<PostAnalytics[]>;
}

export interface ICampaignStorage {
  // CRUD
  getById(id: string): Promise<SocialCampaign | null>;
  getAllBySite(siteId: string): Promise<SocialCampaign[]>;
  create(campaign: Omit<SocialCampaign, "createdAt" | "updatedAt">): Promise<SocialCampaign>;
  update(id: string, updates: Partial<SocialCampaign>): Promise<SocialCampaign | null>;
  delete(id: string): Promise<boolean>;

  // Queries
  getActive(siteId: string): Promise<SocialCampaign[]>;
  updateMetrics(id: string): Promise<SocialCampaign | null>;
}

// =============================================================================
// QUERY OPTIONS
// =============================================================================

export interface PostQueryOptions {
  limit?: number;
  offset?: number;
  status?: PostStatus[];
  platforms?: SocialPlatform[];
  campaignId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  sortBy?: "createdAt" | "scheduledAt" | "publishedAt";
  sortOrder?: "asc" | "desc";
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export type AnalyticsMetric = "impressions" | "reach" | "likes" | "shares" | "comments" | "clicks" | "engagementRate";

export interface AggregatedAnalytics {
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  totalClicks: number;
  totalSaves: number;
  averageEngagementRate: number;
  byPlatform: Record<SocialPlatform, {
    impressions: number;
    reach: number;
    likes: number;
    shares: number;
    comments: number;
    clicks: number;
    engagementRate: number;
  }>;
}

export interface PlatformPerformance {
  platform: SocialPlatform;
  postCount: number;
  totalImpressions: number;
  totalEngagements: number;
  averageEngagementRate: number;
  topPosts: Array<{
    postId: string;
    externalUrl?: string;
    impressions: number;
    engagementRate: number;
  }>;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export type SocialMediaEventType =
  | "account:connected"
  | "account:disconnected"
  | "account:refreshed"
  | "account:error"
  | "post:created"
  | "post:updated"
  | "post:deleted"
  | "post:scheduled"
  | "post:queued"
  | "post:publishing"
  | "post:published"
  | "post:failed"
  | "queue:job_started"
  | "queue:job_completed"
  | "queue:job_failed"
  | "queue:job_retrying"
  | "queue:job_dead_letter"
  | "analytics:fetched"
  | "analytics:updated"
  | "campaign:created"
  | "campaign:updated"
  | "campaign:completed";

export interface SocialMediaEvent {
  type: SocialMediaEventType;
  timestamp: Date;
  siteId?: string;
  userId?: number;
  data: Record<string, unknown>;
}

export type SocialMediaEventHandler = (event: SocialMediaEvent) => void;

// =============================================================================
// PLATFORM CONNECTOR INTERFACE
// =============================================================================

export interface IPlatformConnector {
  readonly platform: SocialPlatform;
  readonly rateLimits: PlatformRateLimits;

  // Authentication
  getAuthUrl(state: string, redirectUri: string, scopes?: string[]): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens>;
  refreshTokens(refreshToken: string): Promise<OAuth2Tokens>;
  revokeTokens(accessToken: string): Promise<void>;

  // Account
  getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo>;

  // Publishing
  publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult>;
  deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void>;

  // Analytics
  getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult>;

  // Rate limiting
  checkRateLimit(accountId: string): Promise<RateLimitInfo>;
}

// =============================================================================
// SCHEDULER TYPES
// =============================================================================

export interface ScheduledPostInfo {
  postId: string;
  scheduledAt: Date;
  platforms: SocialPlatform[];
  status: PostStatus;
}

export interface CalendarDay {
  date: Date;
  posts: ScheduledPostInfo[];
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[];
  totalPosts: number;
}
