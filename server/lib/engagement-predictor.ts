/**
 * @file engagement-predictor.ts
 * @description ML-style engagement predictor with feature engineering
 * @phase Phase 4 - Intelligence Layer
 *
 * Features:
 * - Feature engineering from post data
 * - Engagement score prediction with confidence intervals
 * - Historical pattern learning
 * - Best time recommendations
 */

import { createModuleLogger } from "../logger";

const log = createModuleLogger("engagement-predictor");

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input features for prediction
 */
export interface PostFeatures {
  // Content features
  textLength: number;
  wordCount: number;
  hashtagCount: number;
  mentionCount: number;
  emojiCount: number;
  urlCount: number;
  hasMedia: boolean;
  mediaCount: number;
  mediaType?: "image" | "video" | "carousel";

  // Author features
  followerCount: number;
  followingCount: number;
  averageEngagementRate: number;
  postFrequency: number;  // posts per day
  accountAge: number;     // days

  // Timing features
  hourOfDay: number;      // 0-23
  dayOfWeek: number;      // 0-6 (Sunday = 0)
  isWeekend: boolean;

  // Platform-specific
  platform: string;

  // Content analysis
  sentiment?: number;     // -1 to 1
  topics?: string[];
}

/**
 * Engagement prediction result
 */
export interface EngagementPrediction {
  // Point estimates
  expectedLikes: number;
  expectedComments: number;
  expectedShares: number;
  expectedEngagementRate: number;

  // Confidence intervals (95%)
  likesRange: { low: number; high: number };
  commentsRange: { low: number; high: number };
  sharesRange: { low: number; high: number };
  engagementRateRange: { low: number; high: number };

  // Scores
  engagementScore: number;    // 0-100
  viralPotential: number;     // 0-100
  confidence: number;         // 0-1

  // Factors
  positiveFactors: string[];
  negativeFactors: string[];
  recommendations: string[];
}

/**
 * Best time recommendation
 */
export interface BestTimeRecommendation {
  dayOfWeek: number;
  hourOfDay: number;
  expectedEngagementMultiplier: number;
  confidence: number;
}

/**
 * Historical engagement data
 */
interface HistoricalData {
  timestamp: Date;
  features: Partial<PostFeatures>;
  actual: {
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  };
}

// =============================================================================
// FEATURE ENGINEERING
// =============================================================================

/**
 * Extract features from post content and metadata
 */
export function extractFeatures(
  content: string,
  options: {
    platform: string;
    mediaCount?: number;
    mediaType?: PostFeatures["mediaType"];
    followerCount?: number;
    followingCount?: number;
    averageEngagementRate?: number;
    postFrequency?: number;
    accountAge?: number;
    timestamp?: Date;
  }
): PostFeatures {
  const text = content || "";
  const timestamp = options.timestamp || new Date();

  // Text analysis
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const hashtags = (text.match(/#\w+/g) || []).length;
  const mentions = (text.match(/@\w+/g) || []).length;
  const emojis = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  const urls = (text.match(/https?:\/\/[^\s]+/g) || []).length;

  // Timing
  const hour = timestamp.getHours();
  const day = timestamp.getDay();

  return {
    textLength: text.length,
    wordCount: words.length,
    hashtagCount: hashtags,
    mentionCount: mentions,
    emojiCount: emojis,
    urlCount: urls,
    hasMedia: (options.mediaCount ?? 0) > 0,
    mediaCount: options.mediaCount ?? 0,
    mediaType: options.mediaType,
    followerCount: options.followerCount ?? 0,
    followingCount: options.followingCount ?? 0,
    averageEngagementRate: options.averageEngagementRate ?? 0,
    postFrequency: options.postFrequency ?? 0,
    accountAge: options.accountAge ?? 0,
    hourOfDay: hour,
    dayOfWeek: day,
    isWeekend: day === 0 || day === 6,
    platform: options.platform,
  };
}

// =============================================================================
// ENGAGEMENT PREDICTOR
// =============================================================================

export class EngagementPredictor {
  // Platform-specific baseline engagement rates
  private platformBaseRates: Map<string, { likes: number; comments: number; shares: number }> = new Map([
    ["twitter", { likes: 0.02, comments: 0.002, shares: 0.005 }],
    ["facebook", { likes: 0.015, comments: 0.003, shares: 0.004 }],
    ["instagram", { likes: 0.035, comments: 0.005, shares: 0.002 }],
    ["linkedin", { likes: 0.02, comments: 0.004, shares: 0.003 }],
    ["tiktok", { likes: 0.05, comments: 0.008, shares: 0.01 }],
    ["youtube", { likes: 0.03, comments: 0.01, shares: 0.005 }],
  ]);

  // Optimal posting times by platform (hour -> multiplier)
  private optimalTimes: Map<string, Map<number, number>> = new Map([
    ["twitter", new Map([[9, 1.3], [12, 1.2], [17, 1.4], [20, 1.2]])],
    ["facebook", new Map([[9, 1.2], [13, 1.3], [16, 1.3], [20, 1.1]])],
    ["instagram", new Map([[11, 1.4], [14, 1.3], [17, 1.2], [21, 1.3]])],
    ["linkedin", new Map([[7, 1.3], [10, 1.4], [12, 1.3], [17, 1.2]])],
    ["tiktok", new Map([[12, 1.2], [19, 1.4], [21, 1.5], [23, 1.3]])],
    ["youtube", new Map([[12, 1.2], [17, 1.3], [20, 1.4], [22, 1.2]])],
  ]);

  // Historical data for learning
  private historicalData: Map<string, HistoricalData[]> = new Map();

  /**
   * Predict engagement for a post
   */
  predict(features: PostFeatures): EngagementPrediction {
    const platform = features.platform.toLowerCase();
    const baseRates = this.platformBaseRates.get(platform) ||
      { likes: 0.02, comments: 0.003, shares: 0.004 };

    // Calculate multipliers
    const contentMultiplier = this.calculateContentMultiplier(features);
    const timingMultiplier = this.calculateTimingMultiplier(features);
    const authorMultiplier = this.calculateAuthorMultiplier(features);

    // Calculate base expectations
    const baseAudience = features.followerCount || 1000;
    const baseLikes = baseAudience * baseRates.likes;
    const baseComments = baseAudience * baseRates.comments;
    const baseShares = baseAudience * baseRates.shares;

    // Apply multipliers
    const totalMultiplier = contentMultiplier * timingMultiplier * authorMultiplier;
    const expectedLikes = Math.round(baseLikes * totalMultiplier);
    const expectedComments = Math.round(baseComments * totalMultiplier);
    const expectedShares = Math.round(baseShares * totalMultiplier);

    // Calculate engagement rate
    const totalEngagement = expectedLikes + expectedComments + expectedShares;
    const expectedEngagementRate = baseAudience > 0
      ? (totalEngagement / baseAudience) * 100
      : 0;

    // Calculate confidence intervals (using normal approximation)
    const variance = 0.3; // 30% variance assumption
    const likesRange = this.calculateConfidenceInterval(expectedLikes, variance);
    const commentsRange = this.calculateConfidenceInterval(expectedComments, variance);
    const sharesRange = this.calculateConfidenceInterval(expectedShares, variance);
    const engagementRateRange = this.calculateConfidenceInterval(expectedEngagementRate, variance);

    // Calculate scores
    const engagementScore = this.calculateEngagementScore(expectedEngagementRate, platform);
    const viralPotential = this.calculateViralPotential(features, totalMultiplier);

    // Determine factors
    const { positiveFactors, negativeFactors } = this.analyzeFactors(features);
    const recommendations = this.generateRecommendations(features, negativeFactors);

    // Calculate confidence based on data availability
    const confidence = this.calculateConfidence(features);

    return {
      expectedLikes,
      expectedComments,
      expectedShares,
      expectedEngagementRate,
      likesRange,
      commentsRange,
      sharesRange,
      engagementRateRange,
      engagementScore,
      viralPotential,
      confidence,
      positiveFactors,
      negativeFactors,
      recommendations,
    };
  }

  /**
   * Calculate content quality multiplier
   */
  private calculateContentMultiplier(features: PostFeatures): number {
    let multiplier = 1.0;

    // Text length scoring (optimal: 100-280 chars for most platforms)
    if (features.textLength > 0 && features.textLength <= 280) {
      multiplier *= 1.1;
    } else if (features.textLength > 500) {
      multiplier *= 0.9;
    }

    // Hashtag scoring (optimal: 3-5)
    if (features.hashtagCount >= 3 && features.hashtagCount <= 5) {
      multiplier *= 1.15;
    } else if (features.hashtagCount > 10) {
      multiplier *= 0.85;
    }

    // Emoji usage (moderate is good)
    if (features.emojiCount >= 1 && features.emojiCount <= 3) {
      multiplier *= 1.1;
    }

    // Media presence
    if (features.hasMedia) {
      if (features.mediaType === "video") {
        multiplier *= 1.5;
      } else if (features.mediaType === "carousel") {
        multiplier *= 1.3;
      } else {
        multiplier *= 1.2;
      }
    }

    // URL presence (often lowers engagement on social)
    if (features.urlCount > 0) {
      multiplier *= 0.9;
    }

    return multiplier;
  }

  /**
   * Calculate timing multiplier
   */
  private calculateTimingMultiplier(features: PostFeatures): number {
    const platform = features.platform.toLowerCase();
    const optimalHours = this.optimalTimes.get(platform);

    if (!optimalHours) return 1.0;

    // Check if current hour is optimal
    if (optimalHours.has(features.hourOfDay)) {
      return optimalHours.get(features.hourOfDay)!;
    }

    // Check adjacent hours
    for (const [hour, mult] of optimalHours) {
      if (Math.abs(hour - features.hourOfDay) <= 1) {
        return 1 + (mult - 1) * 0.5; // Half the bonus for adjacent hours
      }
    }

    // Weekend adjustment
    if (features.isWeekend) {
      if (platform === "instagram" || platform === "tiktok") {
        return 1.1;
      } else if (platform === "linkedin") {
        return 0.7;
      }
    }

    return 1.0;
  }

  /**
   * Calculate author influence multiplier
   */
  private calculateAuthorMultiplier(features: PostFeatures): number {
    let multiplier = 1.0;

    // Historical engagement rate
    if (features.averageEngagementRate > 5) {
      multiplier *= 1.3;
    } else if (features.averageEngagementRate > 3) {
      multiplier *= 1.15;
    } else if (features.averageEngagementRate < 1) {
      multiplier *= 0.9;
    }

    // Account age (established accounts perform better)
    if (features.accountAge > 365) {
      multiplier *= 1.1;
    } else if (features.accountAge < 30) {
      multiplier *= 0.8;
    }

    // Follower/following ratio
    if (features.followerCount > 0 && features.followingCount > 0) {
      const ratio = features.followerCount / features.followingCount;
      if (ratio > 10) {
        multiplier *= 1.2;
      } else if (ratio < 0.1) {
        multiplier *= 0.8;
      }
    }

    return multiplier;
  }

  /**
   * Calculate engagement score (0-100)
   */
  private calculateEngagementScore(engagementRate: number, platform: string): number {
    // Platform-specific thresholds
    const thresholds: Record<string, { low: number; high: number }> = {
      twitter: { low: 1, high: 5 },
      facebook: { low: 1, high: 3 },
      instagram: { low: 3, high: 8 },
      linkedin: { low: 2, high: 5 },
      tiktok: { low: 5, high: 15 },
      youtube: { low: 3, high: 10 },
    };

    const t = thresholds[platform] || { low: 2, high: 5 };

    if (engagementRate >= t.high) return 100;
    if (engagementRate <= 0) return 0;
    if (engagementRate <= t.low) return (engagementRate / t.low) * 50;

    return 50 + ((engagementRate - t.low) / (t.high - t.low)) * 50;
  }

  /**
   * Calculate viral potential (0-100)
   */
  private calculateViralPotential(features: PostFeatures, multiplier: number): number {
    let score = 0;

    // Base score from multiplier
    score += Math.min(30, (multiplier - 1) * 30);

    // Video content has higher viral potential
    if (features.mediaType === "video") {
      score += 20;
    }

    // Short, punchy content
    if (features.textLength > 50 && features.textLength < 150) {
      score += 10;
    }

    // Hashtags for discoverability
    if (features.hashtagCount >= 3 && features.hashtagCount <= 7) {
      score += 10;
    }

    // Emotional content (inferred from emojis)
    if (features.emojiCount >= 2) {
      score += 5;
    }

    // Timing boost
    if (!features.isWeekend || features.platform === "instagram") {
      score += 5;
    }

    // Author influence
    if (features.followerCount > 10000) {
      score += 15;
    } else if (features.followerCount > 1000) {
      score += 10;
    }

    // High engagement rate history
    if (features.averageEngagementRate > 5) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate confidence interval
   */
  private calculateConfidenceInterval(
    expected: number,
    variance: number
  ): { low: number; high: number } {
    const stdDev = expected * variance;
    return {
      low: Math.max(0, Math.round(expected - 1.96 * stdDev)),
      high: Math.round(expected + 1.96 * stdDev),
    };
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(features: PostFeatures): number {
    let confidence = 0.5; // Base confidence

    // More data = higher confidence
    if (features.followerCount > 0) confidence += 0.1;
    if (features.averageEngagementRate > 0) confidence += 0.15;
    if (features.accountAge > 0) confidence += 0.1;
    if (features.postFrequency > 0) confidence += 0.1;

    // Historical data boost
    const platformHistory = this.historicalData.get(features.platform);
    if (platformHistory && platformHistory.length > 10) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Analyze positive and negative factors
   */
  private analyzeFactors(features: PostFeatures): {
    positiveFactors: string[];
    negativeFactors: string[];
  } {
    const positive: string[] = [];
    const negative: string[] = [];

    // Content factors
    if (features.hasMedia) {
      positive.push(`${features.mediaType || "image"} content boosts engagement`);
    } else {
      negative.push("No media attached");
    }

    if (features.hashtagCount >= 3 && features.hashtagCount <= 5) {
      positive.push("Optimal hashtag count");
    } else if (features.hashtagCount > 10) {
      negative.push("Too many hashtags may appear spammy");
    } else if (features.hashtagCount === 0) {
      negative.push("No hashtags limits discoverability");
    }

    if (features.textLength > 0 && features.textLength <= 280) {
      positive.push("Concise content length");
    } else if (features.textLength > 500) {
      negative.push("Long content may reduce engagement");
    }

    // Timing factors
    const optimalHours = this.optimalTimes.get(features.platform.toLowerCase());
    if (optimalHours?.has(features.hourOfDay)) {
      positive.push("Posting at optimal time");
    }

    if (features.platform === "linkedin" && features.isWeekend) {
      negative.push("Weekend posting on LinkedIn typically underperforms");
    }

    // Author factors
    if (features.averageEngagementRate > 5) {
      positive.push("Strong historical engagement rate");
    } else if (features.averageEngagementRate < 1) {
      negative.push("Low historical engagement rate");
    }

    return { positiveFactors: positive, negativeFactors: negative };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    features: PostFeatures,
    negativeFactors: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (!features.hasMedia) {
      recommendations.push("Add an image or video to boost engagement by 20-50%");
    }

    if (features.hashtagCount === 0) {
      recommendations.push("Add 3-5 relevant hashtags for better discoverability");
    } else if (features.hashtagCount > 10) {
      recommendations.push("Reduce hashtags to 3-5 for optimal engagement");
    }

    const optimalHours = this.optimalTimes.get(features.platform.toLowerCase());
    if (optimalHours && !optimalHours.has(features.hourOfDay)) {
      const bestHours = Array.from(optimalHours.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([h]) => `${h}:00`);
      recommendations.push(`Consider posting at ${bestHours.join(" or ")} for better reach`);
    }

    if (features.textLength > 500) {
      recommendations.push("Shorten content to under 280 characters for higher engagement");
    }

    if (features.urlCount > 0 && features.platform !== "linkedin") {
      recommendations.push("External links often reduce reach - consider putting link in bio/comments");
    }

    return recommendations;
  }

  /**
   * Get best posting times for a platform
   */
  getBestTimes(platform: string, limit: number = 5): BestTimeRecommendation[] {
    const optimalHours = this.optimalTimes.get(platform.toLowerCase());
    if (!optimalHours) {
      return [];
    }

    const recommendations: BestTimeRecommendation[] = [];

    // Generate recommendations for each day
    for (let day = 0; day < 7; day++) {
      for (const [hour, multiplier] of optimalHours) {
        recommendations.push({
          dayOfWeek: day,
          hourOfDay: hour,
          expectedEngagementMultiplier: multiplier,
          confidence: 0.7,
        });
      }
    }

    // Sort by multiplier and return top N
    return recommendations
      .sort((a, b) => b.expectedEngagementMultiplier - a.expectedEngagementMultiplier)
      .slice(0, limit);
  }

  /**
   * Record historical data for learning
   */
  recordOutcome(
    platform: string,
    features: Partial<PostFeatures>,
    actual: HistoricalData["actual"]
  ): void {
    if (!this.historicalData.has(platform)) {
      this.historicalData.set(platform, []);
    }

    this.historicalData.get(platform)!.push({
      timestamp: new Date(),
      features,
      actual,
    });

    // Keep last 1000 data points per platform
    const data = this.historicalData.get(platform)!;
    if (data.length > 1000) {
      this.historicalData.set(platform, data.slice(-1000));
    }

    log.debug({ platform, actual }, "Recorded engagement outcome");
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let predictorInstance: EngagementPredictor | null = null;

export function getEngagementPredictor(): EngagementPredictor {
  if (!predictorInstance) {
    predictorInstance = new EngagementPredictor();
  }
  return predictorInstance;
}

export function resetEngagementPredictor(): void {
  predictorInstance = null;
}

// =============================================================================
// CONTRACT-COMPLIANT INTERFACE
// Simple linear regression model per specification
// =============================================================================

/**
 * Input data for engagement prediction (contract interface)
 */
export interface PostData {
  content: string;
  hashtags: string[];
  mediaPresent: boolean;
  mediaType?: "image" | "video" | "carousel";
  timestamp: Date;
  platform?: string;
  authorFollowers?: number;
  authorEngagementRate?: number;
}

/**
 * Factor contributing to prediction (contract interface)
 */
export interface PredictionFactor {
  name: string;
  weight: number;
  value: number;
  impact: "positive" | "negative" | "neutral";
}

/**
 * Engagement prediction result (contract interface)
 */
export interface ContractEngagementPrediction {
  score: number; // 0-100
  confidence: number; // 0-1
  factors: PredictionFactor[];
  recommendations: string[];
}

/**
 * In-memory linear regression model for engagement prediction.
 * Implements contract specification with simple, interpretable model.
 */
class LinearRegressionModel {
  // Feature weights learned from training data
  private weights: Map<string, number> = new Map([
    ["wordCount", 0.15],
    ["hashtagCount", 0.12],
    ["mediaPresent", 0.25],
    ["videoBonus", 0.15],
    ["carouselBonus", 0.08],
    ["optimalHour", 0.10],
    ["weekendBonus", 0.05],
    ["followerLog", 0.08],
    ["historicalRate", 0.02],
  ]);

  // Bias term
  private intercept: number = 30;

  // Training statistics for confidence calculation
  private trainingCount: number = 0;
  private meanSquaredError: number = 0;
  private featureMeans: Map<string, number> = new Map();
  private featureStdDevs: Map<string, number> = new Map();

  /**
   * Extracts numerical features from post data.
   * Returns map of feature name to normalized value.
   */
  extractFeatures(post: PostData): Map<string, number> {
    const features = new Map<string, number>();
    const content = post.content || "";

    // Word count (optimal: 50-150 words, normalized 0-1)
    const words = content.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    const wordScore = wordCount <= 50
      ? wordCount / 50
      : wordCount <= 150
        ? 1
        : Math.max(0, 1 - (wordCount - 150) / 200);
    features.set("wordCount", wordScore);

    // Hashtag count (optimal: 3-5, normalized 0-1)
    const hashtagCount = post.hashtags?.length || 0;
    const hashtagScore = hashtagCount === 0
      ? 0.3
      : hashtagCount <= 2
        ? 0.6
        : hashtagCount <= 5
          ? 1
          : Math.max(0.3, 1 - (hashtagCount - 5) / 10);
    features.set("hashtagCount", hashtagScore);

    // Media presence (binary, high impact)
    features.set("mediaPresent", post.mediaPresent ? 1 : 0);

    // Media type bonuses
    features.set("videoBonus", post.mediaType === "video" ? 1 : 0);
    features.set("carouselBonus", post.mediaType === "carousel" ? 1 : 0);

    // Time of day (optimal hours: 9-11, 12-14, 17-20)
    const hour = post.timestamp.getHours();
    const optimalHours = [9, 10, 11, 12, 13, 14, 17, 18, 19, 20];
    const hourScore = optimalHours.includes(hour)
      ? 1
      : Math.abs(hour - 12) <= 4
        ? 0.7
        : 0.4;
    features.set("optimalHour", hourScore);

    // Day of week (weekend slight bonus for consumer platforms)
    const day = post.timestamp.getDay();
    const isWeekend = day === 0 || day === 6;
    features.set("weekendBonus", isWeekend ? 1 : 0);

    // Follower count (log scale, normalized)
    const followers = post.authorFollowers || 1000;
    const followerLog = Math.log10(Math.max(1, followers)) / 6; // Normalized to ~0-1 for 1M followers
    features.set("followerLog", Math.min(1, followerLog));

    // Historical engagement rate
    const histRate = post.authorEngagementRate || 2;
    const rateScore = Math.min(1, histRate / 10);
    features.set("historicalRate", rateScore);

    return features;
  }

  /**
   * Predicts engagement score using linear combination of features.
   */
  predict(features: Map<string, number>): number {
    let score = this.intercept;

    for (const [feature, value] of features) {
      const weight = this.weights.get(feature) || 0;
      score += weight * value * 100; // Scale to 0-100 range
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculates prediction confidence based on:
   * 1. Training data quantity
   * 2. Feature similarity to training distribution
   * 3. Model error rate
   */
  calculateConfidence(features: Map<string, number>): number {
    // Base confidence from training data quantity
    let confidence = Math.min(0.5, this.trainingCount / 200);

    // Boost from model accuracy (inverse of MSE)
    if (this.meanSquaredError > 0 && this.trainingCount > 10) {
      const accuracyBoost = Math.max(0, 0.3 - this.meanSquaredError / 1000);
      confidence += accuracyBoost;
    }

    // Penalty for features far from training distribution
    if (this.featureMeans.size > 0) {
      let totalDeviation = 0;
      let featureCount = 0;

      for (const [feature, value] of features) {
        const mean = this.featureMeans.get(feature);
        const stdDev = this.featureStdDevs.get(feature);

        if (mean !== undefined && stdDev !== undefined && stdDev > 0) {
          const zScore = Math.abs(value - mean) / stdDev;
          totalDeviation += Math.min(2, zScore);
          featureCount++;
        }
      }

      if (featureCount > 0) {
        const avgDeviation = totalDeviation / featureCount;
        confidence -= Math.min(0.2, avgDeviation * 0.1);
      }
    }

    // Minimum confidence floor
    return Math.max(0.3, Math.min(1, confidence + 0.2));
  }

  /**
   * Analyzes which factors contributed to the prediction.
   */
  analyzeFactors(features: Map<string, number>): PredictionFactor[] {
    const factors: PredictionFactor[] = [];
    const featureDescriptions: Record<string, string> = {
      wordCount: "Content length",
      hashtagCount: "Hashtag usage",
      mediaPresent: "Media attachment",
      videoBonus: "Video content",
      carouselBonus: "Carousel format",
      optimalHour: "Posting time",
      weekendBonus: "Weekend posting",
      followerLog: "Audience size",
      historicalRate: "Historical engagement",
    };

    for (const [feature, value] of features) {
      const weight = this.weights.get(feature) || 0;
      const contribution = weight * value * 100;

      if (Math.abs(contribution) > 1) {
        factors.push({
          name: featureDescriptions[feature] || feature,
          weight,
          value: Math.round(value * 100) / 100,
          impact: contribution > 5
            ? "positive"
            : contribution < -5
              ? "negative"
              : "neutral",
        });
      }
    }

    // Sort by absolute impact
    return factors.sort((a, b) => Math.abs(b.weight * b.value) - Math.abs(a.weight * a.value));
  }

  /**
   * Generates recommendations based on factor analysis.
   */
  generateRecommendations(features: Map<string, number>): string[] {
    const recommendations: string[] = [];

    const mediaPresent = features.get("mediaPresent") || 0;
    const hashtagScore = features.get("hashtagCount") || 0;
    const optimalHour = features.get("optimalHour") || 0;
    const wordScore = features.get("wordCount") || 0;
    const videoBonus = features.get("videoBonus") || 0;

    if (mediaPresent === 0) {
      recommendations.push("Add an image or video to boost engagement by 20-40%");
    } else if (videoBonus === 0 && mediaPresent === 1) {
      recommendations.push("Video content typically outperforms images by 50%");
    }

    if (hashtagScore < 0.6) {
      recommendations.push("Use 3-5 relevant hashtags for better discoverability");
    } else if (hashtagScore < 1) {
      recommendations.push("Reduce hashtags to 3-5 for optimal engagement");
    }

    if (optimalHour < 0.7) {
      recommendations.push("Post between 9-11am or 5-8pm for higher engagement");
    }

    if (wordScore < 0.5) {
      recommendations.push("Aim for 50-150 words for optimal engagement");
    } else if (wordScore < 0.8) {
      recommendations.push("Consider shortening content for better readability");
    }

    return recommendations.slice(0, 4);
  }

  /**
   * Trains the model using stochastic gradient descent.
   * Updates weights based on prediction errors.
   */
  train(data: { features: Map<string, number>; actualScore: number }[]): void {
    if (data.length === 0) return;

    const learningRate = 0.01;
    const epochs = 100;

    // Compute feature statistics for confidence calculation
    this.computeFeatureStatistics(data);

    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalError = 0;

      for (const sample of data) {
        const predicted = this.predict(sample.features);
        const error = sample.actualScore - predicted;
        totalError += error * error;

        // Update weights using gradient descent
        for (const [feature, value] of sample.features) {
          const currentWeight = this.weights.get(feature) || 0;
          const gradient = -2 * error * value;
          const newWeight = currentWeight - learningRate * gradient / 100;
          this.weights.set(feature, newWeight);
        }

        // Update intercept
        this.intercept -= learningRate * (-2 * error) / 10;
      }

      this.meanSquaredError = totalError / data.length;
    }

    this.trainingCount += data.length;
    log.debug({ trainingCount: this.trainingCount, mse: this.meanSquaredError }, "Model trained");
  }

  /**
   * Computes mean and standard deviation for each feature.
   */
  private computeFeatureStatistics(data: { features: Map<string, number> }[]): void {
    const featureSums = new Map<string, number>();
    const featureSumSquares = new Map<string, number>();
    const featureCounts = new Map<string, number>();

    for (const sample of data) {
      for (const [feature, value] of sample.features) {
        featureSums.set(feature, (featureSums.get(feature) || 0) + value);
        featureSumSquares.set(feature, (featureSumSquares.get(feature) || 0) + value * value);
        featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
      }
    }

    for (const [feature, sum] of featureSums) {
      const count = featureCounts.get(feature) || 1;
      const mean = sum / count;
      const sumSquares = featureSumSquares.get(feature) || 0;
      const variance = sumSquares / count - mean * mean;
      const stdDev = Math.sqrt(Math.max(0, variance));

      this.featureMeans.set(feature, mean);
      this.featureStdDevs.set(feature, stdDev);
    }
  }

  /**
   * Returns current model weights for inspection.
   */
  getWeights(): Record<string, number> {
    const weights: Record<string, number> = { intercept: this.intercept };
    for (const [feature, weight] of this.weights) {
      weights[feature] = weight;
    }
    return weights;
  }
}

// Singleton model instance
let modelInstance: LinearRegressionModel | null = null;

function getModel(): LinearRegressionModel {
  if (!modelInstance) {
    modelInstance = new LinearRegressionModel();
  }
  return modelInstance;
}

/**
 * Predicts engagement for a post (contract interface).
 *
 * @param post - Post data including content, hashtags, media, timing
 * @returns Engagement prediction with score, confidence, factors, recommendations
 */
export function predictEngagement(post: PostData): ContractEngagementPrediction {
  const model = getModel();
  const features = model.extractFeatures(post);
  const score = model.predict(features);
  const confidence = model.calculateConfidence(features);
  const factors = model.analyzeFactors(features);
  const recommendations = model.generateRecommendations(features);

  log.debug({ score, confidence, factorCount: factors.length }, "Engagement predicted");

  return {
    score: Math.round(score),
    confidence: Math.round(confidence * 100) / 100,
    factors,
    recommendations,
  };
}

/**
 * Trains the model with historical data (contract interface).
 * Uses gradient descent to update feature weights.
 *
 * @param historicalData - Array of posts with known engagement outcomes
 */
export function trainModel(historicalData: PostData[]): void {
  if (historicalData.length === 0) {
    log.warn("No training data provided");
    return;
  }

  const model = getModel();

  // Convert PostData to training samples
  // Note: In production, actualScore would come from historical engagement metrics
  const trainingSamples = historicalData.map((post) => {
    const features = model.extractFeatures(post);

    // Estimate actual score from available metrics (simplified)
    // In production, this would be actual engagement rate * 10 or similar
    const actualScore = (post.authorEngagementRate || 2) * 10 +
      (post.mediaPresent ? 15 : 0) +
      Math.min(20, (post.hashtags?.length || 0) * 4);

    return { features, actualScore: Math.min(100, actualScore) };
  });

  model.train(trainingSamples);
  log.info({ sampleCount: trainingSamples.length }, "Model training complete");
}

/**
 * Resets the model to initial state.
 */
export function resetModel(): void {
  modelInstance = null;
}

/**
 * Gets current model weights for debugging/inspection.
 */
export function getModelWeights(): Record<string, number> {
  return getModel().getWeights();
}
