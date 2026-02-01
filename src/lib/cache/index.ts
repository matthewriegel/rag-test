import Redis from 'ioredis';
import { createHash } from 'crypto';
import { config } from '../../config/index.js';
import { logger } from '../logger.js';

export class CacheService {
  private client: Redis;
  private readonly keyPrefix = 'rag';

  constructor() {
    this.client = new Redis(config.redis.url, {
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  /**
   * Generate cache key for query
   * Format: rag:query:{customerId}:{hash(question)}
   */
  generateQueryKey(question: string, customerId?: string): string {
    const hash = createHash('sha256')
      .update(question.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);
    
    const customerPart = customerId || 'global';
    return `${this.keyPrefix}:query:${customerPart}:${hash}`;
  }

  /**
   * Generate cache key for customer data
   */
  generateCustomerKey(customerId: string): string {
    return `${this.keyPrefix}:customer:${customerId}`;
  }

  /**
   * Generate cache key for embedding
   */
  generateEmbeddingKey(text: string): string {
    const hash = createHash('sha256')
      .update(text.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);
    
    return `${this.keyPrefix}:embedding:${hash}`;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn({ error, key }, 'Cache get failed');
      return null;
    }
  }

  /**
   * Set cache value with TTL
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.warn({ error, key }, 'Cache set failed');
    }
  }

  /**
   * Cache query result
   */
  async cacheQuery(
    question: string,
    customerId: string | undefined,
    result: unknown
  ): Promise<void> {
    const key = this.generateQueryKey(question, customerId);
    await this.set(key, result, config.cache.queryTTL);
  }

  /**
   * Get cached query result
   */
  async getCachedQuery<T>(question: string, customerId?: string): Promise<T | null> {
    const key = this.generateQueryKey(question, customerId);
    return this.get<T>(key);
  }

  /**
   * Cache customer data
   */
  async cacheCustomer(customerId: string, data: unknown): Promise<void> {
    const key = this.generateCustomerKey(customerId);
    await this.set(key, data, config.cache.customerTTL);
  }

  /**
   * Get cached customer data
   */
  async getCachedCustomer<T>(customerId: string): Promise<T | null> {
    const key = this.generateCustomerKey(customerId);
    return this.get<T>(key);
  }

  /**
   * Cache embedding
   */
  async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    const key = this.generateEmbeddingKey(text);
    await this.set(key, embedding, config.cache.embeddingTTL);
  }

  /**
   * Get cached embedding
   */
  async getCachedEmbedding(text: string): Promise<number[] | null> {
    const key = this.generateEmbeddingKey(text);
    return this.get<number[]>(key);
  }

  /**
   * Delete cache key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.warn({ error, key }, 'Cache delete failed');
    }
  }

  /**
   * Clear all cache with prefix pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.keyPrefix}:${pattern}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.info({ count: keys.length, pattern }, 'Cleared cache keys');
      }
    } catch (error) {
      logger.warn({ error, pattern }, 'Cache clear failed');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    keys: number;
    memory: string;
    hits: number;
    misses: number;
  }> {
    try {
      const info = await this.client.info('stats');
      const stats = info.split('\r\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      const dbSize = await this.client.dbsize();

      return {
        keys: dbSize,
        memory: stats['used_memory_human'] || '0',
        hits: parseInt(stats['keyspace_hits'] || '0', 10),
        misses: parseInt(stats['keyspace_misses'] || '0', 10),
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to get cache stats');
      return { keys: 0, memory: '0', hits: 0, misses: 0 };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.client.quit();
  }
}

export const cacheService = new CacheService();
