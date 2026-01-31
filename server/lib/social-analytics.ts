/**
 * @file social-analytics.ts
 * @description Social Graph and Analytics Models for RSES CMS
 *              Implements graph-theoretic social network analysis, time-series analytics,
 *              cross-platform metrics, and predictive engagement models.
 *
 * @phase Phase 9+ - Social Analytics System
 * @author SGT (Set-Graph Theorist Agent)
 * @created 2026-02-01
 * @version 1.0
 *
 * Theoretical Foundations:
 * ========================
 * - Neo4j-inspired graph analytics (PageRank, community detection, influence propagation)
 * - TimescaleDB-inspired time-series with continuous aggregates
 * - Apache Druid-style real-time OLAP cubes
 * - Mixpanel/Amplitude event analytics patterns
 */

import { Term, Vocabulary, ContentTermGraph } from './taxonomy-algebra';

// =============================================================================
// SECTION 1: SOCIAL GRAPH MODEL
// =============================================================================

/**
 * User node in the social graph.
 * Represents a content creator, consumer, or both.
 */
export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  lastActiveAt: Date;

  /** Profile metadata */
  profile: {
    bio?: string;
    avatarUrl?: string;
    location?: string;
    website?: string;
    interests: string[];
  };

  /** Computed metrics */
  metrics: UserMetrics;

  /** Influence scores */
  influence: InfluenceScores;

  /** Community memberships */
  communityIds: string[];

  /** Feature vector for ML */
  embedding?: number[];
}

/**
 * User engagement metrics.
 */
export interface UserMetrics {
  /** Total content created */
  contentCount: number;
  /** Total followers */
  followerCount: number;
  /** Total following */
  followingCount: number;
  /** Total likes received */
  likesReceived: number;
  /** Total shares received */
  sharesReceived: number;
  /** Total comments received */
  commentsReceived: number;
  /** Average engagement rate */
  engagementRate: number;
  /** Activity score (0-100) */
  activityScore: number;
}

/**
 * Influence scores computed via graph algorithms.
 */
export interface InfluenceScores {
  /** PageRank score */
  pageRank: number;
  /** Betweenness centrality */
  betweenness: number;
  /** Closeness centrality */
  closeness: number;
  /** Eigenvector centrality */
  eigenvector: number;
  /** Authority score (HITS) */
  authority: number;
  /** Hub score (HITS) */
  hub: number;
  /** Katz centrality */
  katz: number;
  /** Composite influence score */
  composite: number;
}

/**
 * Edge types in the social graph.
 */
export type SocialEdgeType =
  | 'follows'
  | 'likes'
  | 'shares'
  | 'comments'
  | 'mentions'
  | 'collaborates'
  | 'blocks'
  | 'recommends';

/**
 * Social graph edge connecting users or users to content.
 */
export interface SocialEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: SocialEdgeType;
  weight: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Content node in the social/content graph.
 */
export interface SocialContent {
  id: string;
  authorId: string;
  title: string;
  type: 'post' | 'article' | 'project' | 'comment' | 'share';
  createdAt: Date;
  updatedAt: Date;

  /** Classification from RSES */
  classification: {
    sets: string[];
    topics: string[];
    types: string[];
  };

  /** Engagement metrics */
  engagement: ContentEngagement;

  /** Viral potential score */
  viralScore: number;

  /** Platform sources */
  platforms: PlatformSource[];
}

/**
 * Content engagement metrics.
 */
export interface ContentEngagement {
  views: number;
  uniqueViews: number;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  clicks: number;
  impressions: number;
  reach: number;
  engagementRate: number;
  virality: number;
}

/**
 * Platform source for cross-platform content.
 */
export interface PlatformSource {
  platform: string;
  externalId: string;
  url: string;
  publishedAt: Date;
  metrics: Record<string, number>;
}

/**
 * Community detected via graph clustering.
 */
export interface Community {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  coreMembers: string[];
  createdAt: Date;

  /** Detection algorithm used */
  algorithm: 'louvain' | 'label_propagation' | 'girvan_newman' | 'spectral';

  /** Modularity score */
  modularity: number;

  /** Cohesion metrics */
  cohesion: {
    density: number;
    clustering: number;
    conductance: number;
  };

  /** Topics associated with community */
  topics: string[];

  /** Growth metrics */
  growth: {
    rate: number;
    trend: 'growing' | 'stable' | 'declining';
  };
}

// =============================================================================
// SECTION 2: SOCIAL GRAPH IMPLEMENTATION
// =============================================================================

/**
 * Social graph implementation with Neo4j-inspired analytics.
 */
export class SocialGraph {
  private users: Map<string, SocialUser> = new Map();
  private content: Map<string, SocialContent> = new Map();
  private edges: Map<string, SocialEdge> = new Map();

  /** Adjacency lists for efficient traversal */
  private outEdges: Map<string, Set<string>> = new Map();
  private inEdges: Map<string, Set<string>> = new Map();

  /** Edge type indexes */
  private edgesByType: Map<SocialEdgeType, Set<string>> = new Map();

  /** Community detection results */
  private communities: Map<string, Community> = new Map();

  // -------------------------------------------------------------------------
  // Node Operations
  // -------------------------------------------------------------------------

  addUser(user: SocialUser): void {
    this.users.set(user.id, user);
    this.outEdges.set(user.id, new Set());
    this.inEdges.set(user.id, new Set());
  }

  addContent(content: SocialContent): void {
    this.content.set(content.id, content);
  }

  getUser(id: string): SocialUser | undefined {
    return this.users.get(id);
  }

  getContent(id: string): SocialContent | undefined {
    return this.content.get(id);
  }

  // -------------------------------------------------------------------------
  // Edge Operations
  // -------------------------------------------------------------------------

  addEdge(edge: SocialEdge): void {
    this.edges.set(edge.id, edge);

    // Update adjacency lists
    if (!this.outEdges.has(edge.sourceId)) {
      this.outEdges.set(edge.sourceId, new Set());
    }
    this.outEdges.get(edge.sourceId)!.add(edge.id);

    if (!this.inEdges.has(edge.targetId)) {
      this.inEdges.set(edge.targetId, new Set());
    }
    this.inEdges.get(edge.targetId)!.add(edge.id);

    // Update type index
    if (!this.edgesByType.has(edge.type)) {
      this.edgesByType.set(edge.type, new Set());
    }
    this.edgesByType.get(edge.type)!.add(edge.id);
  }

  getOutEdges(nodeId: string): SocialEdge[] {
    const edgeIds = this.outEdges.get(nodeId) || new Set();
    return [...edgeIds].map(id => this.edges.get(id)!).filter(Boolean);
  }

  getInEdges(nodeId: string): SocialEdge[] {
    const edgeIds = this.inEdges.get(nodeId) || new Set();
    return [...edgeIds].map(id => this.edges.get(id)!).filter(Boolean);
  }

  getEdgesByType(type: SocialEdgeType): SocialEdge[] {
    const edgeIds = this.edgesByType.get(type) || new Set();
    return [...edgeIds].map(id => this.edges.get(id)!).filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // Graph Algorithms
  // -------------------------------------------------------------------------

  /**
   * Computes PageRank for all users.
   * PR(u) = (1-d)/N + d * sum(PR(v)/out_degree(v)) for all v linking to u
   */
  computePageRank(dampingFactor: number = 0.85, iterations: number = 100): Map<string, number> {
    const n = this.users.size;
    const ranks = new Map<string, number>();

    // Initialize
    for (const [id] of this.users) {
      ranks.set(id, 1 / n);
    }

    // Iterate
    for (let iter = 0; iter < iterations; iter++) {
      const newRanks = new Map<string, number>();

      for (const [id] of this.users) {
        let rank = (1 - dampingFactor) / n;

        const inEdges = this.getInEdges(id).filter(e => e.type === 'follows');
        for (const edge of inEdges) {
          const sourceRank = ranks.get(edge.sourceId) || 0;
          const sourceOutDegree = this.getOutEdges(edge.sourceId)
            .filter(e => e.type === 'follows').length || 1;
          rank += dampingFactor * sourceRank / sourceOutDegree;
        }

        newRanks.set(id, rank);
      }

      for (const [id, rank] of newRanks) {
        ranks.set(id, rank);
      }
    }

    // Update user influence scores
    for (const [id, rank] of ranks) {
      const user = this.users.get(id);
      if (user) {
        user.influence.pageRank = rank;
      }
    }

    return ranks;
  }

  /**
   * Computes betweenness centrality.
   * Measures how often a node lies on shortest paths.
   */
  computeBetweenness(): Map<string, number> {
    const betweenness = new Map<string, number>();
    const userIds = [...this.users.keys()];

    // Initialize
    for (const id of userIds) {
      betweenness.set(id, 0);
    }

    // Brandes algorithm (simplified)
    for (const source of userIds) {
      const stack: string[] = [];
      const predecessors = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const distance = new Map<string, number>();
      const delta = new Map<string, number>();

      for (const id of userIds) {
        predecessors.set(id, []);
        sigma.set(id, 0);
        distance.set(id, -1);
        delta.set(id, 0);
      }

      sigma.set(source, 1);
      distance.set(source, 0);

      const queue: string[] = [source];

      // BFS
      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);

        const neighbors = this.getOutEdges(v)
          .filter(e => e.type === 'follows')
          .map(e => e.targetId);

        for (const w of neighbors) {
          if (distance.get(w) === -1) {
            distance.set(w, distance.get(v)! + 1);
            queue.push(w);
          }

          if (distance.get(w) === distance.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!);
            predecessors.get(w)!.push(v);
          }
        }
      }

      // Accumulation
      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of predecessors.get(w)!) {
          const contribution = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
          delta.set(v, delta.get(v)! + contribution);
        }
        if (w !== source) {
          betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
        }
      }
    }

    // Normalize
    const n = userIds.length;
    const normFactor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;

    for (const [id, value] of betweenness) {
      const normalized = value * normFactor;
      betweenness.set(id, normalized);

      const user = this.users.get(id);
      if (user) {
        user.influence.betweenness = normalized;
      }
    }

    return betweenness;
  }

  /**
   * Community detection using Louvain algorithm (simplified).
   * Maximizes modularity through iterative community merging.
   */
  detectCommunities(): Community[] {
    const userIds = [...this.users.keys()];
    const communityOf = new Map<string, string>();

    // Phase 1: Initialize each node as its own community
    for (const id of userIds) {
      communityOf.set(id, id);
    }

    // Calculate total edge weight
    let totalWeight = 0;
    for (const [, edge] of this.edges) {
      if (edge.type === 'follows') {
        totalWeight += edge.weight;
      }
    }

    // Phase 2: Local moving
    let improved = true;
    let iterations = 0;
    const maxIterations = 100;

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      for (const nodeId of userIds) {
        const currentCommunity = communityOf.get(nodeId)!;
        const neighbors = this.getOutEdges(nodeId)
          .filter(e => e.type === 'follows')
          .map(e => e.targetId);

        // Find neighboring communities
        const neighborCommunities = new Set<string>();
        for (const neighbor of neighbors) {
          neighborCommunities.add(communityOf.get(neighbor)!);
        }

        // Calculate modularity gain for moving to each neighbor community
        let bestCommunity = currentCommunity;
        let bestGain = 0;

        for (const community of neighborCommunities) {
          if (community === currentCommunity) continue;

          const gain = this.calculateModularityGain(
            nodeId, community, communityOf, totalWeight
          );

          if (gain > bestGain) {
            bestGain = gain;
            bestCommunity = community;
          }
        }

        if (bestCommunity !== currentCommunity) {
          communityOf.set(nodeId, bestCommunity);
          improved = true;
        }
      }
    }

    // Build community objects
    const communityMembers = new Map<string, string[]>();
    for (const [nodeId, communityId] of communityOf) {
      if (!communityMembers.has(communityId)) {
        communityMembers.set(communityId, []);
      }
      communityMembers.get(communityId)!.push(nodeId);
    }

    const communities: Community[] = [];
    let communityIndex = 0;

    for (const [communityId, members] of communityMembers) {
      if (members.length < 2) continue;

      const community: Community = {
        id: `community-${communityIndex++}`,
        name: `Community ${communityIndex}`,
        memberIds: members,
        coreMembers: this.findCoreMembers(members),
        createdAt: new Date(),
        algorithm: 'louvain',
        modularity: this.calculateCommunityModularity(members, totalWeight),
        cohesion: this.calculateCohesion(members),
        topics: this.extractCommunityTopics(members),
        growth: { rate: 0, trend: 'stable' },
      };

      communities.push(community);
      this.communities.set(community.id, community);

      // Update user community memberships
      for (const memberId of members) {
        const user = this.users.get(memberId);
        if (user) {
          user.communityIds.push(community.id);
        }
      }
    }

    return communities;
  }

  private calculateModularityGain(
    nodeId: string,
    targetCommunity: string,
    communityOf: Map<string, string>,
    totalWeight: number
  ): number {
    // Simplified modularity gain calculation
    let ki = 0;
    let kiIn = 0;
    let sumTot = 0;

    const nodeEdges = this.getOutEdges(nodeId).filter(e => e.type === 'follows');
    ki = nodeEdges.reduce((sum, e) => sum + e.weight, 0);

    for (const edge of nodeEdges) {
      if (communityOf.get(edge.targetId) === targetCommunity) {
        kiIn += edge.weight;
      }
    }

    // Sum of weights in target community
    for (const [otherId, community] of communityOf) {
      if (community === targetCommunity) {
        const otherEdges = this.getOutEdges(otherId).filter(e => e.type === 'follows');
        sumTot += otherEdges.reduce((sum, e) => sum + e.weight, 0);
      }
    }

    const m2 = 2 * totalWeight;
    return (kiIn - sumTot * ki / m2) / m2;
  }

  private calculateCommunityModularity(members: string[], totalWeight: number): number {
    if (totalWeight === 0) return 0;

    let internalEdges = 0;
    let totalDegree = 0;

    const memberSet = new Set(members);

    for (const memberId of members) {
      const edges = this.getOutEdges(memberId).filter(e => e.type === 'follows');
      totalDegree += edges.length;

      for (const edge of edges) {
        if (memberSet.has(edge.targetId)) {
          internalEdges += edge.weight;
        }
      }
    }

    const m2 = 2 * totalWeight;
    return (internalEdges / m2) - Math.pow(totalDegree / m2, 2);
  }

  private calculateCohesion(members: string[]): { density: number; clustering: number; conductance: number } {
    const memberSet = new Set(members);
    const n = members.length;

    if (n < 2) {
      return { density: 1, clustering: 1, conductance: 0 };
    }

    let internalEdges = 0;
    let externalEdges = 0;

    for (const memberId of members) {
      const edges = this.getOutEdges(memberId).filter(e => e.type === 'follows');
      for (const edge of edges) {
        if (memberSet.has(edge.targetId)) {
          internalEdges++;
        } else {
          externalEdges++;
        }
      }
    }

    const maxEdges = n * (n - 1);
    const density = maxEdges > 0 ? internalEdges / maxEdges : 0;
    const conductance = (internalEdges + externalEdges) > 0
      ? externalEdges / (internalEdges + externalEdges)
      : 0;

    return {
      density,
      clustering: density, // Simplified
      conductance,
    };
  }

  private findCoreMembers(members: string[]): string[] {
    // Core members are those with highest degree within community
    const memberSet = new Set(members);
    const degrees = new Map<string, number>();

    for (const memberId of members) {
      let degree = 0;
      const edges = [...this.getOutEdges(memberId), ...this.getInEdges(memberId)]
        .filter(e => e.type === 'follows');

      for (const edge of edges) {
        if (memberSet.has(edge.sourceId) && memberSet.has(edge.targetId)) {
          degree++;
        }
      }
      degrees.set(memberId, degree);
    }

    const sorted = [...degrees.entries()].sort((a, b) => b[1] - a[1]);
    const topCount = Math.ceil(members.length * 0.2);
    return sorted.slice(0, topCount).map(([id]) => id);
  }

  private extractCommunityTopics(members: string[]): string[] {
    const topicCounts = new Map<string, number>();

    for (const memberId of members) {
      const user = this.users.get(memberId);
      if (user?.profile.interests) {
        for (const interest of user.profile.interests) {
          topicCounts.set(interest, (topicCounts.get(interest) || 0) + 1);
        }
      }
    }

    return [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  // -------------------------------------------------------------------------
  // Influence Propagation
  // -------------------------------------------------------------------------

  /**
   * Simulates influence propagation using Independent Cascade model.
   * Returns set of influenced nodes.
   */
  simulateInfluenceCascade(
    seedNodes: string[],
    propagationProbability: number = 0.1,
    maxSteps: number = 10
  ): Set<string> {
    const influenced = new Set<string>(seedNodes);
    let frontier = new Set<string>(seedNodes);

    for (let step = 0; step < maxSteps; step++) {
      const newFrontier = new Set<string>();

      for (const nodeId of frontier) {
        const edges = this.getOutEdges(nodeId).filter(e => e.type === 'follows');

        for (const edge of edges) {
          if (!influenced.has(edge.targetId)) {
            const prob = propagationProbability * edge.weight;
            if (Math.random() < prob) {
              influenced.add(edge.targetId);
              newFrontier.add(edge.targetId);
            }
          }
        }
      }

      if (newFrontier.size === 0) break;
      frontier = newFrontier;
    }

    return influenced;
  }

  /**
   * Finds optimal seed nodes for maximizing influence spread.
   * Uses greedy algorithm with lazy evaluation.
   */
  findInfluenceMaximizers(
    k: number,
    simulations: number = 100
  ): string[] {
    const seeds: string[] = [];
    const userIds = [...this.users.keys()];

    for (let i = 0; i < k; i++) {
      let bestNode = '';
      let bestSpread = 0;

      for (const nodeId of userIds) {
        if (seeds.includes(nodeId)) continue;

        const candidateSeeds = [...seeds, nodeId];
        let totalSpread = 0;

        for (let sim = 0; sim < simulations; sim++) {
          const influenced = this.simulateInfluenceCascade(candidateSeeds);
          totalSpread += influenced.size;
        }

        const avgSpread = totalSpread / simulations;
        if (avgSpread > bestSpread) {
          bestSpread = avgSpread;
          bestNode = nodeId;
        }
      }

      if (bestNode) {
        seeds.push(bestNode);
      }
    }

    return seeds;
  }

  // -------------------------------------------------------------------------
  // Recommendation Engine
  // -------------------------------------------------------------------------

  /**
   * Recommends users to follow using collaborative filtering.
   */
  recommendUsers(userId: string, limit: number = 10): { userId: string; score: number }[] {
    const user = this.users.get(userId);
    if (!user) return [];

    const following = new Set(
      this.getOutEdges(userId)
        .filter(e => e.type === 'follows')
        .map(e => e.targetId)
    );

    const scores = new Map<string, number>();

    // Find users followed by users I follow (friends of friends)
    for (const followedId of following) {
      const friendsFollowing = this.getOutEdges(followedId)
        .filter(e => e.type === 'follows')
        .map(e => e.targetId);

      for (const candidateId of friendsFollowing) {
        if (candidateId === userId || following.has(candidateId)) continue;

        scores.set(candidateId, (scores.get(candidateId) || 0) + 1);
      }
    }

    // Boost by influence score
    for (const [candidateId, score] of scores) {
      const candidate = this.users.get(candidateId);
      if (candidate) {
        const boosted = score * (1 + candidate.influence.pageRank * 10);
        scores.set(candidateId, boosted);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([userId, score]) => ({ userId, score }));
  }

  /**
   * Recommends content using content-based and collaborative filtering.
   */
  recommendContent(userId: string, limit: number = 10): { contentId: string; score: number }[] {
    const user = this.users.get(userId);
    if (!user) return [];

    const scores = new Map<string, number>();

    // Get content from users I follow
    const following = this.getOutEdges(userId)
      .filter(e => e.type === 'follows')
      .map(e => e.targetId);

    for (const followedId of following) {
      for (const [contentId, content] of this.content) {
        if (content.authorId === followedId) {
          const recency = Math.exp(
            -(Date.now() - content.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)
          );
          const engagement = Math.log(1 + content.engagement.engagementRate);
          scores.set(contentId, (scores.get(contentId) || 0) + recency * engagement);
        }
      }
    }

    // Boost by topic match
    for (const [contentId, score] of scores) {
      const content = this.content.get(contentId);
      if (content && user.profile.interests) {
        const topicMatch = content.classification.topics.filter(
          t => user.profile.interests.includes(t)
        ).length;
        scores.set(contentId, score * (1 + topicMatch * 0.5));
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([contentId, score]) => ({ contentId, score }));
  }
}

// =============================================================================
// SECTION 3: TIME-SERIES ANALYTICS (TimescaleDB-inspired)
// =============================================================================

/**
 * Time granularity for aggregations.
 */
export type TimeGranularity = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Time-series data point.
 */
export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, unknown>;
}

/**
 * Metric definition for analytics.
 */
export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  unit: string;
  aggregations: AggregationType[];
  retentionDays: number;
}

/**
 * Aggregation types for metrics.
 */
export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p90' | 'p95' | 'p99';

/**
 * Aggregated metric bucket.
 */
export interface MetricBucket {
  metricId: string;
  timestamp: Date;
  granularity: TimeGranularity;
  dimensions: Record<string, string>;
  aggregations: Record<AggregationType, number>;
  sampleCount: number;
}

/**
 * Real-time counter with atomic operations.
 */
export interface RealTimeCounter {
  id: string;
  name: string;
  value: number;
  lastUpdated: Date;
  window: {
    duration: number;
    values: { timestamp: Date; delta: number }[];
  };
}

/**
 * Continuous aggregate definition (TimescaleDB-style).
 */
export interface ContinuousAggregate {
  id: string;
  name: string;
  sourceMetric: string;
  granularity: TimeGranularity;
  aggregations: AggregationType[];
  dimensions: string[];
  refreshInterval: number;
  lastRefresh: Date;
}

/**
 * Time-series analytics engine.
 */
export class TimeSeriesAnalytics {
  private metrics: Map<string, MetricDefinition> = new Map();
  private rawData: Map<string, TimeSeriesPoint[]> = new Map();
  private buckets: Map<string, MetricBucket[]> = new Map();
  private counters: Map<string, RealTimeCounter> = new Map();
  private aggregates: Map<string, ContinuousAggregate> = new Map();

  // -------------------------------------------------------------------------
  // Metric Management
  // -------------------------------------------------------------------------

  registerMetric(metric: MetricDefinition): void {
    this.metrics.set(metric.id, metric);
    this.rawData.set(metric.id, []);
    this.buckets.set(metric.id, []);
  }

  recordValue(metricId: string, value: number, timestamp: Date = new Date(), dimensions?: Record<string, string>): void {
    const data = this.rawData.get(metricId);
    if (!data) return;

    data.push({ timestamp, value, metadata: dimensions });

    // Update real-time counter if exists
    const counter = this.counters.get(metricId);
    if (counter) {
      counter.value += value;
      counter.lastUpdated = timestamp;
      counter.window.values.push({ timestamp, delta: value });

      // Prune old window values
      const cutoff = new Date(timestamp.getTime() - counter.window.duration);
      counter.window.values = counter.window.values.filter(v => v.timestamp >= cutoff);
    }
  }

  // -------------------------------------------------------------------------
  // Aggregation Pipeline
  // -------------------------------------------------------------------------

  /**
   * Aggregates raw data into time buckets.
   */
  aggregate(
    metricId: string,
    granularity: TimeGranularity,
    startTime: Date,
    endTime: Date,
    dimensions?: string[]
  ): MetricBucket[] {
    const data = this.rawData.get(metricId);
    const metric = this.metrics.get(metricId);
    if (!data || !metric) return [];

    const filtered = data.filter(
      p => p.timestamp >= startTime && p.timestamp <= endTime
    );

    // Group by time bucket and dimensions
    const groups = new Map<string, TimeSeriesPoint[]>();

    for (const point of filtered) {
      const bucketTime = this.truncateToGranularity(point.timestamp, granularity);
      const dimKey = dimensions
        ? dimensions.map(d => point.metadata?.[d] || '').join('|')
        : '';
      const key = `${bucketTime.getTime()}|${dimKey}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(point);
    }

    // Compute aggregations for each group
    const buckets: MetricBucket[] = [];

    for (const [key, points] of groups) {
      const [timeStr, dimStr] = key.split('|');
      const timestamp = new Date(parseInt(timeStr, 10));

      const dimValues: Record<string, string> = {};
      if (dimensions && dimStr) {
        const parts = dimStr.split('|');
        dimensions.forEach((d, i) => {
          dimValues[d] = parts[i] || '';
        });
      }

      const values = points.map(p => p.value).sort((a, b) => a - b);
      const aggregations: Record<AggregationType, number> = {
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
        p50: this.percentile(values, 50),
        p90: this.percentile(values, 90),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99),
      };

      buckets.push({
        metricId,
        timestamp,
        granularity,
        dimensions: dimValues,
        aggregations,
        sampleCount: values.length,
      });
    }

    return buckets.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private truncateToGranularity(date: Date, granularity: TimeGranularity): Date {
    const d = new Date(date);

    switch (granularity) {
      case 'minute':
        d.setSeconds(0, 0);
        break;
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(d.getMonth() / 3);
        d.setMonth(quarter * 3, 1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'year':
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        break;
    }

    return d;
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  // -------------------------------------------------------------------------
  // Real-Time Counters
  // -------------------------------------------------------------------------

  createCounter(id: string, name: string, windowDuration: number = 60000): void {
    this.counters.set(id, {
      id,
      name,
      value: 0,
      lastUpdated: new Date(),
      window: {
        duration: windowDuration,
        values: [],
      },
    });
  }

  incrementCounter(id: string, delta: number = 1): void {
    const counter = this.counters.get(id);
    if (counter) {
      counter.value += delta;
      counter.lastUpdated = new Date();
      counter.window.values.push({ timestamp: new Date(), delta });
    }
  }

  getCounterRate(id: string): number {
    const counter = this.counters.get(id);
    if (!counter || counter.window.values.length === 0) return 0;

    const windowSum = counter.window.values.reduce((sum, v) => sum + v.delta, 0);
    const durationSeconds = counter.window.duration / 1000;
    return windowSum / durationSeconds;
  }

  // -------------------------------------------------------------------------
  // Historical Comparisons
  // -------------------------------------------------------------------------

  /**
   * Compares current period to previous period.
   */
  comparePeriodsOverPeriod(
    metricId: string,
    currentStart: Date,
    currentEnd: Date,
    previousStart: Date,
    previousEnd: Date,
    granularity: TimeGranularity
  ): {
    current: MetricBucket[];
    previous: MetricBucket[];
    changes: { aggregation: AggregationType; change: number; percentChange: number }[];
  } {
    const current = this.aggregate(metricId, granularity, currentStart, currentEnd);
    const previous = this.aggregate(metricId, granularity, previousStart, previousEnd);

    const currentTotals = this.sumAggregations(current);
    const previousTotals = this.sumAggregations(previous);

    const changes: { aggregation: AggregationType; change: number; percentChange: number }[] = [];

    for (const agg of ['sum', 'avg', 'count'] as AggregationType[]) {
      const currVal = currentTotals[agg] || 0;
      const prevVal = previousTotals[agg] || 0;
      const change = currVal - prevVal;
      const percentChange = prevVal !== 0 ? (change / prevVal) * 100 : 0;

      changes.push({ aggregation: agg, change, percentChange });
    }

    return { current, previous, changes };
  }

  private sumAggregations(buckets: MetricBucket[]): Record<AggregationType, number> {
    const totals: Record<AggregationType, number> = {
      sum: 0, avg: 0, min: Infinity, max: -Infinity, count: 0,
      p50: 0, p90: 0, p95: 0, p99: 0,
    };

    for (const bucket of buckets) {
      totals.sum += bucket.aggregations.sum;
      totals.count += bucket.aggregations.count;
      totals.min = Math.min(totals.min, bucket.aggregations.min);
      totals.max = Math.max(totals.max, bucket.aggregations.max);
    }

    totals.avg = totals.count > 0 ? totals.sum / totals.count : 0;

    return totals;
  }

  // -------------------------------------------------------------------------
  // Trend Detection
  // -------------------------------------------------------------------------

  /**
   * Detects trends using linear regression.
   */
  detectTrend(metricId: string, granularity: TimeGranularity, lookbackDays: number): {
    slope: number;
    intercept: number;
    rSquared: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    forecast: TimeSeriesPoint[];
  } {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const buckets = this.aggregate(metricId, granularity, startTime, endTime);

    if (buckets.length < 2) {
      return {
        slope: 0,
        intercept: 0,
        rSquared: 0,
        trend: 'stable',
        forecast: [],
      };
    }

    // Linear regression
    const points = buckets.map((b, i) => ({ x: i, y: b.aggregations.sum }));
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const yMean = sumY / n;
    const ssTotal = points.reduce((s, p) => s + Math.pow(p.y - yMean, 2), 0);
    const ssResidual = points.reduce((s, p) => s + Math.pow(p.y - (intercept + slope * p.x), 2), 0);
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    // Trend classification
    const slopeThreshold = yMean * 0.01;
    const trend: 'increasing' | 'decreasing' | 'stable' =
      slope > slopeThreshold ? 'increasing' :
      slope < -slopeThreshold ? 'decreasing' : 'stable';

    // Forecast next 7 points
    const forecast: TimeSeriesPoint[] = [];
    const lastBucket = buckets[buckets.length - 1];
    const intervalMs = this.granularityToMs(granularity);

    for (let i = 1; i <= 7; i++) {
      const x = n + i - 1;
      const y = intercept + slope * x;
      forecast.push({
        timestamp: new Date(lastBucket.timestamp.getTime() + i * intervalMs),
        value: Math.max(0, y),
      });
    }

    return { slope, intercept, rSquared, trend, forecast };
  }

  private granularityToMs(granularity: TimeGranularity): number {
    switch (granularity) {
      case 'minute': return 60 * 1000;
      case 'hour': return 60 * 60 * 1000;
      case 'day': return 24 * 60 * 60 * 1000;
      case 'week': return 7 * 24 * 60 * 60 * 1000;
      case 'month': return 30 * 24 * 60 * 60 * 1000;
      case 'quarter': return 90 * 24 * 60 * 60 * 1000;
      case 'year': return 365 * 24 * 60 * 60 * 1000;
    }
  }
}

// =============================================================================
// SECTION 4: CROSS-PLATFORM ANALYTICS
// =============================================================================

/**
 * Supported social platforms.
 */
export type SocialPlatform =
  | 'twitter' | 'facebook' | 'instagram' | 'linkedin'
  | 'youtube' | 'tiktok' | 'reddit' | 'pinterest'
  | 'mastodon' | 'bluesky' | 'threads' | 'internal';

/**
 * Unified metric schema across platforms.
 */
export interface UnifiedMetric {
  id: string;
  contentId: string;
  platform: SocialPlatform;
  timestamp: Date;

  /** Normalized engagement metrics */
  engagement: {
    impressions: number;
    reach: number;
    clicks: number;
    likes: number;
    shares: number;
    comments: number;
    saves: number;
    videoViews?: number;
    watchTime?: number;
  };

  /** Platform-specific raw metrics */
  raw: Record<string, number>;

  /** Normalized scores (0-100) */
  scores: {
    engagement: number;
    virality: number;
    sentiment: number;
    relevance: number;
  };
}

/**
 * Platform metric mapping for normalization.
 */
export interface PlatformMapping {
  platform: SocialPlatform;
  metricMappings: {
    impressions: string[];
    reach: string[];
    clicks: string[];
    likes: string[];
    shares: string[];
    comments: string[];
    saves: string[];
    videoViews: string[];
    watchTime: string[];
  };
  engagementWeights: Record<string, number>;
}

/**
 * Attribution model for conversion tracking.
 */
export interface AttributionModel {
  id: string;
  name: string;
  type: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'position_based' | 'data_driven';
  lookbackWindow: number;
  touchpoints: AttributionTouchpoint[];
}

/**
 * Attribution touchpoint in conversion path.
 */
export interface AttributionTouchpoint {
  id: string;
  platform: SocialPlatform;
  contentId: string;
  timestamp: Date;
  channel: string;
  campaign?: string;
  credit: number;
}

/**
 * Funnel stage definition.
 */
export interface FunnelStage {
  id: string;
  name: string;
  description: string;
  eventName: string;
  order: number;
}

/**
 * Funnel analysis result.
 */
export interface FunnelAnalysis {
  funnelId: string;
  stages: FunnelStage[];
  metrics: {
    stage: string;
    entered: number;
    completed: number;
    dropoff: number;
    conversionRate: number;
    avgTimeToNext: number;
  }[];
  overallConversion: number;
  bottleneck: string;
}

/**
 * Cohort definition for analysis.
 */
export interface Cohort {
  id: string;
  name: string;
  createdAt: Date;
  criteria: {
    type: 'first_action' | 'property' | 'behavior';
    property?: string;
    value?: unknown;
    dateRange?: { start: Date; end: Date };
  };
  memberIds: string[];
  size: number;
}

/**
 * Cohort analysis result.
 */
export interface CohortAnalysis {
  cohort: Cohort;
  metric: string;
  granularity: TimeGranularity;
  periods: {
    period: number;
    value: number;
    retention?: number;
    cumulative?: number;
  }[];
  summary: {
    avgRetention: number;
    churnRate: number;
    lifetimeValue: number;
  };
}

/**
 * Cross-platform analytics engine.
 */
export class CrossPlatformAnalytics {
  private platformMappings: Map<SocialPlatform, PlatformMapping> = new Map();
  private unifiedMetrics: Map<string, UnifiedMetric[]> = new Map();
  private attributionModels: Map<string, AttributionModel> = new Map();
  private funnels: Map<string, FunnelStage[]> = new Map();
  private cohorts: Map<string, Cohort> = new Map();
  private events: { userId: string; event: string; timestamp: Date; properties: Record<string, unknown> }[] = [];

  constructor() {
    this.initializePlatformMappings();
  }

  private initializePlatformMappings(): void {
    // Twitter mapping
    this.platformMappings.set('twitter', {
      platform: 'twitter',
      metricMappings: {
        impressions: ['impressions', 'impression_count'],
        reach: ['reach'],
        clicks: ['url_clicks', 'link_clicks', 'profile_clicks'],
        likes: ['likes', 'favorite_count'],
        shares: ['retweets', 'retweet_count', 'quotes'],
        comments: ['replies', 'reply_count'],
        saves: ['bookmarks'],
        videoViews: ['video_views'],
        watchTime: ['video_watch_time'],
      },
      engagementWeights: { likes: 1, retweets: 2, replies: 3, quotes: 2.5 },
    });

    // Add more platform mappings...
    this.platformMappings.set('instagram', {
      platform: 'instagram',
      metricMappings: {
        impressions: ['impressions'],
        reach: ['reach'],
        clicks: ['profile_visits', 'website_clicks'],
        likes: ['likes'],
        shares: ['shares', 'sends'],
        comments: ['comments'],
        saves: ['saved'],
        videoViews: ['video_views', 'plays'],
        watchTime: ['video_watch_time_seconds'],
      },
      engagementWeights: { likes: 1, comments: 3, shares: 4, saved: 2 },
    });
  }

  // -------------------------------------------------------------------------
  // Metric Normalization
  // -------------------------------------------------------------------------

  /**
   * Normalizes platform-specific metrics to unified schema.
   */
  normalizeMetrics(
    platform: SocialPlatform,
    contentId: string,
    rawMetrics: Record<string, number>,
    timestamp: Date = new Date()
  ): UnifiedMetric {
    const mapping = this.platformMappings.get(platform);
    if (!mapping) {
      throw new Error(`No mapping found for platform: ${platform}`);
    }

    const engagement: UnifiedMetric['engagement'] = {
      impressions: this.extractMetric(rawMetrics, mapping.metricMappings.impressions),
      reach: this.extractMetric(rawMetrics, mapping.metricMappings.reach),
      clicks: this.extractMetric(rawMetrics, mapping.metricMappings.clicks),
      likes: this.extractMetric(rawMetrics, mapping.metricMappings.likes),
      shares: this.extractMetric(rawMetrics, mapping.metricMappings.shares),
      comments: this.extractMetric(rawMetrics, mapping.metricMappings.comments),
      saves: this.extractMetric(rawMetrics, mapping.metricMappings.saves),
      videoViews: this.extractMetric(rawMetrics, mapping.metricMappings.videoViews),
      watchTime: this.extractMetric(rawMetrics, mapping.metricMappings.watchTime),
    };

    // Calculate normalized scores
    const engagementScore = this.calculateEngagementScore(engagement, mapping);
    const viralityScore = this.calculateViralityScore(engagement);

    const unified: UnifiedMetric = {
      id: `${platform}-${contentId}-${timestamp.getTime()}`,
      contentId,
      platform,
      timestamp,
      engagement,
      raw: rawMetrics,
      scores: {
        engagement: engagementScore,
        virality: viralityScore,
        sentiment: 50, // Would need NLP analysis
        relevance: 50, // Would need content analysis
      },
    };

    // Store
    if (!this.unifiedMetrics.has(contentId)) {
      this.unifiedMetrics.set(contentId, []);
    }
    this.unifiedMetrics.get(contentId)!.push(unified);

    return unified;
  }

  private extractMetric(raw: Record<string, number>, keys: string[]): number {
    for (const key of keys) {
      if (raw[key] !== undefined) {
        return raw[key];
      }
    }
    return 0;
  }

  private calculateEngagementScore(
    engagement: UnifiedMetric['engagement'],
    mapping: PlatformMapping
  ): number {
    if (engagement.impressions === 0) return 0;

    const totalEngagement =
      engagement.likes * (mapping.engagementWeights.likes || 1) +
      engagement.shares * (mapping.engagementWeights.shares || 2) +
      engagement.comments * (mapping.engagementWeights.comments || 3) +
      engagement.saves * (mapping.engagementWeights.saves || 2);

    const rate = (totalEngagement / engagement.impressions) * 100;
    return Math.min(100, rate * 10);
  }

  private calculateViralityScore(engagement: UnifiedMetric['engagement']): number {
    if (engagement.reach === 0) return 0;

    const shareRatio = engagement.shares / Math.max(1, engagement.reach);
    const amplification = engagement.impressions / Math.max(1, engagement.reach);

    return Math.min(100, (shareRatio * 50 + Math.log(amplification + 1) * 20));
  }

  // -------------------------------------------------------------------------
  // Attribution Modeling
  // -------------------------------------------------------------------------

  /**
   * Calculates attribution credits for conversion.
   */
  calculateAttribution(
    modelId: string,
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionTouchpoint[] {
    const model = this.attributionModels.get(modelId);
    if (!model || touchpoints.length === 0) return touchpoints;

    const sorted = [...touchpoints].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    switch (model.type) {
      case 'first_touch':
        sorted[0].credit = conversionValue;
        for (let i = 1; i < sorted.length; i++) {
          sorted[i].credit = 0;
        }
        break;

      case 'last_touch':
        for (let i = 0; i < sorted.length - 1; i++) {
          sorted[i].credit = 0;
        }
        sorted[sorted.length - 1].credit = conversionValue;
        break;

      case 'linear':
        const equalCredit = conversionValue / sorted.length;
        for (const tp of sorted) {
          tp.credit = equalCredit;
        }
        break;

      case 'time_decay':
        const halfLife = model.lookbackWindow / 2;
        const lastTime = sorted[sorted.length - 1].timestamp.getTime();
        let totalWeight = 0;

        for (const tp of sorted) {
          const daysBefore = (lastTime - tp.timestamp.getTime()) / (24 * 60 * 60 * 1000);
          const weight = Math.pow(0.5, daysBefore / halfLife);
          tp.credit = weight;
          totalWeight += weight;
        }

        for (const tp of sorted) {
          tp.credit = (tp.credit / totalWeight) * conversionValue;
        }
        break;

      case 'position_based':
        if (sorted.length === 1) {
          sorted[0].credit = conversionValue;
        } else if (sorted.length === 2) {
          sorted[0].credit = conversionValue * 0.5;
          sorted[1].credit = conversionValue * 0.5;
        } else {
          const firstLastCredit = conversionValue * 0.4;
          const middleCredit = (conversionValue * 0.2) / (sorted.length - 2);

          sorted[0].credit = firstLastCredit;
          sorted[sorted.length - 1].credit = firstLastCredit;

          for (let i = 1; i < sorted.length - 1; i++) {
            sorted[i].credit = middleCredit;
          }
        }
        break;

      case 'data_driven':
        // Would use ML model - fallback to linear
        const ddCredit = conversionValue / sorted.length;
        for (const tp of sorted) {
          tp.credit = ddCredit;
        }
        break;
    }

    return sorted;
  }

  // -------------------------------------------------------------------------
  // Funnel Analysis
  // -------------------------------------------------------------------------

  /**
   * Analyzes funnel conversion.
   */
  analyzeFunnel(funnelId: string, startDate: Date, endDate: Date): FunnelAnalysis | null {
    const stages = this.funnels.get(funnelId);
    if (!stages) return null;

    const sortedStages = [...stages].sort((a, b) => a.order - b.order);
    const userStages = new Map<string, Set<string>>();

    // Group events by user
    for (const event of this.events) {
      if (event.timestamp < startDate || event.timestamp > endDate) continue;

      if (!userStages.has(event.userId)) {
        userStages.set(event.userId, new Set());
      }
      userStages.get(event.userId)!.add(event.event);
    }

    // Calculate funnel metrics
    const metrics: FunnelAnalysis['metrics'] = [];
    let previousCount = 0;

    for (const stage of sortedStages) {
      let entered = 0;
      let completed = 0;

      for (const [, userEvents] of userStages) {
        // Check if user reached this stage
        const hasStage = userEvents.has(stage.eventName);

        // Check if user completed previous stages
        const hasAllPrevious = sortedStages
          .filter(s => s.order < stage.order)
          .every(s => userEvents.has(s.eventName));

        if (stage.order === 1) {
          if (hasStage) entered++;
        } else if (hasAllPrevious) {
          entered++;
          if (hasStage) completed++;
        }
      }

      if (stage.order === 1) {
        completed = entered;
      }

      const dropoff = previousCount > 0 ? previousCount - completed : 0;
      const conversionRate = previousCount > 0 ? (completed / previousCount) * 100 : 100;

      metrics.push({
        stage: stage.name,
        entered,
        completed,
        dropoff,
        conversionRate,
        avgTimeToNext: 0, // Would calculate from timestamps
      });

      previousCount = completed;
    }

    // Find bottleneck
    const bottleneck = metrics.reduce(
      (min, m) => m.conversionRate < min.conversionRate ? m : min,
      metrics[0]
    ).stage;

    const overallConversion = metrics.length > 0 && metrics[0].entered > 0
      ? (metrics[metrics.length - 1].completed / metrics[0].entered) * 100
      : 0;

    return {
      funnelId,
      stages: sortedStages,
      metrics,
      overallConversion,
      bottleneck,
    };
  }

  // -------------------------------------------------------------------------
  // Cohort Analysis
  // -------------------------------------------------------------------------

  /**
   * Performs cohort retention analysis.
   */
  analyzeCohort(cohortId: string, metric: string, periods: number): CohortAnalysis | null {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) return null;

    const periodData: CohortAnalysis['periods'] = [];
    let totalRetention = 0;

    for (let period = 0; period < periods; period++) {
      // Count users active in this period
      const activeUsers = cohort.memberIds.filter(userId => {
        const userEvents = this.events.filter(
          e => e.userId === userId && e.event === metric
        );

        const periodStart = new Date(cohort.createdAt);
        periodStart.setDate(periodStart.getDate() + period * 7);
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 7);

        return userEvents.some(
          e => e.timestamp >= periodStart && e.timestamp < periodEnd
        );
      });

      const retention = cohort.size > 0 ? (activeUsers.length / cohort.size) * 100 : 0;
      totalRetention += retention;

      periodData.push({
        period,
        value: activeUsers.length,
        retention,
        cumulative: period === 0 ? retention : periodData[period - 1].cumulative! * (retention / 100),
      });
    }

    const avgRetention = periods > 0 ? totalRetention / periods : 0;
    const churnRate = 100 - avgRetention;

    return {
      cohort,
      metric,
      granularity: 'week',
      periods: periodData,
      summary: {
        avgRetention,
        churnRate,
        lifetimeValue: avgRetention * periods * 0.1, // Simplified LTV
      },
    };
  }

  // -------------------------------------------------------------------------
  // Event Tracking
  // -------------------------------------------------------------------------

  trackEvent(userId: string, event: string, properties: Record<string, unknown> = {}): void {
    this.events.push({
      userId,
      event,
      timestamp: new Date(),
      properties,
    });
  }

  defineFunnel(id: string, stages: FunnelStage[]): void {
    this.funnels.set(id, stages);
  }

  defineCohort(cohort: Cohort): void {
    this.cohorts.set(cohort.id, cohort);
  }

  defineAttributionModel(model: AttributionModel): void {
    this.attributionModels.set(model.id, model);
  }
}

// =============================================================================
// SECTION 5: PREDICTIVE ANALYTICS
// =============================================================================

/**
 * Engagement prediction model.
 */
export interface EngagementPrediction {
  contentId: string;
  predictedAt: Date;
  predictions: {
    likes: { value: number; confidence: number };
    shares: { value: number; confidence: number };
    comments: { value: number; confidence: number };
    engagementRate: { value: number; confidence: number };
  };
  factors: EngagementFactor[];
  horizon: number;
}

/**
 * Factor affecting engagement prediction.
 */
export interface EngagementFactor {
  name: string;
  impact: number;
  direction: 'positive' | 'negative' | 'neutral';
  description: string;
}

/**
 * Viral potential score.
 */
export interface ViralPotentialScore {
  contentId: string;
  score: number;
  tier: 'low' | 'medium' | 'high' | 'viral';
  factors: {
    contentQuality: number;
    authorInfluence: number;
    topicTrending: number;
    timingScore: number;
    networkEffect: number;
  };
  predictedReach: number;
  predictedShares: number;
  confidence: number;
}

/**
 * Best time to post recommendation.
 */
export interface BestTimeRecommendation {
  platform: SocialPlatform;
  recommendations: {
    dayOfWeek: number;
    hourOfDay: number;
    score: number;
    expectedEngagement: number;
    audienceOnline: number;
  }[];
  timezone: string;
  basedOnDataPoints: number;
}

/**
 * Audience growth forecast.
 */
export interface AudienceGrowthForecast {
  userId: string;
  currentFollowers: number;
  forecasts: {
    date: Date;
    predicted: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
  }[];
  growthRate: number;
  projectedMilestones: {
    followers: number;
    estimatedDate: Date;
  }[];
  recommendations: string[];
}

/**
 * Content performance prediction.
 */
export interface ContentPerformancePrediction {
  contentId: string;
  contentType: string;
  predictions: {
    firstHour: PerformanceWindow;
    first24Hours: PerformanceWindow;
    firstWeek: PerformanceWindow;
    lifetime: PerformanceWindow;
  };
  comparisonToAverage: number;
  topPerformerProbability: number;
  recommendations: string[];
}

/**
 * Performance window prediction.
 */
export interface PerformanceWindow {
  impressions: { min: number; max: number; expected: number };
  engagement: { min: number; max: number; expected: number };
  shares: { min: number; max: number; expected: number };
  confidence: number;
}

/**
 * Predictive analytics engine.
 */
export class PredictiveAnalytics {
  private socialGraph: SocialGraph;
  private timeSeriesAnalytics: TimeSeriesAnalytics;
  private crossPlatformAnalytics: CrossPlatformAnalytics;

  /** Historical performance data for training */
  private contentHistory: Map<string, SocialContent[]> = new Map();
  private engagementHistory: Map<string, ContentEngagement[]> = new Map();

  /** Model coefficients (simplified) */
  private engagementModel: {
    intercept: number;
    coefficients: Record<string, number>;
  } = {
    intercept: 0,
    coefficients: {},
  };

  constructor(
    socialGraph: SocialGraph,
    timeSeriesAnalytics: TimeSeriesAnalytics,
    crossPlatformAnalytics: CrossPlatformAnalytics
  ) {
    this.socialGraph = socialGraph;
    this.timeSeriesAnalytics = timeSeriesAnalytics;
    this.crossPlatformAnalytics = crossPlatformAnalytics;
    this.initializeModels();
  }

  private initializeModels(): void {
    // Initialize with default coefficients
    this.engagementModel = {
      intercept: 10,
      coefficients: {
        followerCount: 0.001,
        authorInfluence: 50,
        contentLength: 0.01,
        hasMedia: 20,
        hasHashtags: 5,
        postingHourOptimal: 15,
        topicTrending: 30,
        daysSinceLastPost: -2,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Engagement Prediction
  // -------------------------------------------------------------------------

  /**
   * Predicts engagement for content.
   */
  predictEngagement(
    content: SocialContent,
    author: SocialUser,
    horizon: number = 24
  ): EngagementPrediction {
    // Extract features
    const features = this.extractContentFeatures(content, author);

    // Calculate base prediction
    let basePrediction = this.engagementModel.intercept;
    const factors: EngagementFactor[] = [];

    for (const [feature, value] of Object.entries(features)) {
      const coefficient = this.engagementModel.coefficients[feature] || 0;
      const contribution = coefficient * value;
      basePrediction += contribution;

      if (Math.abs(contribution) > 1) {
        factors.push({
          name: feature,
          impact: Math.abs(contribution),
          direction: contribution > 0 ? 'positive' : contribution < 0 ? 'negative' : 'neutral',
          description: this.getFeatureDescription(feature, value),
        });
      }
    }

    // Scale predictions
    const likePrediction = Math.max(0, basePrediction * 0.8);
    const sharePrediction = Math.max(0, basePrediction * 0.15);
    const commentPrediction = Math.max(0, basePrediction * 0.05);

    // Calculate confidence based on historical accuracy
    const confidence = this.calculatePredictionConfidence(author.id);

    return {
      contentId: content.id,
      predictedAt: new Date(),
      predictions: {
        likes: { value: Math.round(likePrediction), confidence },
        shares: { value: Math.round(sharePrediction), confidence: confidence * 0.9 },
        comments: { value: Math.round(commentPrediction), confidence: confidence * 0.85 },
        engagementRate: {
          value: this.calculateEngagementRate(likePrediction, sharePrediction, commentPrediction, author.metrics.followerCount),
          confidence: confidence * 0.8,
        },
      },
      factors: factors.sort((a, b) => b.impact - a.impact).slice(0, 5),
      horizon,
    };
  }

  private extractContentFeatures(content: SocialContent, author: SocialUser): Record<string, number> {
    return {
      followerCount: author.metrics.followerCount,
      authorInfluence: author.influence.composite,
      contentLength: content.title.length,
      hasMedia: content.type === 'article' ? 1 : 0,
      hasHashtags: content.classification.topics.length > 0 ? 1 : 0,
      postingHourOptimal: this.isOptimalPostingTime(new Date()) ? 1 : 0,
      topicTrending: this.getTopicTrendingScore(content.classification.topics),
      daysSinceLastPost: this.getDaysSinceLastPost(author.id),
    };
  }

  private getFeatureDescription(feature: string, value: number): string {
    const descriptions: Record<string, (v: number) => string> = {
      followerCount: (v) => `Author has ${v.toLocaleString()} followers`,
      authorInfluence: (v) => `Author influence score: ${(v * 100).toFixed(1)}`,
      contentLength: (v) => `Content length: ${v} characters`,
      hasMedia: (v) => v > 0 ? 'Content includes media' : 'No media included',
      hasHashtags: (v) => v > 0 ? 'Uses relevant topics/hashtags' : 'No topics tagged',
      postingHourOptimal: (v) => v > 0 ? 'Posted at optimal time' : 'Non-optimal posting time',
      topicTrending: (v) => `Topic trending score: ${v.toFixed(1)}`,
      daysSinceLastPost: (v) => `${v} days since last post`,
    };

    return descriptions[feature]?.(value) || `${feature}: ${value}`;
  }

  private isOptimalPostingTime(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();

    // Optimal times: weekdays 9-11am, 1-3pm; weekends 10am-12pm
    if (day === 0 || day === 6) {
      return hour >= 10 && hour <= 12;
    }
    return (hour >= 9 && hour <= 11) || (hour >= 13 && hour <= 15);
  }

  private getTopicTrendingScore(topics: string[]): number {
    // Would integrate with trending topics API
    return topics.length > 0 ? 0.5 : 0;
  }

  private getDaysSinceLastPost(authorId: string): number {
    const authorContent = this.contentHistory.get(authorId);
    if (!authorContent || authorContent.length === 0) return 7;

    const lastPost = authorContent.reduce(
      (latest, c) => c.createdAt > latest.createdAt ? c : latest,
      authorContent[0]
    );

    return (Date.now() - lastPost.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  }

  private calculatePredictionConfidence(authorId: string): number {
    const history = this.engagementHistory.get(authorId);
    if (!history || history.length < 10) return 0.5;
    if (history.length < 50) return 0.65;
    return 0.8;
  }

  private calculateEngagementRate(likes: number, shares: number, comments: number, followers: number): number {
    if (followers === 0) return 0;
    return ((likes + shares * 2 + comments * 3) / followers) * 100;
  }

  // -------------------------------------------------------------------------
  // Viral Potential Scoring
  // -------------------------------------------------------------------------

  /**
   * Calculates viral potential score for content.
   */
  calculateViralPotential(content: SocialContent, author: SocialUser): ViralPotentialScore {
    // Calculate component scores
    const contentQuality = this.scoreContentQuality(content);
    const authorInfluence = author.influence.composite * 100;
    const topicTrending = this.getTopicTrendingScore(content.classification.topics) * 100;
    const timingScore = this.isOptimalPostingTime(content.createdAt) ? 80 : 40;
    const networkEffect = this.calculateNetworkEffect(author);

    // Weighted combination
    const weights = {
      contentQuality: 0.25,
      authorInfluence: 0.3,
      topicTrending: 0.2,
      timingScore: 0.1,
      networkEffect: 0.15,
    };

    const score =
      contentQuality * weights.contentQuality +
      authorInfluence * weights.authorInfluence +
      topicTrending * weights.topicTrending +
      timingScore * weights.timingScore +
      networkEffect * weights.networkEffect;

    // Determine tier
    const tier: ViralPotentialScore['tier'] =
      score >= 80 ? 'viral' :
      score >= 60 ? 'high' :
      score >= 40 ? 'medium' : 'low';

    // Predict reach and shares
    const baseReach = author.metrics.followerCount;
    const reachMultiplier = 1 + (score / 100) * 10;
    const predictedReach = Math.round(baseReach * reachMultiplier);
    const predictedShares = Math.round(predictedReach * (score / 1000));

    return {
      contentId: content.id,
      score,
      tier,
      factors: {
        contentQuality,
        authorInfluence,
        topicTrending,
        timingScore,
        networkEffect,
      },
      predictedReach,
      predictedShares,
      confidence: this.calculatePredictionConfidence(author.id),
    };
  }

  private scoreContentQuality(content: SocialContent): number {
    let score = 50;

    // Title length (optimal: 50-100 chars)
    const titleLen = content.title.length;
    if (titleLen >= 50 && titleLen <= 100) score += 15;
    else if (titleLen >= 30 && titleLen <= 150) score += 5;

    // Has classification
    if (content.classification.topics.length > 0) score += 10;
    if (content.classification.types.length > 0) score += 5;

    // Content type bonus
    if (content.type === 'article') score += 10;
    if (content.type === 'project') score += 15;

    return Math.min(100, score);
  }

  private calculateNetworkEffect(author: SocialUser): number {
    // Based on community membership and connections
    const communityBonus = author.communityIds.length * 5;
    const connectionRatio = author.metrics.followerCount > 0
      ? Math.min(1, author.metrics.followingCount / author.metrics.followerCount)
      : 0;

    return Math.min(100, 50 + communityBonus + connectionRatio * 20);
  }

  // -------------------------------------------------------------------------
  // Best Time Optimization
  // -------------------------------------------------------------------------

  /**
   * Recommends best times to post.
   */
  recommendBestTimes(
    userId: string,
    platform: SocialPlatform,
    timezone: string = 'UTC'
  ): BestTimeRecommendation {
    const userContent = this.contentHistory.get(userId) || [];
    const recommendations: BestTimeRecommendation['recommendations'] = [];

    // Analyze historical performance by time
    const performanceByTime = new Map<string, { engagement: number; count: number }>();

    for (const content of userContent) {
      const hour = content.createdAt.getHours();
      const day = content.createdAt.getDay();
      const key = `${day}-${hour}`;

      if (!performanceByTime.has(key)) {
        performanceByTime.set(key, { engagement: 0, count: 0 });
      }

      const data = performanceByTime.get(key)!;
      data.engagement += content.engagement.engagementRate;
      data.count += 1;
    }

    // Generate recommendations for each day/hour combination
    for (let day = 0; day < 7; day++) {
      for (let hour = 6; hour <= 22; hour += 2) {
        const key = `${day}-${hour}`;
        const data = performanceByTime.get(key);

        const avgEngagement = data ? data.engagement / data.count : this.getDefaultEngagement(day, hour);
        const audienceOnline = this.estimateAudienceOnline(day, hour);

        const score = avgEngagement * 0.6 + audienceOnline * 0.4;

        recommendations.push({
          dayOfWeek: day,
          hourOfDay: hour,
          score,
          expectedEngagement: avgEngagement,
          audienceOnline,
        });
      }
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    return {
      platform,
      recommendations: recommendations.slice(0, 10),
      timezone,
      basedOnDataPoints: userContent.length,
    };
  }

  private getDefaultEngagement(day: number, hour: number): number {
    // Default engagement patterns
    const weekdayPeak = (hour >= 9 && hour <= 11) || (hour >= 13 && hour <= 15);
    const weekendPeak = hour >= 10 && hour <= 14;
    const isWeekend = day === 0 || day === 6;

    if (isWeekend) {
      return weekendPeak ? 3.5 : 2.0;
    }
    return weekdayPeak ? 4.0 : 2.5;
  }

  private estimateAudienceOnline(day: number, hour: number): number {
    // Estimate percentage of audience online (0-100)
    const isWeekend = day === 0 || day === 6;
    const isMorning = hour >= 7 && hour <= 9;
    const isLunch = hour >= 12 && hour <= 14;
    const isEvening = hour >= 18 && hour <= 21;

    if (isWeekend) {
      if (hour >= 10 && hour <= 14) return 60;
      if (isEvening) return 55;
      return 30;
    }

    if (isMorning) return 45;
    if (isLunch) return 50;
    if (isEvening) return 65;
    if (hour >= 9 && hour <= 17) return 35;
    return 20;
  }

  // -------------------------------------------------------------------------
  // Audience Growth Forecasting
  // -------------------------------------------------------------------------

  /**
   * Forecasts audience growth.
   */
  forecastAudienceGrowth(userId: string, daysAhead: number = 30): AudienceGrowthForecast {
    const user = this.socialGraph.getUser(userId);
    if (!user) {
      return {
        userId,
        currentFollowers: 0,
        forecasts: [],
        growthRate: 0,
        projectedMilestones: [],
        recommendations: ['User not found'],
      };
    }

    // Calculate historical growth rate
    const historicalGrowthRate = this.calculateHistoricalGrowthRate(userId);
    const currentFollowers = user.metrics.followerCount;

    // Generate forecasts
    const forecasts: AudienceGrowthForecast['forecasts'] = [];
    const confidenceDecay = 0.02;

    for (let day = 1; day <= daysAhead; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);

      const dailyGrowth = currentFollowers * (historicalGrowthRate / 100);
      const predicted = Math.round(currentFollowers + dailyGrowth * day);

      const variance = Math.sqrt(day) * dailyGrowth * 0.5;
      const confidence = Math.max(0.5, 0.95 - confidenceDecay * day);

      forecasts.push({
        date,
        predicted,
        lowerBound: Math.round(predicted - variance * 2),
        upperBound: Math.round(predicted + variance * 2),
        confidence,
      });
    }

    // Project milestones
    const milestones = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
    const projectedMilestones = milestones
      .filter(m => m > currentFollowers)
      .slice(0, 3)
      .map(followers => {
        const daysToReach = historicalGrowthRate > 0
          ? Math.ceil((followers - currentFollowers) / (currentFollowers * historicalGrowthRate / 100))
          : Infinity;

        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + daysToReach);

        return { followers, estimatedDate };
      })
      .filter(m => m.estimatedDate.getTime() - Date.now() < 365 * 24 * 60 * 60 * 1000);

    // Generate recommendations
    const recommendations = this.generateGrowthRecommendations(user, historicalGrowthRate);

    return {
      userId,
      currentFollowers,
      forecasts,
      growthRate: historicalGrowthRate,
      projectedMilestones,
      recommendations,
    };
  }

  private calculateHistoricalGrowthRate(userId: string): number {
    // Would analyze historical follower count changes
    // Default to reasonable estimate based on engagement
    const user = this.socialGraph.getUser(userId);
    if (!user) return 0;

    const engagementRate = user.metrics.engagementRate;
    return Math.min(5, 0.5 + engagementRate * 0.3);
  }

  private generateGrowthRecommendations(user: SocialUser, growthRate: number): string[] {
    const recommendations: string[] = [];

    if (growthRate < 1) {
      recommendations.push('Increase posting frequency to boost visibility');
    }

    if (user.metrics.engagementRate < 2) {
      recommendations.push('Focus on creating more engaging content');
      recommendations.push('Respond to comments to build community');
    }

    if (user.metrics.followingCount > user.metrics.followerCount * 2) {
      recommendations.push('Consider being more selective with who you follow');
    }

    if (user.communityIds.length === 0) {
      recommendations.push('Join relevant communities to expand reach');
    }

    if (user.profile.interests.length < 3) {
      recommendations.push('Add more interests to your profile for better discoverability');
    }

    return recommendations.slice(0, 5);
  }

  // -------------------------------------------------------------------------
  // Content Performance Prediction
  // -------------------------------------------------------------------------

  /**
   * Predicts content performance across time windows.
   */
  predictContentPerformance(content: SocialContent, author: SocialUser): ContentPerformancePrediction {
    const viralScore = this.calculateViralPotential(content, author);
    const baseEngagement = this.predictEngagement(content, author);

    const baseImpressions = author.metrics.followerCount * 0.3;
    const multiplier = 1 + (viralScore.score / 100);

    const predictions: ContentPerformancePrediction['predictions'] = {
      firstHour: this.predictWindow(baseImpressions * 0.2 * multiplier, viralScore.score),
      first24Hours: this.predictWindow(baseImpressions * 0.6 * multiplier, viralScore.score),
      firstWeek: this.predictWindow(baseImpressions * 0.9 * multiplier, viralScore.score),
      lifetime: this.predictWindow(baseImpressions * multiplier, viralScore.score),
    };

    // Compare to average
    const avgEngagement = this.getAverageContentEngagement(author.id);
    const expectedEngagement = predictions.first24Hours.engagement.expected;
    const comparisonToAverage = avgEngagement > 0
      ? ((expectedEngagement - avgEngagement) / avgEngagement) * 100
      : 0;

    // Calculate top performer probability
    const topPerformerProbability = Math.min(0.95, viralScore.score / 100);

    // Generate recommendations
    const recommendations = this.generatePerformanceRecommendations(content, viralScore);

    return {
      contentId: content.id,
      contentType: content.type,
      predictions,
      comparisonToAverage,
      topPerformerProbability,
      recommendations,
    };
  }

  private predictWindow(baseImpressions: number, viralScore: number): PerformanceWindow {
    const variance = 0.3;
    const engagementRate = 2 + viralScore / 20;

    return {
      impressions: {
        min: Math.round(baseImpressions * (1 - variance)),
        max: Math.round(baseImpressions * (1 + variance)),
        expected: Math.round(baseImpressions),
      },
      engagement: {
        min: Math.round(baseImpressions * engagementRate / 100 * (1 - variance)),
        max: Math.round(baseImpressions * engagementRate / 100 * (1 + variance)),
        expected: Math.round(baseImpressions * engagementRate / 100),
      },
      shares: {
        min: Math.round(baseImpressions * 0.01 * (1 - variance)),
        max: Math.round(baseImpressions * 0.05 * (1 + variance)),
        expected: Math.round(baseImpressions * viralScore / 3000),
      },
      confidence: Math.max(0.5, 0.9 - variance),
    };
  }

  private getAverageContentEngagement(authorId: string): number {
    const history = this.engagementHistory.get(authorId);
    if (!history || history.length === 0) return 0;

    const total = history.reduce((sum, e) => sum + e.engagementRate, 0);
    return total / history.length;
  }

  private generatePerformanceRecommendations(content: SocialContent, viralScore: ViralPotentialScore): string[] {
    const recommendations: string[] = [];

    if (viralScore.factors.contentQuality < 60) {
      recommendations.push('Improve content quality with more detailed descriptions');
    }

    if (viralScore.factors.topicTrending < 30) {
      recommendations.push('Consider adding trending topics to increase visibility');
    }

    if (viralScore.factors.timingScore < 50) {
      recommendations.push('Schedule this content for a better posting time');
    }

    if (content.classification.topics.length === 0) {
      recommendations.push('Add relevant topics/tags to improve discoverability');
    }

    if (viralScore.tier === 'low') {
      recommendations.push('Consider promoting this content to boost initial engagement');
    }

    return recommendations.slice(0, 4);
  }

  // -------------------------------------------------------------------------
  // Model Training (Simplified)
  // -------------------------------------------------------------------------

  /**
   * Updates model with new observations.
   */
  updateModel(contentId: string, actualEngagement: ContentEngagement): void {
    const content = this.socialGraph.getContent(contentId);
    if (!content) return;

    // Store for historical analysis
    if (!this.contentHistory.has(content.authorId)) {
      this.contentHistory.set(content.authorId, []);
    }
    this.contentHistory.get(content.authorId)!.push(content);

    if (!this.engagementHistory.has(content.authorId)) {
      this.engagementHistory.set(content.authorId, []);
    }
    this.engagementHistory.get(content.authorId)!.push(actualEngagement);

    // Would update model coefficients via gradient descent
  }
}

// =============================================================================
// SECTION 6: UNIFIED ANALYTICS SYSTEM
// =============================================================================

/**
 * Unified analytics system combining all components.
 */
export class SocialAnalyticsSystem {
  readonly socialGraph: SocialGraph;
  readonly timeSeriesAnalytics: TimeSeriesAnalytics;
  readonly crossPlatformAnalytics: CrossPlatformAnalytics;
  readonly predictiveAnalytics: PredictiveAnalytics;

  constructor() {
    this.socialGraph = new SocialGraph();
    this.timeSeriesAnalytics = new TimeSeriesAnalytics();
    this.crossPlatformAnalytics = new CrossPlatformAnalytics();
    this.predictiveAnalytics = new PredictiveAnalytics(
      this.socialGraph,
      this.timeSeriesAnalytics,
      this.crossPlatformAnalytics
    );
  }

  /**
   * Initializes default metrics.
   */
  initialize(): void {
    // Register standard metrics
    this.timeSeriesAnalytics.registerMetric({
      id: 'page_views',
      name: 'Page Views',
      description: 'Total page views',
      type: 'counter',
      unit: 'views',
      aggregations: ['sum', 'avg', 'max'],
      retentionDays: 365,
    });

    this.timeSeriesAnalytics.registerMetric({
      id: 'engagement',
      name: 'Engagement',
      description: 'Total engagement actions',
      type: 'counter',
      unit: 'actions',
      aggregations: ['sum', 'avg', 'p95'],
      retentionDays: 365,
    });

    this.timeSeriesAnalytics.registerMetric({
      id: 'followers',
      name: 'Follower Count',
      description: 'Total followers',
      type: 'gauge',
      unit: 'users',
      aggregations: ['avg', 'min', 'max'],
      retentionDays: 365,
    });

    // Create real-time counters
    this.timeSeriesAnalytics.createCounter('active_users', 'Active Users', 5 * 60 * 1000);
    this.timeSeriesAnalytics.createCounter('new_content', 'New Content', 60 * 60 * 1000);

    // Define default funnel
    this.crossPlatformAnalytics.defineFunnel('signup', [
      { id: 'visit', name: 'Visit', description: 'Visited site', eventName: 'page_view', order: 1 },
      { id: 'signup_start', name: 'Start Signup', description: 'Started signup', eventName: 'signup_start', order: 2 },
      { id: 'signup_complete', name: 'Complete Signup', description: 'Completed signup', eventName: 'signup_complete', order: 3 },
      { id: 'first_action', name: 'First Action', description: 'Took first action', eventName: 'first_action', order: 4 },
    ]);

    // Define default attribution model
    this.crossPlatformAnalytics.defineAttributionModel({
      id: 'default',
      name: 'Time Decay',
      type: 'time_decay',
      lookbackWindow: 30,
      touchpoints: [],
    });
  }

  /**
   * Gets comprehensive analytics dashboard data.
   */
  getDashboardData(userId: string): {
    userMetrics: UserMetrics | null;
    influenceScores: InfluenceScores | null;
    recommendations: { users: { userId: string; score: number }[]; content: { contentId: string; score: number }[] };
    trends: ReturnType<TimeSeriesAnalytics['detectTrend']>;
    predictions: AudienceGrowthForecast;
  } {
    const user = this.socialGraph.getUser(userId);

    return {
      userMetrics: user?.metrics || null,
      influenceScores: user?.influence || null,
      recommendations: {
        users: this.socialGraph.recommendUsers(userId, 5),
        content: this.socialGraph.recommendContent(userId, 5),
      },
      trends: this.timeSeriesAnalytics.detectTrend('engagement', 'day', 30),
      predictions: this.predictiveAnalytics.forecastAudienceGrowth(userId, 30),
    };
  }
}

// Factory function
export function createSocialAnalyticsSystem(): SocialAnalyticsSystem {
  const system = new SocialAnalyticsSystem();
  system.initialize();
  return system;
}
