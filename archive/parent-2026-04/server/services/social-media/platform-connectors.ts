/**
 * @file platform-connectors.ts
 * @description Platform-specific API connectors for social media publishing
 * @phase Phase 3B - Social Media Integration
 */

import { createModuleLogger } from "../../logger";
import type {
  SocialPlatform,
  IPlatformConnector,
  OAuth2Tokens,
  PlatformAccountInfo,
  PlatformPublishResult,
  PlatformAnalyticsResult,
  RateLimitInfo,
  PlatformRateLimits,
  PLATFORM_RATE_LIMITS,
} from "./types";

const log = createModuleLogger("social-media-connectors");

// =============================================================================
// BASE CONNECTOR CLASS
// =============================================================================

abstract class BasePlatformConnector implements IPlatformConnector {
  abstract readonly platform: SocialPlatform;
  abstract readonly rateLimits: PlatformRateLimits;

  protected rateLimitState: Map<string, RateLimitInfo> = new Map();

  abstract getAuthUrl(state: string, redirectUri: string, scopes?: string[]): string;
  abstract exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens>;
  abstract refreshTokens(refreshToken: string): Promise<OAuth2Tokens>;
  abstract revokeTokens(accessToken: string): Promise<void>;
  abstract getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo>;
  abstract publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult>;
  abstract deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void>;
  abstract getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult>;

  async checkRateLimit(accountId: string): Promise<RateLimitInfo> {
    const state = this.rateLimitState.get(accountId);
    if (state && state.resetAt > new Date()) {
      return state;
    }
    // Return full quota if no state or expired
    return {
      remaining: this.rateLimits.requestsPerWindow,
      limit: this.rateLimits.requestsPerWindow,
      resetAt: new Date(Date.now() + this.rateLimits.windowSeconds * 1000),
    };
  }

  protected updateRateLimit(accountId: string, info: RateLimitInfo): void {
    this.rateLimitState.set(accountId, info);
  }

  protected async makeRequest<T>(
    url: string,
    options: RequestInit,
    accountId?: string
  ): Promise<{ data: T; rateLimitInfo?: RateLimitInfo }> {
    const response = await fetch(url, options);

    // Extract rate limit headers (varies by platform)
    const rateLimitInfo = this.extractRateLimitHeaders(response);
    if (rateLimitInfo && accountId) {
      this.updateRateLimit(accountId, rateLimitInfo);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error({ platform: this.platform, status: response.status, error }, "API request failed");
      throw new Error(`${this.platform} API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as T;
    return { data, rateLimitInfo };
  }

  protected extractRateLimitHeaders(response: Response): RateLimitInfo | undefined {
    // Standard rate limit headers (X-RateLimit-*)
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const limit = response.headers.get("X-RateLimit-Limit");
    const reset = response.headers.get("X-RateLimit-Reset");

    if (remaining && limit && reset) {
      return {
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10),
        resetAt: new Date(parseInt(reset, 10) * 1000),
      };
    }
    return undefined;
  }
}

// =============================================================================
// TWITTER/X CONNECTOR
// =============================================================================

export class TwitterConnector extends BasePlatformConnector {
  readonly platform: SocialPlatform = "twitter";
  readonly rateLimits: PlatformRateLimits = { requestsPerWindow: 300, windowSeconds: 900, dailyLimit: 2400 };

  private readonly apiBase = "https://api.twitter.com/2";
  private readonly authBase = "https://twitter.com/i/oauth2";
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    super();
    this.clientId = clientId ?? process.env.TWITTER_CLIENT_ID ?? "";
    this.clientSecret = clientSecret ?? process.env.TWITTER_CLIENT_SECRET ?? "";
  }

  getAuthUrl(state: string, redirectUri: string, scopes: string[] = ["tweet.read", "tweet.write", "users.read", "offline.access"]): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: "challenge", // PKCE - simplified
      code_challenge_method: "plain",
    });
    return `${this.authBase}/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens> {
    const response = await fetch(`${this.authBase}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: "challenge",
      }),
    });

    if (!response.ok) {
      throw new Error(`Twitter token exchange failed: ${response.status}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type: string;
      scope?: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
    const response = await fetch(`${this.authBase}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Twitter token refresh failed: ${response.status}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type: string;
      scope?: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${this.authBase}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ token: accessToken }),
    });
  }

  async getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo> {
    const { data } = await this.makeRequest<{
      data: { id: string; name: string; username: string; profile_image_url?: string; public_metrics?: { followers_count: number } };
    }>(`${this.apiBase}/users/me?user.fields=profile_image_url,public_metrics`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    return {
      accountId: data.data.id,
      accountName: data.data.username,
      accountUrl: `https://twitter.com/${data.data.username}`,
      avatarUrl: data.data.profile_image_url,
      followerCount: data.data.public_metrics?.followers_count,
    };
  }

  async publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult> {
    try {
      const text = link ? `${content}\n${link}` : content;

      // For media, would need to upload first via media endpoint
      // Simplified: text-only tweets
      const { data } = await this.makeRequest<{ data: { id: string } }>(`${this.apiBase}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      return {
        success: true,
        externalId: data.data.id,
        externalUrl: `https://twitter.com/i/web/status/${data.data.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void> {
    await this.makeRequest(`${this.apiBase}/tweets/${externalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  }

  async getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult> {
    const { data } = await this.makeRequest<{
      data: {
        public_metrics: {
          retweet_count: number;
          reply_count: number;
          like_count: number;
          quote_count: number;
          impression_count?: number;
        };
      };
    }>(`${this.apiBase}/tweets/${externalId}?tweet.fields=public_metrics`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const metrics = data.data.public_metrics;
    const totalEngagements = metrics.retweet_count + metrics.reply_count + metrics.like_count + metrics.quote_count;
    const impressions = metrics.impression_count ?? totalEngagements * 10; // Estimate if not available

    return {
      impressions,
      reach: Math.round(impressions * 0.8), // Estimate
      likes: metrics.like_count,
      shares: metrics.retweet_count + metrics.quote_count,
      comments: metrics.reply_count,
      clicks: 0, // Not available in basic API
      saves: 0,
      engagementRate: impressions > 0 ? (totalEngagements / impressions) * 100 : 0,
    };
  }
}

// =============================================================================
// FACEBOOK CONNECTOR
// =============================================================================

export class FacebookConnector extends BasePlatformConnector {
  readonly platform: SocialPlatform = "facebook";
  readonly rateLimits: PlatformRateLimits = { requestsPerWindow: 200, windowSeconds: 3600 };

  private readonly apiBase = "https://graph.facebook.com/v18.0";
  private readonly authBase = "https://www.facebook.com/v18.0/dialog/oauth";
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    super();
    this.clientId = clientId ?? process.env.FACEBOOK_CLIENT_ID ?? "";
    this.clientSecret = clientSecret ?? process.env.FACEBOOK_CLIENT_SECRET ?? "";
  }

  getAuthUrl(state: string, redirectUri: string, scopes: string[] = ["pages_manage_posts", "pages_read_engagement"]): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      state,
      response_type: "code",
    });
    return `${this.authBase}?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(`${this.apiBase}/oauth/access_token?${params}`);
    if (!response.ok) throw new Error(`Facebook token exchange failed: ${response.status}`);

    const data = await response.json() as { access_token: string; expires_in?: number; token_type: string };

    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenType: data.token_type ?? "bearer",
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
    // Facebook uses long-lived tokens, exchange for new one
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: refreshToken,
    });

    const response = await fetch(`${this.apiBase}/oauth/access_token?${params}`);
    if (!response.ok) throw new Error(`Facebook token refresh failed: ${response.status}`);

    const data = await response.json() as { access_token: string; expires_in?: number };

    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      tokenType: "bearer",
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${this.apiBase}/me/permissions?access_token=${accessToken}`, { method: "DELETE" });
  }

  async getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo> {
    const { data } = await this.makeRequest<{
      id: string;
      name: string;
      picture?: { data: { url: string } };
      followers_count?: number;
    }>(`${this.apiBase}/me?fields=id,name,picture,followers_count&access_token=${tokens.accessToken}`, {});

    return {
      accountId: data.id,
      accountName: data.name,
      accountUrl: `https://facebook.com/${data.id}`,
      avatarUrl: data.picture?.data.url,
      followerCount: data.followers_count,
    };
  }

  async publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult> {
    try {
      const body: Record<string, string> = { message: content, access_token: tokens.accessToken };
      if (link) body.link = link;

      const { data } = await this.makeRequest<{ id: string }>(`${this.apiBase}/me/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return {
        success: true,
        externalId: data.id,
        externalUrl: `https://facebook.com/${data.id}`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void> {
    await fetch(`${this.apiBase}/${externalId}?access_token=${tokens.accessToken}`, { method: "DELETE" });
  }

  async getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult> {
    const { data } = await this.makeRequest<{
      likes?: { summary: { total_count: number } };
      shares?: { count: number };
      comments?: { summary: { total_count: number } };
      insights?: { data: Array<{ name: string; values: Array<{ value: number }> }> };
    }>(`${this.apiBase}/${externalId}?fields=likes.summary(true),shares,comments.summary(true),insights&access_token=${tokens.accessToken}`, {});

    const likes = data.likes?.summary?.total_count ?? 0;
    const shares = data.shares?.count ?? 0;
    const comments = data.comments?.summary?.total_count ?? 0;

    // Extract insights if available
    let impressions = 0, reach = 0, clicks = 0;
    if (data.insights?.data) {
      for (const insight of data.insights.data) {
        if (insight.name === "post_impressions") impressions = insight.values[0]?.value ?? 0;
        if (insight.name === "post_impressions_unique") reach = insight.values[0]?.value ?? 0;
        if (insight.name === "post_clicks") clicks = insight.values[0]?.value ?? 0;
      }
    }

    const totalEngagements = likes + shares + comments + clicks;

    return {
      impressions: impressions || totalEngagements * 10,
      reach: reach || Math.round(impressions * 0.7),
      likes,
      shares,
      comments,
      clicks,
      saves: 0,
      engagementRate: impressions > 0 ? (totalEngagements / impressions) * 100 : 0,
    };
  }
}

// =============================================================================
// INSTAGRAM CONNECTOR (via Facebook Graph API)
// =============================================================================

export class InstagramConnector extends BasePlatformConnector {
  readonly platform: SocialPlatform = "instagram";
  readonly rateLimits: PlatformRateLimits = { requestsPerWindow: 200, windowSeconds: 3600 };

  private readonly apiBase = "https://graph.facebook.com/v18.0";
  private facebookConnector: FacebookConnector;

  constructor(clientId?: string, clientSecret?: string) {
    super();
    this.facebookConnector = new FacebookConnector(clientId, clientSecret);
  }

  getAuthUrl(state: string, redirectUri: string, scopes: string[] = ["instagram_basic", "instagram_content_publish"]): string {
    return this.facebookConnector.getAuthUrl(state, redirectUri, scopes);
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens> {
    return this.facebookConnector.exchangeCode(code, redirectUri);
  }

  async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
    return this.facebookConnector.refreshTokens(refreshToken);
  }

  async revokeTokens(accessToken: string): Promise<void> {
    return this.facebookConnector.revokeTokens(accessToken);
  }

  async getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo> {
    // Get Instagram Business Account ID
    const { data: pages } = await this.makeRequest<{
      data: Array<{ instagram_business_account?: { id: string } }>;
    }>(`${this.apiBase}/me/accounts?fields=instagram_business_account&access_token=${tokens.accessToken}`, {});

    const igAccountId = pages.data.find(p => p.instagram_business_account)?.instagram_business_account?.id;
    if (!igAccountId) throw new Error("No Instagram Business Account found");

    const { data } = await this.makeRequest<{
      id: string;
      username: string;
      profile_picture_url?: string;
      followers_count?: number;
    }>(`${this.apiBase}/${igAccountId}?fields=id,username,profile_picture_url,followers_count&access_token=${tokens.accessToken}`, {});

    return {
      accountId: data.id,
      accountName: data.username,
      accountUrl: `https://instagram.com/${data.username}`,
      avatarUrl: data.profile_picture_url,
      followerCount: data.followers_count,
    };
  }

  async publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult> {
    try {
      // Instagram requires media - at minimum an image
      if (!mediaUrls?.length) {
        return { success: false, error: "Instagram requires at least one image" };
      }

      // Get Instagram account ID
      const accountInfo = await this.getAccountInfo(tokens);

      // Create media container
      const { data: container } = await this.makeRequest<{ id: string }>(
        `${this.apiBase}/${accountInfo.accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: mediaUrls[0],
            caption: content,
            access_token: tokens.accessToken,
          }),
        }
      );

      // Publish the container
      const { data: published } = await this.makeRequest<{ id: string }>(
        `${this.apiBase}/${accountInfo.accountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: tokens.accessToken,
          }),
        }
      );

      return {
        success: true,
        externalId: published.id,
        externalUrl: `https://instagram.com/p/${published.id}`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void> {
    // Instagram doesn't support deletion via API for organic posts
    log.warn({ externalId }, "Instagram post deletion not supported via API");
  }

  async getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult> {
    const { data } = await this.makeRequest<{
      like_count?: number;
      comments_count?: number;
      insights?: { data: Array<{ name: string; values: Array<{ value: number }> }> };
    }>(`${this.apiBase}/${externalId}?fields=like_count,comments_count,insights.metric(impressions,reach,saved)&access_token=${tokens.accessToken}`, {});

    let impressions = 0, reach = 0, saves = 0;
    if (data.insights?.data) {
      for (const insight of data.insights.data) {
        if (insight.name === "impressions") impressions = insight.values[0]?.value ?? 0;
        if (insight.name === "reach") reach = insight.values[0]?.value ?? 0;
        if (insight.name === "saved") saves = insight.values[0]?.value ?? 0;
      }
    }

    const likes = data.like_count ?? 0;
    const comments = data.comments_count ?? 0;
    const totalEngagements = likes + comments + saves;

    return {
      impressions: impressions || totalEngagements * 15,
      reach: reach || Math.round(impressions * 0.6),
      likes,
      shares: 0, // Instagram doesn't expose share counts
      comments,
      clicks: 0,
      saves,
      engagementRate: impressions > 0 ? (totalEngagements / impressions) * 100 : 0,
    };
  }
}

// =============================================================================
// LINKEDIN CONNECTOR
// =============================================================================

export class LinkedInConnector extends BasePlatformConnector {
  readonly platform: SocialPlatform = "linkedin";
  readonly rateLimits: PlatformRateLimits = { requestsPerWindow: 100, windowSeconds: 60, dailyLimit: 100000 };

  private readonly apiBase = "https://api.linkedin.com/v2";
  private readonly authBase = "https://www.linkedin.com/oauth/v2";
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    super();
    this.clientId = clientId ?? process.env.LINKEDIN_CLIENT_ID ?? "";
    this.clientSecret = clientSecret ?? process.env.LINKEDIN_CLIENT_SECRET ?? "";
  }

  getAuthUrl(state: string, redirectUri: string, scopes: string[] = ["r_liteprofile", "w_member_social"]): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
    });
    return `${this.authBase}/authorization?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens> {
    const response = await fetch(`${this.authBase}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) throw new Error(`LinkedIn token exchange failed: ${response.status}`);

    const data = await response.json() as { access_token: string; expires_in: number };

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenType: "bearer",
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
    // LinkedIn doesn't support refresh tokens for basic OAuth
    throw new Error("LinkedIn requires re-authentication");
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${this.authBase}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        token: accessToken,
      }),
    });
  }

  async getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo> {
    const { data } = await this.makeRequest<{
      id: string;
      localizedFirstName: string;
      localizedLastName: string;
      profilePicture?: { displayImage: string };
    }>(`${this.apiBase}/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    return {
      accountId: data.id,
      accountName: `${data.localizedFirstName} ${data.localizedLastName}`,
      accountUrl: `https://linkedin.com/in/${data.id}`,
      avatarUrl: data.profilePicture?.displayImage,
    };
  }

  async publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult> {
    try {
      const accountInfo = await this.getAccountInfo(tokens);

      const shareContent: Record<string, unknown> = {
        author: `urn:li:person:${accountInfo.accountId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory: link ? "ARTICLE" : "NONE",
            ...(link && {
              media: [{
                status: "READY",
                originalUrl: link,
              }],
            }),
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };

      const { data } = await this.makeRequest<{ id: string }>(`${this.apiBase}/ugcPosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(shareContent),
      });

      return {
        success: true,
        externalId: data.id,
        externalUrl: `https://linkedin.com/feed/update/${data.id}`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void> {
    await this.makeRequest(`${this.apiBase}/ugcPosts/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  }

  async getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult> {
    // LinkedIn analytics requires Marketing API access
    const { data } = await this.makeRequest<{
      elements: Array<{
        totalShareStatistics: {
          impressionCount: number;
          uniqueImpressionsCount: number;
          clickCount: number;
          likeCount: number;
          commentCount: number;
          shareCount: number;
        };
      }>;
    }>(`${this.apiBase}/socialActions/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const stats = data.elements[0]?.totalShareStatistics ?? {
      impressionCount: 0,
      uniqueImpressionsCount: 0,
      clickCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
    };

    const totalEngagements = stats.likeCount + stats.commentCount + stats.shareCount + stats.clickCount;

    return {
      impressions: stats.impressionCount,
      reach: stats.uniqueImpressionsCount,
      likes: stats.likeCount,
      shares: stats.shareCount,
      comments: stats.commentCount,
      clicks: stats.clickCount,
      saves: 0,
      engagementRate: stats.impressionCount > 0 ? (totalEngagements / stats.impressionCount) * 100 : 0,
    };
  }
}

// =============================================================================
// TIKTOK CONNECTOR
// =============================================================================

export class TikTokConnector extends BasePlatformConnector {
  readonly platform: SocialPlatform = "tiktok";
  readonly rateLimits: PlatformRateLimits = { requestsPerWindow: 1000, windowSeconds: 86400 };

  private readonly apiBase = "https://open.tiktokapis.com/v2";
  private readonly authBase = "https://www.tiktok.com/v2/auth/authorize";
  private clientKey: string;
  private clientSecret: string;

  constructor(clientKey?: string, clientSecret?: string) {
    super();
    this.clientKey = clientKey ?? process.env.TIKTOK_CLIENT_KEY ?? "";
    this.clientSecret = clientSecret ?? process.env.TIKTOK_CLIENT_SECRET ?? "";
  }

  getAuthUrl(state: string, redirectUri: string, scopes: string[] = ["user.info.basic", "video.publish"]): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      redirect_uri: redirectUri,
      scope: scopes.join(","),
      state,
      response_type: "code",
    });
    return `${this.authBase}/?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens> {
    const response = await fetch(`${this.apiBase}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) throw new Error(`TikTok token exchange failed: ${response.status}`);

    const data = await response.json() as {
      data: { access_token: string; refresh_token: string; expires_in: number; open_id: string };
    };

    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresAt: new Date(Date.now() + data.data.expires_in * 1000),
      tokenType: "bearer",
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
    const response = await fetch(`${this.apiBase}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) throw new Error(`TikTok token refresh failed: ${response.status}`);

    const data = await response.json() as {
      data: { access_token: string; refresh_token: string; expires_in: number };
    };

    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresAt: new Date(Date.now() + data.data.expires_in * 1000),
      tokenType: "bearer",
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${this.apiBase}/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken }),
    });
  }

  async getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo> {
    const { data } = await this.makeRequest<{
      data: { user: { open_id: string; display_name: string; avatar_url: string; follower_count: number } };
    }>(`${this.apiBase}/user/info/?fields=open_id,display_name,avatar_url,follower_count`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    return {
      accountId: data.data.user.open_id,
      accountName: data.data.user.display_name,
      avatarUrl: data.data.user.avatar_url,
      followerCount: data.data.user.follower_count,
    };
  }

  async publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult> {
    // TikTok requires video content - simplified stub
    if (!mediaUrls?.length) {
      return { success: false, error: "TikTok requires video content" };
    }

    try {
      // TikTok content posting requires Content Posting API
      // This is a simplified stub - actual implementation needs video upload flow
      log.warn("TikTok posting requires Content Posting API - stub implementation");
      return { success: false, error: "TikTok video upload not yet implemented" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void> {
    log.warn({ externalId }, "TikTok post deletion not supported via API");
  }

  async getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult> {
    // TikTok video insights
    const { data } = await this.makeRequest<{
      data: {
        videos: Array<{
          view_count: number;
          like_count: number;
          comment_count: number;
          share_count: number;
        }>;
      };
    }>(`${this.apiBase}/video/query/?fields=view_count,like_count,comment_count,share_count`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ video_ids: [externalId] }),
    });

    const video = data.data.videos[0] ?? { view_count: 0, like_count: 0, comment_count: 0, share_count: 0 };
    const totalEngagements = video.like_count + video.comment_count + video.share_count;

    return {
      impressions: video.view_count,
      reach: Math.round(video.view_count * 0.8),
      likes: video.like_count,
      shares: video.share_count,
      comments: video.comment_count,
      clicks: 0,
      saves: 0,
      videoViews: video.view_count,
      engagementRate: video.view_count > 0 ? (totalEngagements / video.view_count) * 100 : 0,
    };
  }
}

// =============================================================================
// YOUTUBE CONNECTOR
// =============================================================================

export class YouTubeConnector extends BasePlatformConnector {
  readonly platform: SocialPlatform = "youtube";
  readonly rateLimits: PlatformRateLimits = { requestsPerWindow: 10000, windowSeconds: 86400 };

  private readonly apiBase = "https://www.googleapis.com/youtube/v3";
  private readonly authBase = "https://accounts.google.com/o/oauth2/v2/auth";
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    super();
    this.clientId = clientId ?? process.env.YOUTUBE_CLIENT_ID ?? "";
    this.clientSecret = clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET ?? "";
  }

  getAuthUrl(state: string, redirectUri: string, scopes: string[] = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
    });
    return `${this.authBase}?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuth2Tokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) throw new Error(`YouTube token exchange failed: ${response.status}`);

    const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenType: "bearer",
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuth2Tokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) throw new Error(`YouTube token refresh failed: ${response.status}`);

    const data = await response.json() as { access_token: string; expires_in: number };

    return {
      accessToken: data.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenType: "bearer",
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: "POST" });
  }

  async getAccountInfo(tokens: OAuth2Tokens): Promise<PlatformAccountInfo> {
    const { data } = await this.makeRequest<{
      items: Array<{
        id: string;
        snippet: { title: string; thumbnails: { default: { url: string } } };
        statistics: { subscriberCount: string };
      }>;
    }>(`${this.apiBase}/channels?part=snippet,statistics&mine=true`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const channel = data.items[0];
    if (!channel) throw new Error("No YouTube channel found");

    return {
      accountId: channel.id,
      accountName: channel.snippet.title,
      accountUrl: `https://youtube.com/channel/${channel.id}`,
      avatarUrl: channel.snippet.thumbnails.default.url,
      followerCount: parseInt(channel.statistics.subscriberCount, 10),
    };
  }

  async publishPost(tokens: OAuth2Tokens, content: string, mediaUrls?: string[], link?: string): Promise<PlatformPublishResult> {
    // YouTube requires video upload - simplified stub
    if (!mediaUrls?.length) {
      return { success: false, error: "YouTube requires video content" };
    }

    try {
      // YouTube video upload requires resumable upload API
      log.warn("YouTube video upload requires resumable upload API - stub implementation");
      return { success: false, error: "YouTube video upload not yet implemented" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async deletePost(tokens: OAuth2Tokens, externalId: string): Promise<void> {
    await fetch(`${this.apiBase}/videos?id=${externalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  }

  async getPostAnalytics(tokens: OAuth2Tokens, externalId: string): Promise<PlatformAnalyticsResult> {
    const { data } = await this.makeRequest<{
      items: Array<{
        statistics: {
          viewCount: string;
          likeCount: string;
          commentCount: string;
        };
      }>;
    }>(`${this.apiBase}/videos?part=statistics&id=${externalId}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const stats = data.items[0]?.statistics ?? { viewCount: "0", likeCount: "0", commentCount: "0" };
    const views = parseInt(stats.viewCount, 10);
    const likes = parseInt(stats.likeCount, 10);
    const comments = parseInt(stats.commentCount, 10);

    return {
      impressions: views,
      reach: Math.round(views * 0.7),
      likes,
      shares: 0, // YouTube doesn't expose share count
      comments,
      clicks: 0,
      saves: 0,
      videoViews: views,
      engagementRate: views > 0 ? ((likes + comments) / views) * 100 : 0,
    };
  }
}

// =============================================================================
// CONNECTOR REGISTRY
// =============================================================================

export class PlatformConnectorRegistry {
  private connectors: Map<SocialPlatform, IPlatformConnector> = new Map();

  constructor() {
    // Register default connectors
    this.registerConnector(new TwitterConnector());
    this.registerConnector(new FacebookConnector());
    this.registerConnector(new InstagramConnector());
    this.registerConnector(new LinkedInConnector());
    this.registerConnector(new TikTokConnector());
    this.registerConnector(new YouTubeConnector());
  }

  registerConnector(connector: IPlatformConnector): void {
    this.connectors.set(connector.platform, connector);
    log.info({ platform: connector.platform }, "Platform connector registered");
  }

  getConnector(platform: SocialPlatform): IPlatformConnector {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new Error(`No connector registered for platform: ${platform}`);
    }
    return connector;
  }

  hasConnector(platform: SocialPlatform): boolean {
    return this.connectors.has(platform);
  }

  getSupportedPlatforms(): SocialPlatform[] {
    return Array.from(this.connectors.keys());
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let registryInstance: PlatformConnectorRegistry | null = null;

export function getConnectorRegistry(): PlatformConnectorRegistry {
  if (!registryInstance) {
    registryInstance = new PlatformConnectorRegistry();
  }
  return registryInstance;
}
