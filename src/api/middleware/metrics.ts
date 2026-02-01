import { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

const startTime = Date.now();
const metrics = {
  totalQueries: 0,
  cacheHits: 0,
  cacheMisses: 0,
  queryLatencies: [] as number[],
  ingestionCount: 0,
};

/**
 * Track query metrics
 */
export function trackQuery(duration: number, cacheHit: boolean): void {
  metrics.totalQueries++;
  metrics.queryLatencies.push(duration);

  if (cacheHit) {
    metrics.cacheHits++;
  } else {
    metrics.cacheMisses++;
  }

  // Keep only last 1000 latencies
  if (metrics.queryLatencies.length > 1000) {
    metrics.queryLatencies.shift();
  }
}

/**
 * Track ingestion
 */
export function trackIngestion(): void {
  metrics.ingestionCount++;
}

/**
 * Get current metrics
 */
export function getMetrics(): {
  uptime: number;
  totalQueries: number;
  cacheHitRate: number;
  avgQueryLatency: number;
  p95QueryLatency: number;
  ingestionCount: number;
} {
  const cacheHitRate =
    metrics.totalQueries > 0
      ? metrics.cacheHits / metrics.totalQueries
      : 0;

  const avgLatency =
    metrics.queryLatencies.length > 0
      ? metrics.queryLatencies.reduce((sum, lat) => sum + lat, 0) /
        metrics.queryLatencies.length
      : 0;

  const sortedLatencies = [...metrics.queryLatencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95Latency = sortedLatencies[p95Index] || 0;

  return {
    uptime: Math.floor((Date.now() - startTime) / 1000),
    totalQueries: metrics.totalQueries,
    cacheHitRate: Math.round(cacheHitRate * 100) / 100,
    avgQueryLatency: Math.round(avgLatency),
    p95QueryLatency: Math.round(p95Latency),
    ingestionCount: metrics.ingestionCount,
  };
}

/**
 * Prometheus-compatible metrics endpoint middleware
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.debug(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
      },
      'Request completed'
    );
  });

  next();
}
