/**
 * @file viral-predictor.ts
 * @description Viral content prediction service with engagement forecasting,
 *              optimal posting time recommendations, and historical comparison.
 *
 * @phase Phase 4 - Intelligence Layer
 * @version 1.0.0
 * @created 2026-02-03
 *
 * Integrates with:
 * - SocialAnalyticsSystem for graph-based influence analysis
 * - EngagementPredictor for ML-style predictions
 */

import {
  SocialAnalyticsSystem,
  SocialContent,
  SocialUser,
  ContentEngagement,
} from "../../lib/social-analytics";
import {
  EngagementPredictor,
  PostFeatures,
  extractFeatures,
  getEngagementPredictor,
} from "../../lib/engagement-predictor";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Time slot recommendation for optimal posting.
 */
export interface TimeSlot {
  /** Day of week (0 = Sunday, 6 = Saturday) */
  dayOfWeek: number;
  /** Hour of day (0-23) */
  hourOfDay: number;
  /** Average engagement rate at this time */
  avgEngagement: number;
}

/**
 * Historical comparison metrics.
 */
export interface HistoricalComparison {
  /** Number of similar posts analyzed */
  similarPosts: number;
  /** Average performance of similar posts */
  avgPerformance: number;
  /** Top performer engagement rate */
  topPerformer: number;
}

/**
 * Complete viral prediction result.
 */
export interface ViralPrediction {
  /** Viral score (0-100) */
  viralScore: number;
  /** Probability of going viral (0-1) */
  probabilityOfViral: number;
  /** Best times to post for maximum engagement */
  bestPostingTimes: TimeSlot[];
  /** Comparison to historical content */
  historicalComparison: HistoricalComparison;
}

/**
 * Post metadata for prediction.
 */
export interface PostMetadata {
  /** Content platform */
  platform: string;
  /** Author user ID */
  authorId?: string;
  /** Number of media attachments */
  mediaCount?: number;
  /** Type of media */
  mediaType?: "image" | "video" | "carousel";
  /** Topics/tags */
  topics?: string[];
  /** Target posting time */
  scheduledTime?: Date;
}

// =============================================================================
// VIRAL PREDICTOR
// =============================================================================

/**
 * Viral content predictor combining multiple prediction strategies.
 *
 * Uses:
 * - Graph-based influence propagation analysis
 * - Feature-based engagement prediction
 * - Historical pattern matching
 * - Time-series trend detection
 */
export class ViralPredictor {
  private analyticsSystem: SocialAnalyticsSystem;
  private engagementPredictor: EngagementPredictor;

  /**
   * Historical post data for comparison.
   * Maps platform -> array of historical records.
   */
  private historicalPosts: Map<
    string,
    Array<{
      contentId: string;
      features: Partial<PostFeatures>;
      engagement: ContentEngagement;
      viralScore: number;
    }>
  > = new Map();

  /**
   * Engagement data by time slot for best time calculation.
   * Key format: "{platform}-{dayOfWeek}-{hourOfDay}"
   */
  private timeSlotEngagement: Map<
    string,
    { total: number; count: number }
  > = new Map();

  constructor(analyticsSystem?: SocialAnalyticsSystem) {
    this.analyticsSystem = analyticsSystem ?? this.createDefaultAnalytics();
    this.engagementPredictor = getEngagementPredictor();
    this.initializeTimeSlotData();
  }

  /**
   * Creates default analytics system if none provided.
   */
  private createDefaultAnalytics(): SocialAnalyticsSystem {
    const system = new SocialAnalyticsSystem();
    system.initialize();
    return system;
  }

  /**
   * Initializes baseline time slot engagement data.
   */
  private initializeTimeSlotData(): void {
    const platforms = ["twitter", "facebook", "instagram", "linkedin", "tiktok", "youtube"];
    const baselineEngagement: Record<string, Record<number, number>> = {
      twitter: { 9: 3.2, 12: 2.8, 17: 4.1, 20: 3.5 },
      facebook: { 9: 2.5, 13: 3.0, 16: 2.8, 20: 2.2 },
      instagram: { 11: 4.5, 14: 4.0, 17: 3.8, 21: 4.2 },
      linkedin: { 7: 3.5, 10: 4.0, 12: 3.8, 17: 3.2 },
      tiktok: { 12: 5.0, 19: 6.5, 21: 7.0, 23: 5.5 },
      youtube: { 12: 4.0, 17: 4.5, 20: 5.0, 22: 4.2 },
    };

    for (const platform of platforms) {
      const platformBaseline = baselineEngagement[platform] || {};
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${platform}-${day}-${hour}`;
          // Use baseline if available, else interpolate
          const baseValue = platformBaseline[hour] ?? 2.0;
          // Weekend adjustment
          const weekendMult = (day === 0 || day === 6)
            ? (platform === "instagram" || platform === "tiktok" ? 1.1 : 0.9)
            : 1.0;
          this.timeSlotEngagement.set(key, {
            total: baseValue * weekendMult * 10, // 10 samples baseline
            count: 10,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  /**
   * Predicts viral potential for content.
   *
   * @param content - Post text content
   * @param metadata - Additional post metadata
   * @returns Complete viral prediction
   */
  predict(content: string, metadata: PostMetadata): ViralPrediction {
    // Extract features for ML prediction
    const features = this.extractPostFeatures(content, metadata);

    // Get ML-based engagement prediction
    const engagementPrediction = this.engagementPredictor.predict(features);

    // Calculate viral score from multiple signals
    const viralScore = this.calculateViralScore(features, engagementPrediction);

    // Calculate probability of viral spread
    const probabilityOfViral = this.calculateViralProbability(
      viralScore,
      features,
      engagementPrediction
    );

    // Get best posting times for this platform/user
    const bestPostingTimes = this.getBestPostingTimes(
      metadata.authorId ?? "anonymous",
      metadata.platform,
      5
    );

    // Compare to historical similar content
    const historicalComparison = this.compareToHistoricalInternal(
      features,
      metadata.platform
    );

    return {
      viralScore: Math.round(viralScore),
      probabilityOfViral: Math.round(probabilityOfViral * 100) / 100,
      bestPostingTimes,
      historicalComparison,
    };
  }

  /**
   * Gets best posting times for a user on a platform.
   *
   * @param userId - User identifier
   * @param platform - Optional platform filter (default: all)
   * @param limit - Maximum number of time slots to return
   * @returns Array of optimal time slots sorted by engagement
   */
  getBestPostingTimes(
    userId: string,
    platform?: string,
    limit: number = 10
  ): TimeSlot[] {
    const results: TimeSlot[] = [];
    const targetPlatform = (platform ?? "twitter").toLowerCase();

    // Collect engagement data for each time slot
    for (let day = 0; day < 7; day++) {
      for (let hour = 6; hour <= 23; hour += 2) {
        const key = `${targetPlatform}-${day}-${hour}`;
        const data = this.timeSlotEngagement.get(key);

        if (data && data.count > 0) {
          results.push({
            dayOfWeek: day,
            hourOfDay: hour,
            avgEngagement: Math.round((data.total / data.count) * 100) / 100,
          });
        }
      }
    }

    // Sort by average engagement descending
    results.sort((a, b) => b.avgEngagement - a.avgEngagement);

    return results.slice(0, limit);
  }

  /**
   * Compares a post to historical performance data.
   *
   * @param postId - Post identifier for content retrieval
   * @returns Historical comparison metrics
   */
  compareToHistorical(postId: string): HistoricalComparison {
    const content = this.analyticsSystem.socialGraph.getContent(postId);
    if (!content) {
      return {
        similarPosts: 0,
        avgPerformance: 0,
        topPerformer: 0,
      };
    }

    // Infer platform from content
    const platform = content.platforms[0]?.platform ?? "twitter";

    // Build features from content
    const features: Partial<PostFeatures> = {
      textLength: content.title.length,
      hasMedia: content.type === "article" || content.type === "project",
      platform,
    };

    return this.compareToHistoricalInternal(features, platform);
  }

  /**
   * Records actual post performance for model improvement.
   */
  recordPostPerformance(
    postId: string,
    platform: string,
    features: Partial<PostFeatures>,
    engagement: ContentEngagement
  ): void {
    const platformLower = platform.toLowerCase();

    if (!this.historicalPosts.has(platformLower)) {
      this.historicalPosts.set(platformLower, []);
    }

    const viralScore = this.estimateViralScoreFromEngagement(engagement);

    this.historicalPosts.get(platformLower)!.push({
      contentId: postId,
      features,
      engagement,
      viralScore,
    });

    // Cap historical data
    const history = this.historicalPosts.get(platformLower)!;
    if (history.length > 5000) {
      this.historicalPosts.set(platformLower, history.slice(-5000));
    }

    // Update time slot data
    const timestamp = new Date();
    const day = timestamp.getDay();
    const hour = timestamp.getHours();
    const key = `${platformLower}-${day}-${hour}`;

    const slotData = this.timeSlotEngagement.get(key) ?? { total: 0, count: 0 };
    slotData.total += engagement.engagementRate;
    slotData.count += 1;
    this.timeSlotEngagement.set(key, slotData);

    this.engagementPredictor.recordOutcome(platformLower, features, {
      likes: engagement.likes,
      comments: engagement.comments,
      shares: engagement.shares,
      engagementRate: engagement.engagementRate,
    });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE METHODS
  // ---------------------------------------------------------------------------

  private extractPostFeatures(content: string, metadata: PostMetadata): PostFeatures {
    const author = metadata.authorId
      ? this.analyticsSystem.socialGraph.getUser(metadata.authorId)
      : undefined;

    const timestamp = metadata.scheduledTime ?? new Date();

    return extractFeatures(content, {
      platform: metadata.platform,
      mediaCount: metadata.mediaCount,
      mediaType: metadata.mediaType,
      followerCount: author?.metrics.followerCount,
      followingCount: author?.metrics.followingCount,
      averageEngagementRate: author?.metrics.engagementRate,
      postFrequency: author?.metrics.contentCount
        ? author.metrics.contentCount / Math.max(1, this.getDaysSinceCreation(author))
        : undefined,
      accountAge: author ? this.getDaysSinceCreation(author) : undefined,
      timestamp,
    });
  }

  private getDaysSinceCreation(user: SocialUser): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((Date.now() - user.createdAt.getTime()) / msPerDay);
  }

  private calculateViralScore(
    features: PostFeatures,
    prediction: ReturnType<EngagementPredictor["predict"]>
  ): number {
    const weights = {
      engagementScore: 0.3,
      viralPotential: 0.3,
      contentQuality: 0.2,
      timingOptimality: 0.1,
      authorInfluence: 0.1,
    };

    const contentQuality = this.scoreContentQuality(features);
    const timingOptimality = this.scoreTimingOptimality(features);
    const authorInfluence = this.scoreAuthorInfluence(features);

    const score =
      prediction.engagementScore * weights.engagementScore +
      prediction.viralPotential * weights.viralPotential +
      contentQuality * weights.contentQuality +
      timingOptimality * weights.timingOptimality +
      authorInfluence * weights.authorInfluence;

    return Math.min(100, Math.max(0, score));
  }

  private scoreContentQuality(features: PostFeatures): number {
    let score = 50;

    if (features.textLength >= 50 && features.textLength <= 280) {
      score += 15;
    } else if (features.textLength > 500) {
      score -= 10;
    }

    if (features.hasMedia) {
      score += features.mediaType === "video" ? 20 : 10;
    }

    if (features.hashtagCount >= 2 && features.hashtagCount <= 5) {
      score += 10;
    } else if (features.hashtagCount > 10) {
      score -= 10;
    }

    if (features.emojiCount >= 1 && features.emojiCount <= 3) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  private scoreTimingOptimality(features: PostFeatures): number {
    const key = `${features.platform.toLowerCase()}-${features.dayOfWeek}-${features.hourOfDay}`;
    const slotData = this.timeSlotEngagement.get(key);

    if (!slotData || slotData.count === 0) {
      return 50;
    }

    const avgEngagement = slotData.total / slotData.count;
    return Math.min(100, Math.max(0, (avgEngagement - 2) * 25 + 50));
  }

  private scoreAuthorInfluence(features: PostFeatures): number {
    let score = 50;

    if (features.followerCount > 100000) {
      score += 30;
    } else if (features.followerCount > 10000) {
      score += 20;
    } else if (features.followerCount > 1000) {
      score += 10;
    } else if (features.followerCount < 100) {
      score -= 20;
    }

    if (features.averageEngagementRate > 5) {
      score += 15;
    } else if (features.averageEngagementRate > 2) {
      score += 5;
    } else if (features.averageEngagementRate < 1) {
      score -= 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateViralProbability(
    viralScore: number,
    features: PostFeatures,
    prediction: ReturnType<EngagementPredictor["predict"]>
  ): number {
    let probability = viralScore / 100;
    probability *= (0.5 + prediction.confidence * 0.5);

    if (features.mediaType === "video") {
      probability *= 1.2;
    }

    if (prediction.viralPotential > 70) {
      probability *= 1.15;
    }

    probability = 1 / (1 + Math.exp(-4 * (probability - 0.5)));
    return Math.min(0.85, probability);
  }

  private compareToHistoricalInternal(
    features: Partial<PostFeatures>,
    platform: string
  ): HistoricalComparison {
    const platformLower = platform.toLowerCase();
    const history = this.historicalPosts.get(platformLower) ?? [];

    if (history.length === 0) {
      return {
        similarPosts: 0,
        avgPerformance: 2.5,
        topPerformer: 5.0,
      };
    }

    const similar = history.filter((record) => {
      let matchScore = 0;

      if (features.hasMedia !== undefined && record.features.hasMedia === features.hasMedia) {
        matchScore += 2;
      }

      if (features.mediaType && record.features.mediaType === features.mediaType) {
        matchScore += 2;
      }

      if (features.textLength && record.features.textLength) {
        const ratio = features.textLength / record.features.textLength;
        if (ratio >= 0.5 && ratio <= 2.0) {
          matchScore += 1;
        }
      }

      if (features.hashtagCount !== undefined && record.features.hashtagCount !== undefined) {
        const diff = Math.abs(features.hashtagCount - record.features.hashtagCount);
        if (diff <= 2) {
          matchScore += 1;
        }
      }

      return matchScore >= 2;
    });

    if (similar.length === 0) {
      return {
        similarPosts: history.length,
        avgPerformance: this.calculateAveragePerformance(history),
        topPerformer: this.calculateTopPerformer(history),
      };
    }

    return {
      similarPosts: similar.length,
      avgPerformance: this.calculateAveragePerformance(similar),
      topPerformer: this.calculateTopPerformer(similar),
    };
  }

  private calculateAveragePerformance(
    history: Array<{ engagement: ContentEngagement }>
  ): number {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, r) => sum + r.engagement.engagementRate, 0);
    return Math.round((total / history.length) * 100) / 100;
  }

  private calculateTopPerformer(
    history: Array<{ engagement: ContentEngagement }>
  ): number {
    if (history.length === 0) return 0;
    const max = history.reduce(
      (best, r) => (r.engagement.engagementRate > best ? r.engagement.engagementRate : best),
      0
    );
    return Math.round(max * 100) / 100;
  }

  private estimateViralScoreFromEngagement(engagement: ContentEngagement): number {
    const engagementRate = engagement.engagementRate;
    const virality = engagement.virality;

    let score = Math.min(50, engagementRate * 10);
    score += Math.min(30, virality * 30);

    if (engagement.reach > engagement.uniqueViews * 2) {
      score += 10;
    }

    const shareRatio = engagement.shares / Math.max(1, engagement.likes);
    if (shareRatio > 0.1) {
      score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let viralPredictorInstance: ViralPredictor | null = null;

export function getViralPredictor(
  analyticsSystem?: SocialAnalyticsSystem
): ViralPredictor {
  if (!viralPredictorInstance) {
    viralPredictorInstance = new ViralPredictor(analyticsSystem);
  }
  return viralPredictorInstance;
}

export function resetViralPredictor(): void {
  viralPredictorInstance = null;
}
