# Social Graph and Analytics Theory for RSES CMS

**Author:** Set-Graph Theorist Agent (SGT)
**Date:** 2026-02-01
**Version:** 1.0

## Executive Summary

This document formalizes the mathematical and algorithmic foundations for social graph analysis and analytics in the RSES CMS. Drawing from Neo4j graph analytics, TimescaleDB time-series patterns, Apache Druid OLAP concepts, and Mixpanel/Amplitude event analytics, we establish a comprehensive framework for:

1. **Social Graph Modeling** - User connections, content sharing, influence propagation
2. **Time-Series Analytics** - Metrics aggregation, trend detection, forecasting
3. **Cross-Platform Analytics** - Unified metrics, attribution, funnel analysis
4. **Predictive Analytics** - Engagement prediction, viral scoring, growth forecasting

---

## Table of Contents

1. [Social Graph Model](#1-social-graph-model)
2. [Graph Algorithms](#2-graph-algorithms)
3. [Time-Series Analytics](#3-time-series-analytics)
4. [Cross-Platform Analytics](#4-cross-platform-analytics)
5. [Predictive Models](#5-predictive-models)
6. [Query Optimization](#6-query-optimization)
7. [Streaming Analytics](#7-streaming-analytics)

---

## 1. Social Graph Model

### 1.1 Graph Definition

The social graph G = (V, E) consists of:

- **V = V_U union V_C** where V_U = users, V_C = content
- **E subseteq V x V x T x W** where T = edge types, W = weights

**Edge Types (T):**
```
T = {follows, likes, shares, comments, mentions, collaborates, blocks, recommends}
```

### 1.2 User Node Structure

Each user u in V_U has attributes:

```
u = {
  id: unique identifier,
  profile: {bio, interests, location},
  metrics: {followers, following, engagement_rate},
  influence: {pagerank, betweenness, closeness, ...},
  communities: [community_ids]
}
```

### 1.3 Content Node Structure

Each content item c in V_C has:

```
c = {
  id: unique identifier,
  author_id: user reference,
  classification: {sets, topics, types},  // From RSES
  engagement: {views, likes, shares, comments},
  viral_score: computed score
}
```

### 1.4 Edge Properties

Edges carry metadata:

```
e = (source, target, type, weight, timestamp, metadata)
```

The weight w captures relationship strength:
- For follows: w = engagement_frequency
- For likes/shares: w = 1 (binary)
- For comments: w = comment_count

---

## 2. Graph Algorithms

### 2.1 PageRank

**Definition:** Measures node importance based on incoming links.

**Formula:**
```
PR(u) = (1-d)/N + d * sum_{v in In(u)} PR(v) / |Out(v)|
```

Where:
- d = damping factor (typically 0.85)
- N = total number of nodes
- In(u) = set of nodes linking to u
- Out(v) = set of nodes v links to

**Convergence:** O(k * |E|) where k = iterations

### 2.2 Betweenness Centrality

**Definition:** Measures how often a node lies on shortest paths.

**Formula:**
```
BC(v) = sum_{s != v != t} sigma_st(v) / sigma_st
```

Where:
- sigma_st = number of shortest paths from s to t
- sigma_st(v) = number passing through v

**Algorithm:** Brandes' algorithm - O(|V| * |E|)

### 2.3 Community Detection (Louvain)

**Objective:** Maximize modularity Q

**Modularity:**
```
Q = (1/2m) * sum_{ij} [A_ij - (k_i * k_j)/(2m)] * delta(c_i, c_j)
```

Where:
- m = total edge weight
- A_ij = edge weight between i and j
- k_i = degree of node i
- c_i = community of node i
- delta = 1 if same community, 0 otherwise

**Algorithm:**
1. Initialize: each node = own community
2. Local optimization: move nodes to maximize Q gain
3. Aggregation: collapse communities into super-nodes
4. Repeat until no improvement

### 2.4 Influence Propagation (Independent Cascade)

**Model:** Probabilistic spread of influence through network

**Algorithm:**
```
function cascade(seeds, probability):
  influenced = set(seeds)
  frontier = seeds

  while frontier not empty:
    new_frontier = {}
    for node in frontier:
      for neighbor in out_neighbors(node):
        if neighbor not in influenced:
          if random() < probability * edge_weight(node, neighbor):
            influenced.add(neighbor)
            new_frontier.add(neighbor)
    frontier = new_frontier

  return influenced
```

**Expected Spread:** E[|influenced|] = function of seed selection

### 2.5 Influence Maximization

**Problem:** Find k seed nodes maximizing expected spread

**Greedy Algorithm:**
```
function maximize_influence(k, simulations):
  seeds = []
  for i in 1..k:
    best_node = argmax_{v not in seeds} marginal_gain(v, seeds)
    seeds.append(best_node)
  return seeds

function marginal_gain(v, seeds):
  return avg([|cascade(seeds + [v])| for _ in 1..simulations])
         - avg([|cascade(seeds)| for _ in 1..simulations])
```

**Approximation Guarantee:** (1 - 1/e) optimal due to submodularity

---

## 3. Time-Series Analytics

### 3.1 Time Granularity Algebra

**Granularity Hierarchy:**
```
minute < hour < day < week < month < quarter < year
```

**Truncation Function:**
```
truncate(timestamp, granularity) -> bucket_start_time
```

### 3.2 Aggregation Functions

**Standard Aggregations:**

| Function | Formula | Use Case |
|----------|---------|----------|
| SUM | sum(x_i) | Total counts |
| AVG | sum(x_i) / n | Average values |
| MIN | min(x_i) | Minimum threshold |
| MAX | max(x_i) | Peak detection |
| COUNT | n | Event counting |
| P50 | percentile(X, 0.5) | Median |
| P95 | percentile(X, 0.95) | High percentile |
| P99 | percentile(X, 0.99) | Tail latency |

### 3.3 Continuous Aggregates

**Definition:** Pre-computed aggregations that update incrementally

**Structure:**
```
ContinuousAggregate = {
  source_metric: MetricDefinition,
  granularity: TimeGranularity,
  aggregations: [AggregationType],
  dimensions: [string],
  refresh_interval: duration
}
```

**Refresh Strategy:**
- Full refresh: recompute all buckets
- Incremental: only update changed buckets
- Sliding window: maintain last N periods

### 3.4 Trend Detection

**Linear Regression:**
```
y = a + bx

where:
  b = (n * sum(xy) - sum(x) * sum(y)) / (n * sum(x^2) - sum(x)^2)
  a = (sum(y) - b * sum(x)) / n
```

**R-squared (Goodness of Fit):**
```
R^2 = 1 - SS_res / SS_tot

where:
  SS_res = sum((y_i - predicted_i)^2)
  SS_tot = sum((y_i - mean(y))^2)
```

**Trend Classification:**
```
if slope > threshold:
  trend = "increasing"
elif slope < -threshold:
  trend = "decreasing"
else:
  trend = "stable"
```

### 3.5 Forecasting

**Simple Exponential Smoothing:**
```
forecast_t+1 = alpha * actual_t + (1 - alpha) * forecast_t
```

**Holt-Winters (Seasonal):**
```
level_t = alpha * (actual_t / seasonal_{t-s}) + (1-alpha) * (level_{t-1} + trend_{t-1})
trend_t = beta * (level_t - level_{t-1}) + (1-beta) * trend_{t-1}
seasonal_t = gamma * (actual_t / level_t) + (1-gamma) * seasonal_{t-s}
forecast_{t+h} = (level_t + h * trend_t) * seasonal_{t+h-s}
```

---

## 4. Cross-Platform Analytics

### 4.1 Unified Metric Schema

**Canonical Engagement Metrics:**

| Metric | Description | Normalization |
|--------|-------------|---------------|
| impressions | Times content displayed | Direct |
| reach | Unique viewers | Direct |
| clicks | Click-throughs | Direct |
| likes | Positive reactions | Map platform variants |
| shares | Redistributions | Map retweets, reposts |
| comments | Reply threads | Direct |
| saves | Bookmarks | Map platform variants |
| video_views | Video plays | Platform-specific thresholds |
| watch_time | Video duration watched | Seconds |

### 4.2 Platform Normalization

**Mapping Function:**
```
normalize(platform, raw_metrics) -> UnifiedMetric

where:
  mapping = platform_mappings[platform]
  for each unified_field:
    value = first_non_null([raw_metrics[key] for key in mapping[unified_field]])
```

### 4.3 Engagement Score Calculation

**Weighted Engagement:**
```
engagement_score = sum(metric_i * weight_i) / impressions * 100

weights = {
  likes: 1,
  shares: 2,
  comments: 3,
  saves: 2
}
```

**Normalization to 0-100:**
```
normalized = min(100, raw_score * scale_factor)
```

### 4.4 Attribution Models

**First Touch:**
```
credit(touchpoint) = conversion_value if touchpoint == first else 0
```

**Last Touch:**
```
credit(touchpoint) = conversion_value if touchpoint == last else 0
```

**Linear:**
```
credit(touchpoint) = conversion_value / num_touchpoints
```

**Time Decay:**
```
weight(touchpoint) = 0.5^(days_before_conversion / half_life)
credit(touchpoint) = (weight / sum(weights)) * conversion_value
```

**Position-Based (40-20-40):**
```
credit(first) = 0.4 * conversion_value
credit(last) = 0.4 * conversion_value
credit(middle) = 0.2 * conversion_value / (num_touchpoints - 2)
```

### 4.5 Funnel Analysis

**Conversion Rate:**
```
conversion_rate(stage_i, stage_j) = entered(stage_j) / completed(stage_i) * 100
```

**Drop-off:**
```
dropoff(stage_i) = completed(stage_{i-1}) - completed(stage_i)
```

**Overall Conversion:**
```
overall = completed(final_stage) / entered(first_stage) * 100
```

### 4.6 Cohort Analysis

**Cohort Definition:**
```
Cohort = {
  criteria: (type, property, value, date_range),
  members: [user_ids]
}
```

**Retention Calculation:**
```
retention(period_i) = active_users(period_i) / cohort_size * 100
```

**Cumulative Retention:**
```
cumulative(period_i) = product(retention(period_j) / 100 for j in 0..i)
```

---

## 5. Predictive Models

### 5.1 Engagement Prediction

**Feature Vector:**
```
features = {
  follower_count: int,
  author_influence: float,
  content_length: int,
  has_media: binary,
  has_hashtags: binary,
  posting_hour_optimal: binary,
  topic_trending: float,
  days_since_last_post: int
}
```

**Linear Model:**
```
predicted_engagement = intercept + sum(coefficient_i * feature_i)
```

**Confidence Estimation:**
Based on historical prediction accuracy for the author.

### 5.2 Viral Potential Score

**Component Scores:**

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Content Quality | 0.25 | Title length, media, tags |
| Author Influence | 0.30 | Composite influence score |
| Topic Trending | 0.20 | Trending score of topics |
| Timing | 0.10 | Optimal posting time |
| Network Effect | 0.15 | Community connections |

**Composite Score:**
```
viral_score = sum(component_i * weight_i)
```

**Tier Classification:**
```
tier = {
  viral: score >= 80,
  high: score >= 60,
  medium: score >= 40,
  low: score < 40
}
```

### 5.3 Best Time Optimization

**Historical Analysis:**
```
performance_by_time[day][hour] = {
  total_engagement: sum,
  count: num_posts,
  avg_engagement: total / count
}
```

**Audience Online Estimation:**
Based on activity patterns and time zone distribution.

**Recommendation Score:**
```
score = avg_engagement * 0.6 + audience_online * 0.4
```

### 5.4 Audience Growth Forecasting

**Historical Growth Rate:**
```
growth_rate = (current_followers - past_followers) / past_followers / days * 100
```

**Forecast:**
```
forecast(day_n) = current_followers + daily_growth * n
variance = sqrt(n) * daily_growth * 0.5
confidence = 0.95 - 0.02 * n
```

**Milestone Projection:**
```
days_to_milestone = (target - current) / daily_growth
```

### 5.5 Content Performance Prediction

**Window Predictions:**
- First hour: 20% of total expected
- First 24 hours: 60% of total expected
- First week: 90% of total expected
- Lifetime: 100% of total expected

**Comparison to Average:**
```
comparison = (predicted - avg_historical) / avg_historical * 100
```

---

## 6. Query Optimization

### 6.1 Index Structures

**User Index:**
```
user_id -> User (hash index)
```

**Edge Indexes:**
```
source_id -> [edge_ids] (adjacency list)
target_id -> [edge_ids] (inverted adjacency)
edge_type -> [edge_ids] (type index)
```

**Time-Series Index:**
```
(metric_id, timestamp) -> values (B-tree)
(metric_id, dimensions, timestamp) -> values (composite)
```

### 6.2 Query Patterns

**Neighborhood Query:**
```
SELECT edges WHERE source = ?
```
Complexity: O(degree)

**Path Query:**
```
BFS/DFS traversal
```
Complexity: O(V + E) for full graph, O(d^k) for k-hop limited

**Aggregation Query:**
```
SELECT aggregate(values) WHERE metric = ? AND time BETWEEN ? AND ?
GROUP BY truncate(timestamp, granularity)
```
Complexity: O(n) for raw data, O(1) for pre-computed aggregates

### 6.3 Caching Strategy

**LRU Cache for:**
- User profiles
- Recent aggregations
- Computed influence scores
- Community memberships

**Cache Invalidation:**
- TTL-based for time-sensitive data
- Event-based for graph mutations

---

## 7. Streaming Analytics

### 7.1 Real-Time Counters

**Sliding Window Counter:**
```
Counter = {
  value: total_count,
  window: {
    duration: milliseconds,
    values: [(timestamp, delta)]
  }
}
```

**Window Maintenance:**
```
on_increment(delta):
  counter.value += delta
  counter.window.values.append((now, delta))
  prune_expired()

prune_expired():
  cutoff = now - window.duration
  counter.window.values = [v for v in values if v.timestamp >= cutoff]
```

**Rate Calculation:**
```
rate = sum(deltas in window) / (window.duration / 1000)
```

### 7.2 Stream Processing

**Event Flow:**
```
source -> parse -> enrich -> aggregate -> sink
```

**Windowing:**
- Tumbling: fixed, non-overlapping windows
- Sliding: overlapping windows
- Session: activity-based windows

### 7.3 Anomaly Detection

**Z-Score Method:**
```
z = (x - mean) / std_dev
anomaly if |z| > threshold (typically 3)
```

**Moving Average:**
```
MA_t = sum(x_{t-k} to x_t) / k
anomaly if |x_t - MA_t| > threshold
```

---

## Appendix A: Complexity Summary

| Operation | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| PageRank | O(k * E) | O(V) |
| Betweenness | O(V * E) | O(V) |
| Community Detection | O(V log V) | O(V + E) |
| Influence Cascade | O(E) | O(V) |
| Time Aggregation | O(n) raw, O(1) pre-computed | O(buckets) |
| Trend Detection | O(n) | O(1) |
| Engagement Prediction | O(features) | O(1) |

## Appendix B: Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| pagerank_damping | 0.85 | Damping factor for PageRank |
| pagerank_iterations | 100 | Max iterations |
| community_min_size | 2 | Minimum community size |
| cascade_probability | 0.1 | Base propagation probability |
| trend_lookback_days | 30 | Days for trend analysis |
| forecast_horizon | 7 | Days to forecast ahead |
| cache_ttl | 300 | Cache TTL in seconds |

## Appendix C: References

1. Page, L. et al. (1999). "The PageRank Citation Ranking: Bringing Order to the Web"
2. Brandes, U. (2001). "A Faster Algorithm for Betweenness Centrality"
3. Blondel, V. et al. (2008). "Fast unfolding of communities in large networks"
4. Kempe, D. et al. (2003). "Maximizing the Spread of Influence through a Social Network"
5. Holt, C.C. (1957). "Forecasting Seasonals and Trends by Exponentially Weighted Moving Averages"
6. Apache Druid Documentation - Real-time Analytics
7. TimescaleDB Documentation - Time-series Best Practices
8. Mixpanel Analytics Documentation
9. Amplitude Product Analytics Guide

---

## Implementation Reference

The TypeScript implementation of these concepts can be found at:

```
/server/lib/social-analytics.ts
```

Key classes:
- `SocialGraph` - Graph model and algorithms
- `TimeSeriesAnalytics` - Time-series aggregation and trends
- `CrossPlatformAnalytics` - Unified metrics and attribution
- `PredictiveAnalytics` - ML-based predictions
- `SocialAnalyticsSystem` - Unified system facade
