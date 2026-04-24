/**
 * @file regex-cache.ts
 * @description LRU cache for compiled regex patterns to avoid recompilation.
 * @phase Phase 2 - Core Engine Improvements
 * @author SGT (Set-Graph Theorist Agent)
 * @validated SYS (Systems Analyst Agent)
 * @created 2026-01-31
 *
 * @performance Caching regex compilation can provide 10-100x speedup
 *              for repeated pattern matching.
 */

/**
 * LRU Cache entry with access tracking.
 */
interface CacheEntry {
  regex: RegExp;
  lastAccess: number;
}

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/**
 * LRU (Least Recently Used) cache for compiled RegExp objects.
 * Automatically evicts least recently used entries when full.
 */
export class RegexCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Creates a new RegexCache.
   *
   * @param maxSize - Maximum number of patterns to cache (default: 1000)
   */
  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Gets a compiled regex for the given pattern, using cache if available.
   *
   * @param pattern - The regex pattern string
   * @param flags - Optional regex flags (default: "")
   * @returns Compiled RegExp object
   */
  get(pattern: string, flags: string = ""): RegExp {
    const key = `${pattern}::${flags}`;
    const entry = this.cache.get(key);

    if (entry) {
      // Update access time for LRU tracking
      entry.lastAccess = Date.now();
      this.hits++;
      return entry.regex;
    }

    // Cache miss - compile and store
    this.misses++;
    const regex = new RegExp(pattern, flags);

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      regex,
      lastAccess: Date.now(),
    });

    return regex;
  }

  /**
   * Compiles a glob pattern to regex and caches it.
   *
   * @param globPattern - Glob pattern (e.g., "*.txt", "web-*")
   * @returns Compiled RegExp for matching
   */
  getGlobRegex(globPattern: string): RegExp {
    const key = `glob::${globPattern}`;
    const entry = this.cache.get(key);

    if (entry) {
      entry.lastAccess = Date.now();
      this.hits++;
      return entry.regex;
    }

    this.misses++;

    // Convert glob to regex
    // Escape regex special chars INCLUDING * first
    const escaped = globPattern.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
    // Then convert \* back to .* for glob wildcard
    const regexStr = escaped.replace(/\\\*/g, ".*");
    const regex = new RegExp(`^${regexStr}$`);

    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      regex,
      lastAccess: Date.now(),
    });

    return regex;
  }

  /**
   * Evicts the least recently used entry from the cache.
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Checks if a pattern is in the cache.
   *
   * @param pattern - Pattern to check
   * @param flags - Optional flags
   * @returns True if cached
   */
  has(pattern: string, flags: string = ""): boolean {
    return this.cache.has(`${pattern}::${flags}`);
  }

  /**
   * Gets cache statistics.
   *
   * @returns CacheStats object
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clears the cache and resets statistics.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Resets statistics without clearing the cache.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Gets the current cache size.
   */
  get size(): number {
    return this.cache.size;
  }
}

// Global cache instance for shared use
let globalCache: RegexCache | null = null;

/**
 * Gets the global regex cache instance.
 * Creates one if it doesn't exist.
 *
 * @param maxSize - Max size for new cache (only used on first call)
 * @returns Global RegexCache instance
 */
export function getGlobalCache(maxSize: number = 1000): RegexCache {
  if (!globalCache) {
    globalCache = new RegexCache(maxSize);
  }
  return globalCache;
}

/**
 * Resets the global cache (mainly for testing).
 */
export function resetGlobalCache(): void {
  globalCache = null;
}
