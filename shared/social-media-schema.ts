/**
 * @file social-media-schema.ts
 * @description Database schema for Social Media Integration service
 * @phase Phase 3B - Social Media Integration
 */

import { pgTable, text, integer, boolean, timestamp, jsonb, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./schema";

// =============================================================================
// ENUMS & TYPES
// =============================================================================

export const SocialPlatformEnum = z.enum([
  "twitter",
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
]);
export type SocialPlatform = z.infer<typeof SocialPlatformEnum>;

export const PostStatusEnum = z.enum([
  "draft",
  "scheduled",
  "queued",
  "publishing",
  "published",
  "failed",
  "deleted",
]);
export type PostStatus = z.infer<typeof PostStatusEnum>;

export const PublishJobStatusEnum = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "dead_letter",
]);
export type PublishJobStatus = z.infer<typeof PublishJobStatusEnum>;

// =============================================================================
// SOCIAL ACCOUNTS TABLE
// =============================================================================

export const socialAccounts = pgTable("social_accounts", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  platform: text("platform").$type<SocialPlatform>().notNull(),

  // Account info from platform
  accountName: text("account_name").notNull(),
  accountId: text("account_id").notNull(), // Platform-specific ID
  accountUrl: text("account_url"),
  avatarUrl: text("avatar_url"),
  followerCount: integer("follower_count"),

  // Credentials (encrypted reference)
  credentialId: text("credential_id").notNull(),

  // Status
  connected: boolean("connected").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  tokenExpiresAt: timestamp("token_expires_at"),

  // Rate limit tracking
  rateLimitRemaining: integer("rate_limit_remaining"),
  rateLimitResetAt: timestamp("rate_limit_reset_at"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("social_accounts_site_idx").on(table.siteId),
  index("social_accounts_user_idx").on(table.userId),
  index("social_accounts_platform_idx").on(table.platform),
]);

// =============================================================================
// PLATFORM TARGET SCHEMA
// =============================================================================

export const PlatformTargetSchema = z.object({
  platform: SocialPlatformEnum,
  accountId: z.string(),
  enabled: z.boolean().default(true),
  customContent: z.string().optional(),
  customMediaUrls: z.array(z.string()).optional(),
});
export type PlatformTarget = z.infer<typeof PlatformTargetSchema>;

// =============================================================================
// PLATFORM POST STATUS SCHEMA
// =============================================================================

export const PlatformPostStatusSchema = z.object({
  status: z.enum(["pending", "published", "failed"]),
  externalId: z.string().optional(),
  externalUrl: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  retryCount: z.number().default(0),
});
export type PlatformPostStatus = z.infer<typeof PlatformPostStatusSchema>;

// =============================================================================
// SOCIAL POSTS TABLE
// =============================================================================

export const socialPosts = pgTable("social_posts", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),

  // Content
  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>().default([]),
  link: text("link"),

  // Platform targeting
  platforms: jsonb("platforms").$type<PlatformTarget[]>().notNull(),

  // Scheduling
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),

  // Status
  status: text("status").$type<PostStatus>().default("draft").notNull(),
  platformStatuses: jsonb("platform_statuses").$type<Record<string, PlatformPostStatus>>().default({}),

  // Organization
  tags: jsonb("tags").$type<string[]>().default([]),
  campaignId: text("campaign_id"),

  // Analytics reference
  analyticsId: text("analytics_id"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("social_posts_site_idx").on(table.siteId),
  index("social_posts_user_idx").on(table.userId),
  index("social_posts_status_idx").on(table.status),
  index("social_posts_scheduled_idx").on(table.scheduledAt),
  index("social_posts_campaign_idx").on(table.campaignId),
]);

// =============================================================================
// PUBLISH QUEUE TABLE
// =============================================================================

export const socialPublishQueue = pgTable("social_publish_queue", {
  id: text("id").primaryKey(),
  postId: text("post_id").references(() => socialPosts.id, { onDelete: "cascade" }).notNull(),
  platform: text("platform").$type<SocialPlatform>().notNull(),
  accountId: text("account_id").references(() => socialAccounts.id).notNull(),

  // Scheduling
  priority: integer("priority").default(0).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),

  // Retry tracking
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  lastError: text("last_error"),

  // Status
  status: text("status").$type<PublishJobStatus>().default("pending").notNull(),

  // Result
  externalId: text("external_id"),
  externalUrl: text("external_url"),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("publish_queue_status_idx").on(table.status),
  index("publish_queue_scheduled_idx").on(table.scheduledAt),
  index("publish_queue_post_idx").on(table.postId),
  index("publish_queue_next_attempt_idx").on(table.nextAttemptAt),
]);

// =============================================================================
// ANALYTICS SNAPSHOT SCHEMA
// =============================================================================

export const AnalyticsSnapshotSchema = z.object({
  timestamp: z.string().datetime(),
  impressions: z.number(),
  reach: z.number(),
  likes: z.number(),
  shares: z.number(),
  comments: z.number(),
  clicks: z.number(),
  saves: z.number(),
  videoViews: z.number().optional(),
  engagementRate: z.number(),
});
export type AnalyticsSnapshot = z.infer<typeof AnalyticsSnapshotSchema>;

// =============================================================================
// POST ANALYTICS TABLE
// =============================================================================

export const socialPostAnalytics = pgTable("social_post_analytics", {
  id: text("id").primaryKey(),
  postId: text("post_id").references(() => socialPosts.id, { onDelete: "cascade" }).notNull(),
  platform: text("platform").$type<SocialPlatform>().notNull(),
  externalId: text("external_id").notNull(),

  // Engagement metrics
  impressions: integer("impressions").default(0).notNull(),
  reach: integer("reach").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  shares: integer("shares").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  saves: integer("saves").default(0).notNull(),

  // Video metrics
  videoViews: integer("video_views"),
  watchTime: integer("watch_time"), // seconds

  // Derived metrics
  engagementRate: real("engagement_rate").default(0).notNull(),

  // Tracking
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  history: jsonb("history").$type<AnalyticsSnapshot[]>().default([]),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("post_analytics_post_idx").on(table.postId),
  index("post_analytics_platform_idx").on(table.platform),
  index("post_analytics_external_idx").on(table.externalId),
]);

// =============================================================================
// CAMPAIGNS TABLE (for grouping posts)
// =============================================================================

export const socialCampaigns = pgTable("social_campaigns", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),

  name: text("name").notNull(),
  description: text("description"),

  // Campaign period
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  // Status
  status: text("status").$type<"draft" | "active" | "paused" | "completed">().default("draft").notNull(),

  // Aggregated metrics (computed)
  totalPosts: integer("total_posts").default(0).notNull(),
  totalImpressions: integer("total_impressions").default(0).notNull(),
  totalEngagements: integer("total_engagements").default(0).notNull(),

  // Metadata
  tags: jsonb("tags").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("campaigns_site_idx").on(table.siteId),
  index("campaigns_status_idx").on(table.status),
]);

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

// Social Account schemas
export const insertSocialAccountSchema = createInsertSchema(socialAccounts).omit({
  createdAt: true,
  updatedAt: true,
});
export const selectSocialAccountSchema = createSelectSchema(socialAccounts);
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = z.infer<typeof insertSocialAccountSchema>;

// Social Post schemas
export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  platforms: z.array(PlatformTargetSchema),
  platformStatuses: z.record(z.string(), PlatformPostStatusSchema).optional(),
});
export const selectSocialPostSchema = createSelectSchema(socialPosts);
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;

// Publish Queue schemas
export const insertPublishJobSchema = createInsertSchema(socialPublishQueue).omit({
  createdAt: true,
  updatedAt: true,
});
export const selectPublishJobSchema = createSelectSchema(socialPublishQueue);
export type PublishJob = typeof socialPublishQueue.$inferSelect;
export type InsertPublishJob = z.infer<typeof insertPublishJobSchema>;

// Post Analytics schemas
export const insertPostAnalyticsSchema = createInsertSchema(socialPostAnalytics).omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  history: z.array(AnalyticsSnapshotSchema).optional(),
});
export const selectPostAnalyticsSchema = createSelectSchema(socialPostAnalytics);
export type PostAnalytics = typeof socialPostAnalytics.$inferSelect;
export type InsertPostAnalytics = z.infer<typeof insertPostAnalyticsSchema>;

// Campaign schemas
export const insertCampaignSchema = createInsertSchema(socialCampaigns).omit({
  createdAt: true,
  updatedAt: true,
});
export const selectCampaignSchema = createSelectSchema(socialCampaigns);
export type SocialCampaign = typeof socialCampaigns.$inferSelect;
export type InsertSocialCampaign = z.infer<typeof insertCampaignSchema>;

// =============================================================================
// API REQUEST/RESPONSE SCHEMAS
// =============================================================================

export const CreatePostRequestSchema = z.object({
  content: z.string().min(1).max(5000),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  link: z.string().url().optional(),
  platforms: z.array(PlatformTargetSchema).min(1),
  scheduledAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  campaignId: z.string().optional(),
});
export type CreatePostRequest = z.infer<typeof CreatePostRequestSchema>;

export const UpdatePostRequestSchema = CreatePostRequestSchema.partial();
export type UpdatePostRequest = z.infer<typeof UpdatePostRequestSchema>;

export const ConnectAccountRequestSchema = z.object({
  platform: SocialPlatformEnum,
  authCode: z.string(),
  redirectUri: z.string().url(),
});
export type ConnectAccountRequest = z.infer<typeof ConnectAccountRequestSchema>;

export const CalendarQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  platforms: z.array(SocialPlatformEnum).optional(),
  status: z.array(PostStatusEnum).optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
