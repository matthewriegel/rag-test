# RAG Service Architecture

## Overview

This document explains the architectural decisions and design patterns used in the RAG (Retrieval-Augmented-Generation) service.

## System Architecture

### High-Level Data Flow

```
User Query
    ↓
Cache Check (Redis) → Cache Hit → Return Cached Result
    ↓ (Cache Miss)
Embedding Generation (OpenAI)
    ↓
Cache Embedding (Redis)
    ↓
Vector Search (Qdrant)
    ↓
Re-ranking (Metadata boost)
    ↓
Context Building
    ↓
LLM Generation (OpenAI GPT-4)
    ↓
Confidence Calculation
    ↓
Cache Result (Redis)
    ↓
Return to User
```

### Component Responsibilities

#### 1. Configuration Layer (`src/config/`)
- **Purpose**: Centralized configuration management
- **Why**: Single source of truth for all settings, making the system easier to configure and test
- **Features**:
  - Environment variable validation
  - Type-safe configuration objects
  - Default values for all optional settings
  - Confidence weight validation (must sum to 1.0)

#### 2. Library Layer (`src/lib/`)

##### OpenAI Client (`lib/openai/`)
- **Retry Logic**: Exponential backoff for transient failures
- **Timeout Management**: Configurable timeouts to prevent hanging requests
- **Error Handling**: Distinguishes between retryable (rate limits, 5xx) and non-retryable errors
- **Why**: OpenAI API can be rate-limited or temporarily unavailable; automatic retries improve reliability

##### Embeddings (`lib/embeddings/`)
- **Chunking Strategy**: 
  - Token-based chunking (500 tokens default)
  - Overlap (100 tokens) to preserve context at boundaries
  - Sentence-boundary awareness to avoid mid-sentence cuts
- **Why**: 
  - Large documents exceed embedding model context windows
  - Overlap ensures important context isn't lost at chunk boundaries
  - Deterministic chunking enables consistent results

##### Vector Store (`lib/vectorStore/`)
- **Database**: Qdrant
- **Why Qdrant**:
  - Fast cosine similarity search
  - Built-in metadata filtering
  - Easy to self-host with Docker
  - REST API for simple integration
  - No complex dependencies
- **Features**:
  - Automatic collection creation
  - Idempotent operations
  - Metadata-based filtering

##### Cache (`lib/cache/`)
- **Database**: Redis
- **Why Redis**:
  - Sub-millisecond latency
  - LRU eviction handles memory limits automatically
  - Simple key-value model
  - Persistence options available
- **Caching Strategy**:
  1. **Query Results** (1 hour TTL): Full RAG responses
  2. **Embeddings** (7 days TTL): Reuse embeddings for identical text
  3. **Customer Data** (24 hours TTL): Reduce DB lookups
- **Cache Key Design**:
  - Query: `rag:query:{customerId}:{hash(question)}`
  - Embedding: `rag:embedding:{hash(text)}`
  - Customer: `rag:customer:{customerId}`
- **Why Hash-Based Keys**: Normalizes variations in whitespace/casing

#### 3. Service Layer (`src/services/`)

##### Ingestion Service (`services/ingest/`)
- **Idempotency**: Deletes existing document before re-ingestion
- **PII Redaction**: Automatic redaction of emails, SSNs, credit cards, phone numbers
- **Batch Support**: Parallel ingestion with individual error handling
- **Why**: Documents may need to be updated; idempotency prevents duplicates

##### RAG Service (`services/rag/`)
- **Pipeline Stages**:
  1. Cache check (fast path)
  2. Embedding generation (with caching)
  3. Vector search with metadata filtering
  4. Re-ranking (metadata boost)
  5. LLM generation with structured prompts
  6. Confidence calculation
  7. Result caching

- **Re-ranking**:
  - Boosts results with better metadata matches
  - 10% boost for perfect matches
  - Why: Improves relevance when context filters are provided

##### Confidence Calculation (`services/rag/confidence.ts`)
- **Multi-Signal Approach**:
  ```
  confidence = 0.5 * similarity + 0.3 * metadata + 0.2 * llm_score
  ```
- **Why Weighted Combination**:
  - Vector similarity is most reliable (0.5 weight)
  - Metadata matching adds context (0.3 weight)
  - LLM self-assessment is useful but overconfident (0.2 weight)
- **Signals**:
  - `similarity`: Average of top-3 cosine similarities
  - `metadata`: Percentage of metadata fields matching
  - `llm_score`: LLM's self-reported confidence
- **Why Top-3 Average**: Single top score can be an outlier; averaging provides stability

#### 4. API Layer (`src/api/`)

##### Middleware
- **Authentication**: API key for admin endpoints (ingest)
- **Rate Limiting**: 100 req/min per IP (configurable)
- **Metrics Tracking**: Every request logged with latency
- **Error Handling**: Centralized error responses

##### Routes
- **`POST /form-query`**: Public query endpoint
- **`POST /ingest`**: Admin-only ingestion (API key required)
- **`GET /health`**: Health check with dependency status
- **`GET /metrics`**: Prometheus-compatible metrics

## Design Decisions

### Why TypeScript?
- Type safety catches errors at compile time
- Better IDE support and autocomplete
- Self-documenting code with interfaces
- Required for strict mode compliance

### Why ESM (ES Modules)?
- Modern JavaScript standard
- Better tree-shaking for smaller bundles
- Native browser compatibility
- Future-proof

### Why Strict Mode TypeScript?
- Catches more potential bugs
- Forces explicit null/undefined handling
- Better code quality
- Production-ready standards

### Why Docker Compose?
- Single command to start all dependencies
- Consistent development environment
- Easy to deploy
- Version-controlled infrastructure

### Why Pino for Logging?
- Extremely fast (minimal overhead)
- Structured JSON logs
- Built-in serializers for req/res
- PII redaction support
- Pretty printing for development

### Why Express (not Fastify/Koa)?
- Industry standard, well-understood
- Massive ecosystem of middleware
- Simple, unopinionated
- Easy to hire developers who know it

## Performance Characteristics

### Latency Targets
- **Cache Hit**: < 50ms
- **Cache Miss**: 
  - Without LLM: < 500ms
  - With LLM: < 2000ms (depends on OpenAI)
- **Ingestion**: < 5s per 1000 tokens

### Scalability
- **Stateless API**: Horizontal scaling trivial
- **Redis Cache**: Can be clustered
- **Qdrant**: Can be clustered for production
- **Bottleneck**: OpenAI API rate limits

### Memory Usage
- **Redis**: LRU eviction at 256MB (configurable)
- **Node.js**: ~100MB baseline + request overhead
- **Qdrant**: Depends on document count and vector dimensions

## Security Considerations

### PII Protection
- Automatic redaction in logs
- Optional redaction during ingestion
- Patterns: email, SSN, credit card, phone

### Authentication
- API key for write operations
- JWT-ready (middleware provided)
- Rate limiting per IP

### Data Privacy
- Customer data scoped by ID
- Metadata filtering prevents cross-customer leaks
- Redis cache includes customer ID in keys

### Secrets Management
- All secrets via environment variables
- No hardcoded keys
- .env excluded from git
- .env.example provided as template

## Monitoring & Observability

### Metrics (Prometheus Format)
- Query latency (avg, P95)
- Cache hit rate
- Total queries
- Ingestion rate
- Cache statistics

### Logs (Structured JSON)
- Request/response tracking
- Error details with stack traces
- Performance metrics per request
- PII-redacted by default

### Health Checks
- Dependency status (Qdrant, Redis)
- Cache statistics
- Uptime

## Trade-offs & Limitations

### Current Limitations
1. **No semantic chunking**: Uses simple token-based chunking
   - Could be improved with sentence transformers
2. **Simple re-ranking**: Metadata boost only
   - Could use cross-encoder for better results
3. **LLM confidence unreliable**: LLMs tend to be overconfident
   - Weighted at only 20% for this reason
4. **No query expansion**: User query used as-is
   - Could generate multiple query variations

### Why These Trade-offs?
- Focus on production-ready basics over experimental features
- Simple solutions are easier to debug and maintain
- Can be enhanced incrementally
- Good enough for 80% of use cases

## Future Enhancements

### Potential Improvements
1. **Semantic chunking**: Use sentence transformers
2. **Cross-encoder re-ranking**: More accurate than cosine similarity
3. **Query expansion**: Generate multiple queries, combine results
4. **Hybrid search**: Combine dense and sparse (BM25) retrieval
5. **Fine-tuned embeddings**: Domain-specific embeddings
6. **Answer verification**: Check if LLM answer is supported by context
7. **Multi-turn conversations**: Context tracking across queries

### Scaling Considerations
- Redis Cluster for cache
- Qdrant Cluster for vector storage
- Multiple API instances behind load balancer
- Separate read/write paths
- Async ingestion queue

## Testing Strategy

### Unit Tests
- Chunking logic
- Confidence calculation
- Pure functions

### Integration Tests
- API endpoints
- Error cases
- Validation

### Evaluation Harness
- Confidence calibration
- Answer accuracy
- Retrieval quality

### Not Included (but Recommended for Production)
- End-to-end tests with real services
- Load testing
- Chaos engineering
- Penetration testing

## Deployment Recommendations

### Development
- Use docker-compose
- Enable debug logging
- Use .env file

### Staging
- Separate Qdrant/Redis instances
- Production-like data
- Performance testing
- Integration with monitoring

### Production
- Managed Redis (AWS ElastiCache, Azure Cache)
- Managed Qdrant or self-hosted cluster
- HTTPS required
- Enable Redis password
- Enable Qdrant API key
- Use JWT for user authentication
- Set up Prometheus scraping
- Enable log aggregation (CloudWatch, DataDog, etc.)
- Rotate API keys regularly
- Set resource limits (CPU, memory)
- Use health checks in load balancer
- Enable Redis persistence (AOF)
- Backup Qdrant data
- Monitor error rates and latency
