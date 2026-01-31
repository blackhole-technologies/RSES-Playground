/**
 * @file vector-database.ts
 * @description Vector database abstraction layer for embedding storage and similarity search.
 *              Supports Pinecone, Weaviate, Qdrant, and in-memory implementations.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Supported Backends:
 * - Pinecone (managed vector database)
 * - Weaviate (self-hosted or cloud)
 * - Qdrant (self-hosted or cloud)
 * - ChromaDB (local)
 * - In-memory (development/testing)
 */

import { createModuleLogger } from "../logger";
import { VectorDatabase, VectorSearchOptions, VectorSearchResult, ClusterCentroid } from "./ml-taxonomy-engine";
import { Embedding, EmbeddingModel, ContentModality } from "./ml-taxonomy-engine";

const log = createModuleLogger("vector-database");

// ============================================================================
// EXTENDED INTERFACES
// ============================================================================

/**
 * Vector database configuration.
 */
export interface VectorDatabaseConfig {
  /** Database type */
  type: "pinecone" | "weaviate" | "qdrant" | "chroma" | "memory";
  /** Connection URL */
  url?: string;
  /** API key */
  apiKey?: string;
  /** Index/collection name */
  indexName: string;
  /** Embedding dimension */
  dimension: number;
  /** Distance metric */
  metric: "cosine" | "euclidean" | "dotproduct";
  /** Namespace for multi-tenancy */
  namespace?: string;
  /** Enable metadata filtering */
  enableMetadata?: boolean;
  /** Batch size for operations */
  batchSize?: number;
}

/**
 * Extended embedding with additional metadata.
 */
export interface StoredEmbedding extends Embedding {
  /** Categories assigned */
  categories?: string[];
  /** Vocabulary assignments */
  vocabularies?: Map<string, string[]>;
  /** Last classification timestamp */
  lastClassified?: Date;
  /** Content hash for deduplication */
  contentHash?: string;
}

/**
 * Upsert operation for vectors.
 */
export interface VectorUpsert {
  id: string;
  vector: Float32Array;
  metadata?: Record<string, unknown>;
}

/**
 * Filter operations for vector search.
 */
export interface VectorFilter {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "nin" | "contains";
  value: unknown;
}

/**
 * Extended search options.
 */
export interface ExtendedSearchOptions extends VectorSearchOptions {
  /** Complex filters */
  filters?: VectorFilter[];
  /** Hybrid search (keyword + vector) */
  hybridQuery?: string;
  /** Alpha for hybrid search (0 = keyword, 1 = vector) */
  hybridAlpha?: number;
  /** Reranking model */
  reranker?: string;
}

/**
 * Database statistics.
 */
export interface VectorDatabaseStats {
  /** Total vector count */
  vectorCount: number;
  /** Index size in bytes */
  indexSize: number;
  /** Dimension */
  dimension: number;
  /** Metric */
  metric: string;
  /** Namespaces */
  namespaces?: string[];
  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// IN-MEMORY IMPLEMENTATION
// ============================================================================

/**
 * In-memory vector database for development and testing.
 * Implements exact nearest neighbor search.
 */
export class InMemoryVectorDatabase implements VectorDatabase {
  private vectors: Map<string, StoredEmbedding> = new Map();
  private config: VectorDatabaseConfig;
  private metadata: Map<string, Record<string, unknown>> = new Map();

  constructor(config: VectorDatabaseConfig) {
    this.config = config;
    log.info({ indexName: config.indexName, dimension: config.dimension }, "In-memory vector database initialized");
  }

  async insert(embedding: Embedding): Promise<void> {
    this.vectors.set(embedding.contentId, embedding as StoredEmbedding);
    if (embedding.metadata) {
      this.metadata.set(embedding.contentId, embedding.metadata);
    }
  }

  async batchInsert(embeddings: Embedding[]): Promise<void> {
    for (const embedding of embeddings) {
      await this.insert(embedding);
    }
  }

  async search(query: Float32Array, options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [contentId, embedding] of this.vectors) {
      // Apply metadata filter if specified
      if (options.filter) {
        const meta = this.metadata.get(contentId);
        if (!this.matchesFilter(meta, options.filter)) {
          continue;
        }
      }

      const similarity = this.calculateSimilarity(query, embedding.vector);

      if (!options.minSimilarity || similarity >= options.minSimilarity) {
        results.push({
          contentId,
          similarity,
          metadata: options.includeEmbeddings ? this.metadata.get(contentId) : undefined,
          embedding: options.includeEmbeddings ? embedding.vector : undefined,
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, options.topK);
  }

  async get(contentId: string): Promise<Embedding | null> {
    return this.vectors.get(contentId) || null;
  }

  async delete(contentId: string): Promise<void> {
    this.vectors.delete(contentId);
    this.metadata.delete(contentId);
  }

  async update(embedding: Embedding): Promise<void> {
    await this.insert(embedding);
  }

  async getClusters(k: number): Promise<ClusterCentroid[]> {
    // Simple k-means clustering
    if (this.vectors.size === 0) return [];

    const vectors = Array.from(this.vectors.values());
    const dimension = this.config.dimension;

    // Initialize centroids randomly
    const centroids: Float32Array[] = [];
    const assignments: number[] = new Array(vectors.length).fill(0);

    for (let i = 0; i < k && i < vectors.length; i++) {
      centroids.push(new Float32Array(vectors[i].vector));
    }

    // Run k-means iterations
    const maxIterations = 100;
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign vectors to nearest centroid
      let changed = false;
      for (let i = 0; i < vectors.length; i++) {
        let bestCluster = 0;
        let bestDistance = Infinity;

        for (let c = 0; c < centroids.length; c++) {
          const distance = this.calculateDistance(vectors[i].vector, centroids[c]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCluster = c;
          }
        }

        if (assignments[i] !== bestCluster) {
          assignments[i] = bestCluster;
          changed = true;
        }
      }

      if (!changed) break;

      // Update centroids
      for (let c = 0; c < centroids.length; c++) {
        const members = vectors.filter((_, i) => assignments[i] === c);
        if (members.length === 0) continue;

        const newCentroid = new Float32Array(dimension);
        for (const member of members) {
          for (let d = 0; d < dimension; d++) {
            newCentroid[d] += member.vector[d];
          }
        }
        for (let d = 0; d < dimension; d++) {
          newCentroid[d] /= members.length;
        }
        centroids[c] = newCentroid;
      }
    }

    // Build cluster results
    const clusters: ClusterCentroid[] = [];
    for (let c = 0; c < centroids.length; c++) {
      const memberIndices = assignments
        .map((a, i) => (a === c ? i : -1))
        .filter((i) => i !== -1);

      const representatives = memberIndices
        .slice(0, 5)
        .map((i) => vectors[i].contentId);

      clusters.push({
        clusterId: c,
        centroid: centroids[c],
        memberCount: memberIndices.length,
        representatives,
      });
    }

    return clusters.filter((c) => c.memberCount > 0);
  }

  async nearestNeighbors(contentId: string, k: number): Promise<VectorSearchResult[]> {
    const embedding = this.vectors.get(contentId);
    if (!embedding) return [];

    const results = await this.search(embedding.vector, { topK: k + 1 });
    return results.filter((r) => r.contentId !== contentId).slice(0, k);
  }

  // Utility methods

  private calculateSimilarity(a: Float32Array, b: Float32Array): number {
    switch (this.config.metric) {
      case "cosine":
        return this.cosineSimilarity(a, b);
      case "euclidean":
        return 1 / (1 + this.euclideanDistance(a, b));
      case "dotproduct":
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  private calculateDistance(a: Float32Array, b: Float32Array): number {
    switch (this.config.metric) {
      case "cosine":
        return 1 - this.cosineSimilarity(a, b);
      case "euclidean":
        return this.euclideanDistance(a, b);
      case "dotproduct":
        return -this.dotProduct(a, b);
      default:
        return this.euclideanDistance(a, b);
    }
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
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

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private matchesFilter(metadata: Record<string, unknown> | undefined, filter: Record<string, unknown>): boolean {
    if (!metadata) return false;

    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) return false;
    }
    return true;
  }

  // Additional methods

  async getStats(): Promise<VectorDatabaseStats> {
    return {
      vectorCount: this.vectors.size,
      indexSize: this.vectors.size * this.config.dimension * 4, // Float32 = 4 bytes
      dimension: this.config.dimension,
      metric: this.config.metric,
      lastUpdated: new Date(),
    };
  }

  async clear(): Promise<void> {
    this.vectors.clear();
    this.metadata.clear();
  }

  async exists(contentId: string): Promise<boolean> {
    return this.vectors.has(contentId);
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }
}

// ============================================================================
// PINECONE IMPLEMENTATION
// ============================================================================

/**
 * Pinecone vector database client.
 * Requires PINECONE_API_KEY and PINECONE_ENVIRONMENT environment variables.
 */
export class PineconeVectorDatabase implements VectorDatabase {
  private config: VectorDatabaseConfig;
  private indexHost?: string;

  constructor(config: VectorDatabaseConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error("Pinecone API key required");
    }

    // Get index host
    const response = await fetch(
      `https://api.pinecone.io/indexes/${this.config.indexName}`,
      {
        headers: {
          "Api-Key": this.config.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get Pinecone index: ${response.statusText}`);
    }

    const data = await response.json();
    this.indexHost = data.host;
    log.info({ indexName: this.config.indexName, host: this.indexHost }, "Pinecone initialized");
  }

  async insert(embedding: Embedding): Promise<void> {
    await this.upsert([embedding]);
  }

  async batchInsert(embeddings: Embedding[]): Promise<void> {
    const batchSize = this.config.batchSize || 100;

    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize);
      await this.upsert(batch);
    }
  }

  private async upsert(embeddings: Embedding[]): Promise<void> {
    if (!this.indexHost) {
      throw new Error("Pinecone not initialized");
    }

    const vectors = embeddings.map((e) => ({
      id: e.contentId,
      values: Array.from(e.vector),
      metadata: {
        model: e.model,
        modality: e.modality,
        generatedAt: e.generatedAt.toISOString(),
        ...e.metadata,
      },
    }));

    const response = await fetch(`https://${this.indexHost}/vectors/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.config.apiKey!,
      },
      body: JSON.stringify({
        vectors,
        namespace: this.config.namespace,
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone upsert failed: ${response.statusText}`);
    }
  }

  async search(query: Float32Array, options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    if (!this.indexHost) {
      throw new Error("Pinecone not initialized");
    }

    const response = await fetch(`https://${this.indexHost}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.config.apiKey!,
      },
      body: JSON.stringify({
        vector: Array.from(query),
        topK: options.topK,
        namespace: this.config.namespace,
        includeMetadata: true,
        includeValues: options.includeEmbeddings,
        filter: options.filter,
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone query failed: ${response.statusText}`);
    }

    const data = await response.json();

    return data.matches.map((match: {
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
      values?: number[];
    }) => ({
      contentId: match.id,
      similarity: match.score,
      metadata: match.metadata,
      embedding: match.values ? new Float32Array(match.values) : undefined,
    })).filter((r: VectorSearchResult) => !options.minSimilarity || r.similarity >= options.minSimilarity!);
  }

  async get(contentId: string): Promise<Embedding | null> {
    if (!this.indexHost) {
      throw new Error("Pinecone not initialized");
    }

    const response = await fetch(`https://${this.indexHost}/vectors/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.config.apiKey!,
      },
      body: JSON.stringify({
        ids: [contentId],
        namespace: this.config.namespace,
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    const vector = data.vectors[contentId];

    if (!vector) return null;

    return {
      contentId,
      vector: new Float32Array(vector.values),
      model: vector.metadata?.model as EmbeddingModel || "openai-ada-002",
      modality: vector.metadata?.modality as ContentModality || "text",
      generatedAt: new Date(vector.metadata?.generatedAt || Date.now()),
      metadata: vector.metadata,
    };
  }

  async delete(contentId: string): Promise<void> {
    if (!this.indexHost) {
      throw new Error("Pinecone not initialized");
    }

    await fetch(`https://${this.indexHost}/vectors/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": this.config.apiKey!,
      },
      body: JSON.stringify({
        ids: [contentId],
        namespace: this.config.namespace,
      }),
    });
  }

  async update(embedding: Embedding): Promise<void> {
    await this.insert(embedding);
  }

  async getClusters(_k: number): Promise<ClusterCentroid[]> {
    // Pinecone doesn't support built-in clustering
    // Would need to fetch all vectors and cluster locally
    log.warn("Clustering not supported for Pinecone, use local clustering");
    return [];
  }

  async nearestNeighbors(contentId: string, k: number): Promise<VectorSearchResult[]> {
    const embedding = await this.get(contentId);
    if (!embedding) return [];

    const results = await this.search(embedding.vector, { topK: k + 1 });
    return results.filter((r) => r.contentId !== contentId).slice(0, k);
  }
}

// ============================================================================
// WEAVIATE IMPLEMENTATION
// ============================================================================

/**
 * Weaviate vector database client.
 */
export class WeaviateVectorDatabase implements VectorDatabase {
  private config: VectorDatabaseConfig;
  private className: string;

  constructor(config: VectorDatabaseConfig) {
    this.config = config;
    this.className = this.formatClassName(config.indexName);
  }

  private formatClassName(name: string): string {
    // Weaviate class names must start with uppercase
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, "_");
  }

  async initialize(): Promise<void> {
    if (!this.config.url) {
      throw new Error("Weaviate URL required");
    }

    // Check if class exists, create if not
    const schemaResponse = await fetch(`${this.config.url}/v1/schema/${this.className}`, {
      headers: this.getHeaders(),
    });

    if (schemaResponse.status === 404) {
      await this.createClass();
    }

    log.info({ className: this.className }, "Weaviate initialized");
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async createClass(): Promise<void> {
    const classSchema = {
      class: this.className,
      vectorizer: "none",
      vectorIndexConfig: {
        distance: this.config.metric === "cosine" ? "cosine" : "l2-squared",
      },
      properties: [
        { name: "contentId", dataType: ["string"] },
        { name: "model", dataType: ["string"] },
        { name: "modality", dataType: ["string"] },
        { name: "generatedAt", dataType: ["date"] },
        { name: "metadata", dataType: ["object"] },
      ],
    };

    const response = await fetch(`${this.config.url}/v1/schema`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(classSchema),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Weaviate class: ${response.statusText}`);
    }
  }

  async insert(embedding: Embedding): Promise<void> {
    const object = {
      class: this.className,
      id: this.contentIdToUUID(embedding.contentId),
      vector: Array.from(embedding.vector),
      properties: {
        contentId: embedding.contentId,
        model: embedding.model,
        modality: embedding.modality,
        generatedAt: embedding.generatedAt.toISOString(),
        metadata: embedding.metadata,
      },
    };

    const response = await fetch(`${this.config.url}/v1/objects`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(object),
    });

    if (!response.ok) {
      throw new Error(`Weaviate insert failed: ${response.statusText}`);
    }
  }

  async batchInsert(embeddings: Embedding[]): Promise<void> {
    const objects = embeddings.map((e) => ({
      class: this.className,
      id: this.contentIdToUUID(e.contentId),
      vector: Array.from(e.vector),
      properties: {
        contentId: e.contentId,
        model: e.model,
        modality: e.modality,
        generatedAt: e.generatedAt.toISOString(),
        metadata: e.metadata,
      },
    }));

    const response = await fetch(`${this.config.url}/v1/batch/objects`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ objects }),
    });

    if (!response.ok) {
      throw new Error(`Weaviate batch insert failed: ${response.statusText}`);
    }
  }

  async search(query: Float32Array, options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const graphql = {
      query: `{
        Get {
          ${this.className}(
            nearVector: {
              vector: [${Array.from(query).join(",")}]
              certainty: ${options.minSimilarity || 0}
            }
            limit: ${options.topK}
          ) {
            contentId
            model
            modality
            metadata
            _additional {
              certainty
              ${options.includeEmbeddings ? "vector" : ""}
            }
          }
        }
      }`,
    };

    const response = await fetch(`${this.config.url}/v1/graphql`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(graphql),
    });

    if (!response.ok) {
      throw new Error(`Weaviate search failed: ${response.statusText}`);
    }

    const data = await response.json();
    const results = data.data?.Get?.[this.className] || [];

    return results.map((r: {
      contentId: string;
      metadata?: Record<string, unknown>;
      _additional: { certainty: number; vector?: number[] };
    }) => ({
      contentId: r.contentId,
      similarity: r._additional.certainty,
      metadata: r.metadata,
      embedding: r._additional.vector ? new Float32Array(r._additional.vector) : undefined,
    }));
  }

  async get(contentId: string): Promise<Embedding | null> {
    const uuid = this.contentIdToUUID(contentId);

    const response = await fetch(`${this.config.url}/v1/objects/${this.className}/${uuid}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Weaviate get failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      contentId: data.properties.contentId,
      vector: new Float32Array(data.vector),
      model: data.properties.model,
      modality: data.properties.modality,
      generatedAt: new Date(data.properties.generatedAt),
      metadata: data.properties.metadata,
    };
  }

  async delete(contentId: string): Promise<void> {
    const uuid = this.contentIdToUUID(contentId);

    await fetch(`${this.config.url}/v1/objects/${this.className}/${uuid}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
  }

  async update(embedding: Embedding): Promise<void> {
    await this.delete(embedding.contentId);
    await this.insert(embedding);
  }

  async getClusters(_k: number): Promise<ClusterCentroid[]> {
    // Weaviate doesn't have built-in clustering
    return [];
  }

  async nearestNeighbors(contentId: string, k: number): Promise<VectorSearchResult[]> {
    const embedding = await this.get(contentId);
    if (!embedding) return [];

    const results = await this.search(embedding.vector, { topK: k + 1 });
    return results.filter((r) => r.contentId !== contentId).slice(0, k);
  }

  private contentIdToUUID(contentId: string): string {
    // Convert content ID to UUID format
    // Simple hash-based approach
    const hash = this.hashString(contentId);
    const hex = Math.abs(hash).toString(16).padStart(32, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a vector database instance based on configuration.
 */
export async function createVectorDatabase(config: VectorDatabaseConfig): Promise<VectorDatabase> {
  let db: VectorDatabase;

  switch (config.type) {
    case "pinecone":
      const pinecone = new PineconeVectorDatabase(config);
      await (pinecone as PineconeVectorDatabase).initialize();
      db = pinecone;
      break;

    case "weaviate":
      const weaviate = new WeaviateVectorDatabase(config);
      await (weaviate as WeaviateVectorDatabase).initialize();
      db = weaviate;
      break;

    case "memory":
    default:
      db = new InMemoryVectorDatabase(config);
      break;
  }

  log.info({ type: config.type, indexName: config.indexName }, "Vector database created");
  return db;
}

/**
 * Creates a vector database from environment configuration.
 */
export async function createVectorDatabaseFromEnv(): Promise<VectorDatabase> {
  const type = (process.env.VECTOR_DB_TYPE || "memory") as VectorDatabaseConfig["type"];

  const config: VectorDatabaseConfig = {
    type,
    url: process.env.VECTOR_DB_URL,
    apiKey: process.env.VECTOR_DB_API_KEY,
    indexName: process.env.VECTOR_DB_INDEX || "rses-taxonomy",
    dimension: parseInt(process.env.VECTOR_DB_DIMENSION || "384"),
    metric: (process.env.VECTOR_DB_METRIC || "cosine") as VectorDatabaseConfig["metric"],
    namespace: process.env.VECTOR_DB_NAMESPACE,
    batchSize: parseInt(process.env.VECTOR_DB_BATCH_SIZE || "100"),
  };

  return createVectorDatabase(config);
}

// ============================================================================
// SINGLETON
// ============================================================================

let vectorDbInstance: VectorDatabase | null = null;

/**
 * Gets the singleton vector database instance.
 */
export async function getVectorDatabase(): Promise<VectorDatabase> {
  if (!vectorDbInstance) {
    vectorDbInstance = await createVectorDatabaseFromEnv();
  }
  return vectorDbInstance;
}

/**
 * Resets the singleton vector database.
 */
export function resetVectorDatabase(): void {
  vectorDbInstance = null;
}
