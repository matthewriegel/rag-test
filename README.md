# RAG Service

A production-ready Retrieval-Augmented-Generation (RAG) service built with Node.js, TypeScript, OpenAI, Qdrant, and Redis.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Service](#running-the-service)
- [API Documentation](#api-documentation)
- [Confidence Calculation](#confidence-calculation)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Overview

This RAG service provides intelligent question-answering capabilities by combining vector search with large language models. It ingests documents, creates embeddings, stores them in a vector database, and retrieves relevant context to generate accurate answers to user queries.

## Architecture

### High-Level Components

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│  Express API │────▶│   OpenAI    │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ├──────────────┐
                           ▼              ▼
                    ┌─────────────┐ ┌──────────┐
                    │   Qdrant    │ │  Redis   │
                    │  (Vectors)  │ │ (Cache)  │
                    └─────────────┘ └──────────┘
```

### Directory Structure

```
src/
├── config/              # Configuration and types
├── lib/
│   ├── openai/         # OpenAI client with retry logic
│   ├── embeddings/     # Text chunking and embedding
│   ├── vectorStore/    # Qdrant vector database adapter
│   ├── cache/          # Redis caching layer
│   └── logger.ts       # Structured logging with PII redaction
├── services/
│   ├── ingest/         # Document ingestion pipeline
│   └── rag/            # RAG query processing and confidence
├── api/
│   ├── middleware/     # Auth, rate limiting, metrics
│   └── routes/         # API endpoints
└── tests/              # Unit and integration tests
```

## Features

- **Intelligent RAG Pipeline**: Vector search + LLM generation with confidence scoring
- **Idempotent Ingestion**: Safe document updates with automatic deduplication
- **Multi-layer Caching**: Redis-based caching for queries, embeddings, and customer data
- **Confidence Scoring**: Weighted combination of similarity, metadata, and LLM confidence
- **Production Ready**: 
  - Automatic retries with exponential backoff
  - Structured logging with PII redaction
  - Rate limiting and authentication
  - Health checks and Prometheus metrics
  - Docker deployment ready

## Technology Stack

- **Runtime**: Node.js 20+ (ESM)
- **Language**: TypeScript (strict mode)
- **Framework**: Express
- **LLM**: OpenAI GPT-4 Turbo Preview
- **Embeddings**: OpenAI text-embedding-3-large (3072 dimensions)
- **Vector DB**: Qdrant (self-hosted)
- **Cache**: Redis with LRU eviction
- **Package Manager**: npm

## Prerequisites

- Node.js 20 or higher
- Docker and Docker Compose (for running dependencies)
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd rag-test
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```bash
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Optional (defaults provided)
PORT=3000
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
```

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

**Key configurations:**

- **Cache TTLs**:
  - `CACHE_QUERY_TTL`: Query result cache (default: 3600s / 1 hour)
  - `CACHE_CUSTOMER_TTL`: Customer data cache (default: 86400s / 24 hours)
  - `CACHE_EMBEDDING_TTL`: Embedding cache (default: 604800s / 7 days)

- **RAG Settings**:
  - `RAG_TOP_K`: Number of results to retrieve (default: 5)
  - `RAG_CHUNK_SIZE`: Tokens per chunk (default: 500)
  - `RAG_CHUNK_OVERLAP`: Token overlap between chunks (default: 100)

- **Confidence Weights** (must sum to 1.0):
  - `CONFIDENCE_WEIGHT_SIMILARITY`: 0.5 (vector similarity)
  - `CONFIDENCE_WEIGHT_METADATA`: 0.3 (metadata matching)
  - `CONFIDENCE_WEIGHT_LLM`: 0.2 (LLM self-confidence)

### Why Qdrant and Redis?

**Qdrant** was chosen for vector storage because:
- Fast cosine similarity search
- Built-in filtering capabilities
- Easy self-hosting with Docker
- REST API for simple integration
- Production-ready with good performance

**Redis** is used for caching because:
- Sub-millisecond latency for cache hits
- LRU eviction policy handles memory constraints
- Persistence options available
- Simple key-value model perfect for our use cases:
  - Query result caching
  - Customer data caching
  - Embedding caching

## Running the Service

### Using Docker Compose (Recommended)

Start all services (API, Qdrant, Redis):

```bash
docker-compose up
```

The API will be available at `http://localhost:3000`.

### Local Development

1. Start Qdrant and Redis:
```bash
docker-compose up qdrant redis
```

2. Run the development server:
```bash
npm run start:dev
```

### Loading Sample Data

```bash
npm run load-sample-data
```

This will ingest sample documents about customer service, products, and FAQs.

## API Documentation

### POST /form-query

Process a question using RAG.

**Request:**
```json
{
  "formQuestion": "What is your returns policy?",
  "customerId": "cust-123",
  "context": {
    "source": "web"
  }
}
```

**Response:**
```json
{
  "answer": "All items can be returned within 30 days of purchase for a full refund...",
  "dataPath": [
    "customer-handbook-001#chunk0"
  ],
  "confidence": 0.87,
  "sources": [
    {
      "docId": "customer-handbook-001",
      "chunkIndex": 0,
      "similarity": 0.92
    }
  ],
  "debug": {
    "llm_reasoning": "Found explicit returns policy in customer handbook"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/form-query \
  -H "Content-Type: application/json" \
  -d '{
    "formQuestion": "What is your returns policy?",
    "customerId": "cust-123"
  }'
```

### POST /ingest

Ingest a document (requires API key).

**Request:**
```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "documentId": "doc-001",
    "customerId": "cust-123",
    "content": "Your document content here...",
    "metadata": {
      "type": "policy",
      "version": "1.0"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "documentId": "doc-001",
  "chunksCreated": 5
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-02-01T00:00:00.000Z",
  "services": {
    "vectorStore": "connected",
    "cache": "connected"
  },
  "cache": {
    "keys": 42,
    "memory": "2.5M",
    "hits": 150,
    "misses": 50
  }
}
```

### GET /metrics

Prometheus-compatible metrics endpoint.

Returns metrics in Prometheus text format including:
- Query latency (average and P95)
- Cache hit rate
- Total queries processed
- Ingestion count

## Confidence Calculation

The service calculates a final confidence score (0-1) using a weighted combination of three signals:

### Signals

1. **Similarity Score** (simScore): Average cosine similarity of top-3 search results
2. **Metadata Score** (metaScore): Quality of metadata matching (customerId, etc.)
3. **LLM Score** (llmScore): LLM's self-reported confidence

### Formula

```
finalConfidence = 
  (0.5 × simScore) + 
  (0.3 × metaScore) + 
  (0.2 × llmScore)
```

### Example Calculation

Given:
- simScore = 0.76 (top-3 average similarity)
- metaScore = 0.90 (90% metadata match)
- llmScore = 0.70 (LLM confidence)

Steps:
1. Similarity component: 0.5 × 0.76 = 0.380
2. Metadata component: 0.3 × 0.90 = 0.270
3. LLM component: 0.2 × 0.70 = 0.140
4. Sum: 0.380 + 0.270 + 0.140 = 0.790
5. Final: 0.79 (rounded to 2 decimals)

## Development

### Building

```bash
npm run build
```

Output will be in `dist/` directory.

### Linting and Formatting

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
npm run format        # Format code with Prettier
```

### Type Checking

```bash
npm run typecheck
```

## Testing

### Run All Tests

```bash
npm test
```

### Unit Tests Only

```bash
npm run test:unit
```

### Integration Tests Only

```bash
npm run test:integration
```

### Test Coverage

Tests are located in `src/tests/`:
- `unit/`: Unit tests for chunking, confidence calculation
- `integration/`: API integration tests

## Deployment

### Azure Deployment (Recommended for Production)

**This service includes comprehensive Azure infrastructure templates for production deployment.**

See the [`/infra`](/infra) directory for:
- **Bicep templates** for automated Azure resource provisioning
- **Deployment scripts** with validation and rollback support
- **Migration guide** from existing systems to Azure
- **Cost estimates** and optimization tips
- **Security best practices** and RBAC configuration

Quick start:
```bash
cd infra
./deploy.sh dev  # Deploy to development environment
```

The Azure deployment includes:
- ✅ Azure OpenAI (GPT-4 + embeddings)
- ✅ Azure Cognitive Search (vector + hybrid search)
- ✅ Azure Cache for Redis
- ✅ Azure Blob Storage
- ✅ Azure Key Vault (secrets management)
- ✅ Application Insights (monitoring)
- ✅ Container Apps (auto-scaling hosting)
- ✅ Managed Identity (secure authentication)

📖 **Full documentation**: [`/infra/README.md`](/infra/README.md)

### Docker Production Build

For non-Azure deployments:

1. Build the image:
```bash
docker build -t rag-service:latest .
```

2. Run with docker-compose:
```bash
docker-compose up -d
```

### Environment Setup

For production deployment:

1. Set strong secrets:
   - Generate secure `JWT_SECRET`
   - Generate secure `API_KEY`
   - Use production OpenAI/Azure OpenAI key

2. Configure proper logging:
   - Set `LOG_LEVEL=info` (not debug)
   - Set `NODE_ENV=production`

3. Set up persistence:
   - Mount volumes for Qdrant data (or use Azure Search)
   - Configure Redis persistence (AOF) (or use Azure Cache for Redis)

4. For Azure deployments:
   - Set `AZURE_MODE=true`
   - Configure Azure service endpoints (see `/infra/.env.azure.example`)
   - Use Managed Identity for authentication

## Security

### PII Redaction

The service automatically redacts common PII patterns:
- Email addresses
- Phone numbers
- SSNs
- Credit card numbers

PII is redacted in logs and optionally during ingestion.

### Authentication

- **Admin endpoints** (/ingest): Require API key via `x-api-key` header
- **Query endpoints**: Public (add JWT auth if needed via middleware)

### Rate Limiting

Default: 100 requests per minute per IP. Configurable via environment variables.

### Best Practices

- Never commit `.env` file
- Rotate API keys regularly
- Use HTTPS in production
- Enable Redis password protection
- Consider Qdrant API key in production

## Monitoring

### Prometheus Metrics

Available at `/metrics`:

- `rag_uptime_seconds`: Service uptime
- `rag_total_queries`: Total queries processed
- `rag_cache_hit_rate`: Cache effectiveness
- `rag_query_latency_avg_ms`: Average query latency
- `rag_query_latency_p95_ms`: P95 query latency
- `rag_ingestion_total`: Documents ingested

### Logs

Structured JSON logs (pino) with:
- Request/response tracking
- Error details
- Performance metrics
- PII redaction

### Health Checks

- Docker health check on `/health`
- Verifies Qdrant and Redis connectivity
- Returns cache statistics

## Troubleshooting

### Common Issues

**"OPENAI_API_KEY is required but not set"**
- Ensure `.env` file exists with valid API key
- Check that `dotenv` is loading correctly

**"Failed to initialize vector store"**
- Verify Qdrant is running: `docker-compose ps`
- Check Qdrant URL in environment
- Review Qdrant logs: `docker-compose logs qdrant`

**"Redis connection error"**
- Verify Redis is running
- Check Redis URL configuration
- Review Redis logs: `docker-compose logs redis`

**Rate limit errors**
- Adjust `RATE_LIMIT_MAX_REQUESTS` in `.env`
- Consider implementing per-user rate limits

**Low confidence scores**
- Check quality of ingested documents
- Verify chunk size is appropriate
- Review search results in debug output
- Adjust confidence weights if needed

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug npm run start:dev
```

### Database Reset

To clear all data and start fresh:
```bash
npm run reset-db
```

## Scripts

- `npm start`: Run production build
- `npm run start:dev`: Development server with auto-reload
- `npm run build`: Build TypeScript to JavaScript
- `npm test`: Run all tests
- `npm run lint`: Check code quality
- `npm run load-sample-data`: Load example data
- `npm run reset-db`: Clear all data

## License

MIT

## Support

For issues and questions, please open a GitHub issue.