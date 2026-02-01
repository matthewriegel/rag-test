import { Router, Request, Response } from 'express';
import { vectorStore } from '../../lib/vectorStore/index.js';
import { cacheService } from '../../lib/cache/index.js';
import { getMetrics } from '../middleware/metrics.js';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check vector store connection
    await vectorStore.initialize();

    // Check cache connection
    const cacheStats = await cacheService.getStats();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        vectorStore: 'connected',
        cache: 'connected',
      },
      cache: cacheStats,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /metrics
 * Prometheus-compatible metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = getMetrics();
    const cacheStats = await cacheService.getStats();

    // Prometheus text format
    const prometheusMetrics = `
# HELP rag_uptime_seconds Application uptime in seconds
# TYPE rag_uptime_seconds gauge
rag_uptime_seconds ${metrics.uptime}

# HELP rag_total_queries Total number of queries processed
# TYPE rag_total_queries counter
rag_total_queries ${metrics.totalQueries}

# HELP rag_cache_hit_rate Cache hit rate (0-1)
# TYPE rag_cache_hit_rate gauge
rag_cache_hit_rate ${metrics.cacheHitRate}

# HELP rag_query_latency_avg_ms Average query latency in milliseconds
# TYPE rag_query_latency_avg_ms gauge
rag_query_latency_avg_ms ${metrics.avgQueryLatency}

# HELP rag_query_latency_p95_ms P95 query latency in milliseconds
# TYPE rag_query_latency_p95_ms gauge
rag_query_latency_p95_ms ${metrics.p95QueryLatency}

# HELP rag_ingestion_total Total number of documents ingested
# TYPE rag_ingestion_total counter
rag_ingestion_total ${metrics.ingestionCount}

# HELP rag_cache_keys Number of keys in cache
# TYPE rag_cache_keys gauge
rag_cache_keys ${cacheStats.keys}

# HELP rag_cache_hits Total cache hits
# TYPE rag_cache_hits counter
rag_cache_hits ${cacheStats.hits}

# HELP rag_cache_misses Total cache misses
# TYPE rag_cache_misses counter
rag_cache_misses ${cacheStats.misses}
`.trim();

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(prometheusMetrics);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get metrics',
    });
  }
});

export default router;
