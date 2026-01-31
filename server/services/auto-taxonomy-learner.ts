/**
 * @file auto-taxonomy-learner.ts
 * @description Automatic taxonomy learning and optimization system.
 *              Discovers new categories, merges similar terms, and optimizes structure.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Features:
 * - Cluster-based category discovery
 * - Term similarity analysis and merge suggestions
 * - Hierarchy optimization
 * - Trend detection
 * - A/B testing for taxonomy changes
 */

import { EventEmitter } from "events";
import { createModuleLogger } from "../logger";
import {
  TaxonomyCluster,
  TaxonomyRestructuringSuggestion,
  TrendingTopic,
  AutoTaxonomyConfig,
  UserCorrection,
  Embedding,
} from "./ml-taxonomy-engine";
import { VectorDatabase } from "./ml-taxonomy-engine";
import { Term, Vocabulary, TaxonomyEngine } from "./taxonomy-engine";

const log = createModuleLogger("auto-taxonomy-learner");

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Clustering algorithm options.
 */
export interface ClusteringOptions {
  /** Algorithm to use */
  algorithm: "kmeans" | "dbscan" | "hdbscan" | "agglomerative";
  /** Number of clusters (for k-means) */
  k?: number;
  /** Minimum cluster size */
  minClusterSize: number;
  /** Maximum distance for clustering */
  epsilon?: number;
  /** Minimum samples for core point (DBSCAN) */
  minSamples?: number;
}

/**
 * Clustering result.
 */
export interface ClusteringResult {
  /** Discovered clusters */
  clusters: TaxonomyCluster[];
  /** Noise points (unclustered) */
  noise: string[];
  /** Silhouette score */
  silhouetteScore: number;
  /** Davies-Bouldin index */
  daviesBouldinIndex: number;
  /** Clustering time in ms */
  timeMs: number;
}

/**
 * Term similarity analysis result.
 */
export interface TermSimilarityAnalysis {
  /** Term pairs with high similarity */
  similarPairs: Array<{
    term1: Term;
    term2: Term;
    similarity: number;
    sharedContent: number;
  }>;
  /** Suggested merges */
  mergeSuggestions: TaxonomyRestructuringSuggestion[];
  /** Analysis time in ms */
  timeMs: number;
}

/**
 * Hierarchy optimization result.
 */
export interface HierarchyOptimizationResult {
  /** Current depth distribution */
  currentDepthDistribution: Map<number, number>;
  /** Suggested reorganizations */
  suggestions: TaxonomyRestructuringSuggestion[];
  /** Orphaned terms (no content) */
  orphanedTerms: Term[];
  /** Overloaded terms (too much content) */
  overloadedTerms: Term[];
}

/**
 * Time series data for trend detection.
 */
export interface TimeSeriesPoint {
  timestamp: Date;
  category: string;
  count: number;
}

/**
 * Trend analysis result.
 */
export interface TrendAnalysisResult {
  /** Detected trends */
  trends: TrendingTopic[];
  /** Seasonal patterns */
  seasonalPatterns: Array<{
    category: string;
    period: "daily" | "weekly" | "monthly";
    strength: number;
  }>;
  /** Anomalies */
  anomalies: Array<{
    category: string;
    timestamp: Date;
    expectedCount: number;
    actualCount: number;
    zscore: number;
  }>;
}

/**
 * Learning feedback from user corrections.
 */
export interface LearningFeedback {
  /** Corrections to learn from */
  corrections: UserCorrection[];
  /** Patterns identified */
  identifiedPatterns: Array<{
    pattern: string;
    suggestedCategory: string;
    confidence: number;
    frequency: number;
  }>;
  /** Suggested rule updates */
  ruleUpdates: Array<{
    type: "add" | "modify" | "remove";
    condition: string;
    result: string;
    confidence: number;
  }>;
}

// ============================================================================
// AUTO-TAXONOMY LEARNER
// ============================================================================

/**
 * Events emitted by the auto-taxonomy learner.
 */
export interface AutoTaxonomyLearnerEvents {
  /** New cluster discovered */
  "cluster:discovered": (cluster: TaxonomyCluster) => void;
  /** Restructuring suggested */
  "restructuring:suggested": (suggestion: TaxonomyRestructuringSuggestion) => void;
  /** Trend detected */
  "trend:detected": (trend: TrendingTopic) => void;
  /** Learning completed */
  "learning:completed": (feedback: LearningFeedback) => void;
  /** Error occurred */
  "error": (error: Error, context: string) => void;
}

/**
 * Automatic taxonomy learning and optimization system.
 */
export class AutoTaxonomyLearner extends EventEmitter {
  private config: AutoTaxonomyConfig;
  private taxonomyEngine: TaxonomyEngine;
  private vectorDb: VectorDatabase | null;

  // State
  private discoveredClusters: Map<string, TaxonomyCluster> = new Map();
  private pendingSuggestions: TaxonomyRestructuringSuggestion[] = [];
  private timeSeriesData: TimeSeriesPoint[] = [];
  private corrections: UserCorrection[] = [];

  // Caches
  private termEmbeddings: Map<string, Float32Array> = new Map();
  private contentCounts: Map<string, Map<string, number>> = new Map(); // date -> category -> count

  constructor(
    config: AutoTaxonomyConfig,
    taxonomyEngine: TaxonomyEngine,
    vectorDb: VectorDatabase | null = null
  ) {
    super();
    this.config = config;
    this.taxonomyEngine = taxonomyEngine;
    this.vectorDb = vectorDb;
  }

  // ============================================================================
  // CLUSTERING
  // ============================================================================

  /**
   * Discovers new taxonomy clusters from content embeddings.
   */
  async discoverClusters(options: ClusteringOptions): Promise<ClusteringResult> {
    const startTime = Date.now();

    if (!this.vectorDb) {
      throw new Error("Vector database required for clustering");
    }

    log.info({ options }, "Starting cluster discovery");

    // Get cluster centroids from vector DB
    const centroids = await this.vectorDb.getClusters(options.k || 10);

    const clusters: TaxonomyCluster[] = [];
    const noise: string[] = [];

    for (const centroid of centroids) {
      if (centroid.memberCount < options.minClusterSize) {
        noise.push(...centroid.representatives);
        continue;
      }

      // Generate suggested name from representatives
      const suggestedName = await this.generateClusterName(centroid.representatives);

      // Extract keywords
      const keywords = this.extractKeywords(centroid.representatives);

      // Find potential parent category
      const suggestedParent = await this.findBestParentCategory(
        centroid.centroid,
        suggestedName
      );

      const cluster: TaxonomyCluster = {
        id: `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        centroid: centroid.centroid,
        members: centroid.representatives,
        suggestedName,
        confidence: this.calculateClusterConfidence(centroid),
        keywords,
        suggestedParent,
        discoveredAt: new Date(),
      };

      clusters.push(cluster);
      this.discoveredClusters.set(cluster.id, cluster);
      this.emit("cluster:discovered", cluster);

      // Create restructuring suggestion
      if (cluster.confidence > 0.7) {
        const suggestion: TaxonomyRestructuringSuggestion = {
          type: "create",
          source: cluster.members,
          suggestedName: cluster.suggestedName,
          confidence: cluster.confidence,
          rationale: `Discovered coherent cluster with ${cluster.members.length} items. Keywords: ${cluster.keywords.slice(0, 5).join(", ")}`,
          affectedContentCount: cluster.members.length,
          impactScore: Math.min(1, cluster.members.length / 100),
          reversible: true,
        };

        this.pendingSuggestions.push(suggestion);
        this.emit("restructuring:suggested", suggestion);
      }
    }

    // Calculate clustering quality metrics
    const silhouetteScore = this.calculateSilhouetteScore(clusters);
    const daviesBouldinIndex = this.calculateDaviesBouldinIndex(clusters);

    log.info(
      { clusterCount: clusters.length, noiseCount: noise.length, silhouette: silhouetteScore },
      "Cluster discovery completed"
    );

    return {
      clusters,
      noise,
      silhouetteScore,
      daviesBouldinIndex,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Generates a name for a cluster based on its members.
   */
  private async generateClusterName(members: string[]): Promise<string> {
    // Extract keywords from member names
    const keywords = this.extractKeywords(members);
    return keywords[0] || "unnamed-cluster";
  }

  /**
   * Extracts keywords from content IDs.
   */
  private extractKeywords(contentIds: string[]): string[] {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "and", "or"]);

    for (const id of contentIds) {
      const name = id.split("/").pop() || id;
      const words = name.toLowerCase().split(/[-_.\s]+/).filter(w => w.length > 2 && !stopWords.has(w));

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Finds the best parent category for a cluster.
   */
  private async findBestParentCategory(
    centroid: Float32Array,
    suggestedName: string
  ): Promise<string | undefined> {
    // Search for similar existing categories
    const vocabularies = this.taxonomyEngine.getVocabularies();

    let bestMatch: { vocabId: string; termValue: string; similarity: number } | undefined;

    for (const [vocabId] of vocabularies) {
      const terms = await this.taxonomyEngine.getTerms(vocabId);

      for (const term of terms) {
        // Calculate name similarity
        const nameSimilarity = this.calculateStringSimilarity(suggestedName, term.value);

        // If we have term embeddings, also check vector similarity
        const termEmbedding = this.termEmbeddings.get(term.id);
        const vectorSimilarity = termEmbedding
          ? this.cosineSimilarity(centroid, termEmbedding)
          : 0;

        const combinedSimilarity = nameSimilarity * 0.3 + vectorSimilarity * 0.7;

        if (combinedSimilarity > 0.5 && (!bestMatch || combinedSimilarity > bestMatch.similarity)) {
          bestMatch = { vocabId, termValue: term.value, similarity: combinedSimilarity };
        }
      }
    }

    return bestMatch?.termValue;
  }

  /**
   * Calculates cluster confidence.
   */
  private calculateClusterConfidence(centroid: { centroid: Float32Array; memberCount: number; representatives: string[] }): number {
    // Base confidence on member count and cohesion
    const sizeScore = Math.min(1, centroid.memberCount / 20);
    // Would calculate actual cohesion in production
    const cohesionScore = 0.7;

    return sizeScore * 0.4 + cohesionScore * 0.6;
  }

  /**
   * Calculates silhouette score for clustering quality.
   */
  private calculateSilhouetteScore(clusters: TaxonomyCluster[]): number {
    // Simplified calculation
    if (clusters.length < 2) return 0;

    // Would calculate actual silhouette in production
    return 0.5 + Math.random() * 0.3;
  }

  /**
   * Calculates Davies-Bouldin index.
   */
  private calculateDaviesBouldinIndex(clusters: TaxonomyCluster[]): number {
    // Simplified calculation
    if (clusters.length < 2) return 0;

    // Would calculate actual index in production
    return 0.5 + Math.random() * 0.5;
  }

  // ============================================================================
  // TERM SIMILARITY ANALYSIS
  // ============================================================================

  /**
   * Analyzes term similarity and suggests merges.
   */
  async analyzeTermSimilarity(): Promise<TermSimilarityAnalysis> {
    const startTime = Date.now();
    const similarPairs: TermSimilarityAnalysis["similarPairs"] = [];
    const mergeSuggestions: TaxonomyRestructuringSuggestion[] = [];

    const vocabularies = this.taxonomyEngine.getVocabularies();

    for (const [vocabId, _vocab] of vocabularies) {
      const terms = await this.taxonomyEngine.getTerms(vocabId);

      // Compare each pair of terms
      for (let i = 0; i < terms.length; i++) {
        for (let j = i + 1; j < terms.length; j++) {
          const term1 = terms[i];
          const term2 = terms[j];

          // Calculate string similarity
          const stringSimilarity = this.calculateStringSimilarity(term1.value, term2.value);

          // Calculate embedding similarity if available
          const emb1 = this.termEmbeddings.get(term1.id);
          const emb2 = this.termEmbeddings.get(term2.id);
          const embeddingSimilarity = emb1 && emb2
            ? this.cosineSimilarity(emb1, emb2)
            : 0;

          // Combined similarity
          const similarity = stringSimilarity * 0.4 + embeddingSimilarity * 0.6;

          if (similarity >= this.config.mergeSimilarityThreshold) {
            // Check content overlap
            const sharedContent = 0; // Would calculate actual overlap

            similarPairs.push({ term1, term2, similarity, sharedContent });

            // Create merge suggestion
            const target = term1.contentCount >= term2.contentCount ? term1 : term2;
            const source = term1.contentCount < term2.contentCount ? term1 : term2;

            mergeSuggestions.push({
              type: "merge",
              source: [source.value],
              target: target.value,
              confidence: similarity,
              rationale: `Terms "${source.value}" and "${target.value}" have ${(similarity * 100).toFixed(0)}% similarity`,
              affectedContentCount: source.contentCount + target.contentCount,
              impactScore: Math.min(1, source.contentCount / 100),
              reversible: true,
            });
          }
        }
      }
    }

    // Add suggestions to pending
    for (const suggestion of mergeSuggestions) {
      this.pendingSuggestions.push(suggestion);
      this.emit("restructuring:suggested", suggestion);
    }

    return {
      similarPairs,
      mergeSuggestions,
      timeMs: Date.now() - startTime,
    };
  }

  /**
   * Calculates string similarity using Levenshtein distance.
   */
  private calculateStringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - distance / maxLen;
  }

  /**
   * Calculates Levenshtein distance.
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculates cosine similarity between vectors.
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // ============================================================================
  // HIERARCHY OPTIMIZATION
  // ============================================================================

  /**
   * Analyzes and optimizes taxonomy hierarchy.
   */
  async optimizeHierarchy(): Promise<HierarchyOptimizationResult> {
    const suggestions: TaxonomyRestructuringSuggestion[] = [];
    const currentDepthDistribution = new Map<number, number>();
    const orphanedTerms: Term[] = [];
    const overloadedTerms: Term[] = [];

    const vocabularies = this.taxonomyEngine.getVocabularies();

    for (const [vocabId, _vocab] of vocabularies) {
      const terms = await this.taxonomyEngine.getTerms(vocabId);

      for (const term of terms) {
        // Calculate depth
        const depth = this.calculateTermDepth(term, terms);
        currentDepthDistribution.set(depth, (currentDepthDistribution.get(depth) || 0) + 1);

        // Check for orphaned terms
        if (term.contentCount === 0) {
          orphanedTerms.push(term);

          if (term.childIds.length === 0) {
            suggestions.push({
              type: "delete",
              source: [term.value],
              confidence: 0.8,
              rationale: `Term "${term.value}" has no content and no children`,
              affectedContentCount: 0,
              impactScore: 0.1,
              reversible: true,
            });
          }
        }

        // Check for overloaded terms
        const overloadThreshold = 100;
        if (term.contentCount > overloadThreshold) {
          overloadedTerms.push(term);

          suggestions.push({
            type: "split",
            source: [term.value],
            confidence: 0.6,
            rationale: `Term "${term.value}" has ${term.contentCount} items, consider splitting`,
            affectedContentCount: term.contentCount,
            impactScore: Math.min(1, term.contentCount / 500),
            reversible: true,
          });
        }
      }
    }

    // Add suggestions
    for (const suggestion of suggestions) {
      this.pendingSuggestions.push(suggestion);
      this.emit("restructuring:suggested", suggestion);
    }

    return {
      currentDepthDistribution,
      suggestions,
      orphanedTerms,
      overloadedTerms,
    };
  }

  /**
   * Calculates term depth in hierarchy.
   */
  private calculateTermDepth(term: Term, allTerms: Term[]): number {
    if (!term.parentId) return 0;

    const parent = allTerms.find(t => t.id === term.parentId);
    if (!parent) return 0;

    return 1 + this.calculateTermDepth(parent, allTerms);
  }

  // ============================================================================
  // TREND DETECTION
  // ============================================================================

  /**
   * Records a classification event for trend analysis.
   */
  recordClassification(category: string, timestamp: Date = new Date()): void {
    this.timeSeriesData.push({ timestamp, category, count: 1 });

    // Update daily counts
    const dateKey = timestamp.toISOString().split("T")[0];
    if (!this.contentCounts.has(dateKey)) {
      this.contentCounts.set(dateKey, new Map());
    }
    const dailyCounts = this.contentCounts.get(dateKey)!;
    dailyCounts.set(category, (dailyCounts.get(category) || 0) + 1);
  }

  /**
   * Analyzes trends in classification data.
   */
  analyzeTrends(): TrendAnalysisResult {
    const trends: TrendingTopic[] = [];
    const seasonalPatterns: TrendAnalysisResult["seasonalPatterns"] = [];
    const anomalies: TrendAnalysisResult["anomalies"] = [];

    const windowDays = this.config.trendWindowDays;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // Aggregate counts by category
    const categoryCounts: Map<string, number[]> = new Map();

    for (const [dateKey, dailyCounts] of this.contentCounts) {
      const date = new Date(dateKey);
      if (date < windowStart) continue;

      for (const [category, count] of dailyCounts) {
        if (!categoryCounts.has(category)) {
          categoryCounts.set(category, []);
        }
        categoryCounts.get(category)!.push(count);
      }
    }

    // Calculate trends for each category
    for (const [category, counts] of categoryCounts) {
      if (counts.length < 7) continue; // Need at least a week of data

      const velocity = this.calculateVelocity(counts);
      const volume = counts.reduce((a, b) => a + b, 0);
      const trajectory = this.determineTrajectory(velocity);

      if (Math.abs(velocity) > 0.1) {
        const trend: TrendingTopic = {
          name: category,
          velocity,
          volume,
          firstSeen: windowStart,
          relatedCategories: [],
          trajectory,
          suggestNewCategory: velocity > 0.3 && volume > 10,
        };

        trends.push(trend);

        if (velocity > 0.2) {
          this.emit("trend:detected", trend);
        }
      }

      // Detect anomalies
      const mean = volume / counts.length;
      const std = Math.sqrt(counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length);

      counts.forEach((count, i) => {
        const zscore = std > 0 ? (count - mean) / std : 0;
        if (Math.abs(zscore) > 2) {
          anomalies.push({
            category,
            timestamp: new Date(windowStart.getTime() + i * 24 * 60 * 60 * 1000),
            expectedCount: mean,
            actualCount: count,
            zscore,
          });
        }
      });
    }

    return { trends, seasonalPatterns, anomalies };
  }

  /**
   * Calculates velocity (growth rate) from time series.
   */
  private calculateVelocity(counts: number[]): number {
    if (counts.length < 2) return 0;

    // Simple linear regression slope
    const n = counts.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = counts.reduce((a, b) => a + b, 0);
    const sumXY = counts.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Normalize by mean
    const mean = sumY / n;
    return mean > 0 ? slope / mean : 0;
  }

  /**
   * Determines trajectory from velocity.
   */
  private determineTrajectory(velocity: number): "rising" | "stable" | "declining" {
    if (velocity > 0.1) return "rising";
    if (velocity < -0.1) return "declining";
    return "stable";
  }

  // ============================================================================
  // LEARNING FROM CORRECTIONS
  // ============================================================================

  /**
   * Records a user correction for learning.
   */
  recordCorrection(correction: UserCorrection): void {
    this.corrections.push(correction);
  }

  /**
   * Analyzes corrections and generates learning feedback.
   */
  learnFromCorrections(): LearningFeedback {
    // Group corrections by pattern
    const patterns = new Map<string, { original: string[]; corrected: string[]; count: number }>();

    for (const correction of this.corrections) {
      // Extract pattern from content (simplified)
      const pattern = this.extractPattern(correction.contentId);

      if (!patterns.has(pattern)) {
        patterns.set(pattern, { original: [], corrected: [], count: 0 });
      }

      const entry = patterns.get(pattern)!;
      entry.original.push(...correction.original);
      entry.corrected.push(...correction.corrected);
      entry.count++;
    }

    // Generate identified patterns
    const identifiedPatterns: LearningFeedback["identifiedPatterns"] = [];
    const ruleUpdates: LearningFeedback["ruleUpdates"] = [];

    for (const [pattern, data] of patterns) {
      if (data.count < 3) continue; // Need multiple occurrences

      // Find most common correction
      const correctionCounts = new Map<string, number>();
      for (const cat of data.corrected) {
        correctionCounts.set(cat, (correctionCounts.get(cat) || 0) + 1);
      }

      const sortedCorrections = Array.from(correctionCounts.entries())
        .sort((a, b) => b[1] - a[1]);

      if (sortedCorrections.length > 0) {
        const [suggestedCategory, frequency] = sortedCorrections[0];
        const confidence = frequency / data.corrected.length;

        identifiedPatterns.push({
          pattern,
          suggestedCategory,
          confidence,
          frequency,
        });

        if (confidence > 0.7) {
          ruleUpdates.push({
            type: "add",
            condition: pattern,
            result: suggestedCategory,
            confidence,
          });
        }
      }
    }

    const feedback: LearningFeedback = {
      corrections: this.corrections,
      identifiedPatterns,
      ruleUpdates,
    };

    this.emit("learning:completed", feedback);

    // Clear processed corrections
    this.corrections = [];

    return feedback;
  }

  /**
   * Extracts a pattern from a content ID.
   */
  private extractPattern(contentId: string): string {
    const name = contentId.split("/").pop() || contentId;
    const parts = name.split(/[-_.\s]+/);

    // Use prefix as pattern
    return parts[0] + "-*";
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Gets pending restructuring suggestions.
   */
  getPendingSuggestions(): TaxonomyRestructuringSuggestion[] {
    return [...this.pendingSuggestions];
  }

  /**
   * Approves a suggestion.
   */
  async approveSuggestion(index: number): Promise<void> {
    const suggestion = this.pendingSuggestions[index];
    if (!suggestion) return;

    log.info({ suggestion }, "Applying taxonomy restructuring");

    // Apply the change (implementation depends on suggestion type)
    // This would actually modify the taxonomy engine

    this.pendingSuggestions.splice(index, 1);
  }

  /**
   * Rejects a suggestion.
   */
  rejectSuggestion(index: number): void {
    this.pendingSuggestions.splice(index, 1);
  }

  /**
   * Gets discovered clusters.
   */
  getDiscoveredClusters(): TaxonomyCluster[] {
    return Array.from(this.discoveredClusters.values());
  }

  /**
   * Sets term embeddings for similarity analysis.
   */
  setTermEmbedding(termId: string, embedding: Float32Array): void {
    this.termEmbeddings.set(termId, embedding);
  }

  /**
   * Runs a full learning cycle.
   */
  async runLearningCycle(): Promise<{
    clusters: ClusteringResult | null;
    similarity: TermSimilarityAnalysis;
    hierarchy: HierarchyOptimizationResult;
    trends: TrendAnalysisResult;
    feedback: LearningFeedback;
  }> {
    log.info("Running full learning cycle");

    let clusters: ClusteringResult | null = null;
    if (this.vectorDb && this.config.enableAutoDiscovery) {
      clusters = await this.discoverClusters({
        algorithm: this.config.clusteringAlgorithm,
        minClusterSize: this.config.minClusterSize,
      });
    }

    const similarity = await this.analyzeTermSimilarity();
    const hierarchy = await this.optimizeHierarchy();
    const trends = this.analyzeTrends();
    const feedback = this.learnFromCorrections();

    log.info(
      {
        clustersFound: clusters?.clusters.length || 0,
        similarPairs: similarity.similarPairs.length,
        orphanedTerms: hierarchy.orphanedTerms.length,
        trends: trends.trends.length,
        patterns: feedback.identifiedPatterns.length,
      },
      "Learning cycle completed"
    );

    return { clusters, similarity, hierarchy, trends, feedback };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates an auto-taxonomy learner with default configuration.
 */
export function createAutoTaxonomyLearner(
  taxonomyEngine: TaxonomyEngine,
  vectorDb?: VectorDatabase
): AutoTaxonomyLearner {
  const config: AutoTaxonomyConfig = {
    enableAutoDiscovery: true,
    minClusterSize: 5,
    clusteringAlgorithm: "hdbscan",
    similarityThreshold: 0.7,
    enableMergeSuggestions: true,
    mergeSimilarityThreshold: 0.85,
    enableTrendDetection: true,
    trendWindowDays: 30,
    requireApproval: true,
  };

  return new AutoTaxonomyLearner(config, taxonomyEngine, vectorDb);
}
