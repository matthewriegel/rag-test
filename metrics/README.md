# RAG Service Metrics

This directory contains documentation and examples for monitoring the RAG service.

## Available Metrics

The service exposes Prometheus-compatible metrics at the `/metrics` endpoint.

### Service Metrics

- **rag_uptime_seconds** (gauge): Application uptime in seconds
- **rag_total_queries** (counter): Total number of queries processed
- **rag_cache_hit_rate** (gauge): Cache hit rate from 0 to 1
- **rag_query_latency_avg_ms** (gauge): Average query latency in milliseconds
- **rag_query_latency_p95_ms** (gauge): 95th percentile query latency in milliseconds
- **rag_ingestion_total** (counter): Total number of documents ingested

### Cache Metrics

- **rag_cache_keys** (gauge): Number of keys currently in Redis cache
- **rag_cache_hits** (counter): Total cache hits
- **rag_cache_misses** (counter): Total cache misses

## Prometheus Configuration

Add this job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'rag-service'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Grafana Dashboard

Example queries for visualization:

### Query Latency Over Time
```promql
rate(rag_query_latency_avg_ms[5m])
```

### Cache Hit Rate
```promql
rag_cache_hit_rate
```

### Query Throughput
```promql
rate(rag_total_queries[1m])
```

### P95 Latency
```promql
rag_query_latency_p95_ms
```

## Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: rag_service
    rules:
      - alert: HighQueryLatency
        expr: rag_query_latency_p95_ms > 5000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High query latency detected"
          description: "P95 query latency is {{ $value }}ms"

      - alert: LowCacheHitRate
        expr: rag_cache_hit_rate < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value }}"

      - alert: ServiceDown
        expr: up{job="rag-service"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "RAG service is down"
```

## Custom Application Metrics

You can extend the metrics by modifying `src/api/middleware/metrics.ts`.

Example of adding a custom metric:

```typescript
export function trackCustomEvent(eventType: string): void {
  // Add your tracking logic here
}
```

## Performance Benchmarks

Target performance metrics for production:

- **Query Latency (P95)**: < 2000ms
- **Cache Hit Rate**: > 60%
- **Availability**: > 99.9%
- **Error Rate**: < 1%

## Monitoring Best Practices

1. **Set up alerts** for critical metrics (latency, error rate)
2. **Monitor cache hit rate** to optimize TTL settings
3. **Track query patterns** to identify optimization opportunities
4. **Review error logs** regularly for patterns
5. **Monitor resource usage** (CPU, memory) of Docker containers

## Troubleshooting with Metrics

- **High latency**: Check OpenAI API response times, consider increasing cache TTL
- **Low cache hit rate**: Questions may be too varied, consider query normalization
- **High error rate**: Check logs for specific errors, verify external service health
- **Memory growth**: Monitor Redis memory usage, adjust maxmemory settings
