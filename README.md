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
## Azure Migration

This service now supports **Azure-native deployment** with seamless switching between local and Azure services.

### Why Azure?

**Azure AI Search** provides:
- **Hybrid Search**: Combines vector similarity with lexical (BM25) ranking for better results
- **Scalability**: Enterprise-grade search with built-in redundancy
- **Security**: Private endpoints, managed identities, RBAC
- **Integration**: Native integration with Azure OpenAI and other Azure services

**Azure OpenAI** provides:
- **Enterprise Support**: SLA-backed service with Microsoft support
- **Data Residency**: Keep data in your region
- **Managed Service**: No infrastructure management
- **Cost Control**: Fine-grained capacity management

### Quick Start with Azure

#### 1. Deploy Azure Resources

```bash
cd infra
./deploy.sh dev  # For development environment
# OR
./deploy.sh prod # For production environment
```

This provisions all required Azure resources using Bicep templates.

#### 2. Configure Environment

Copy the Azure configuration example:

```bash
cp src/config/azure.env.example .env.azure
```

Update with values from deployment output, then merge with your `.env`:

```bash
cat .env.azure >> .env
```

Key setting - **enable Azure mode**:

```bash
AZURE_MODE=true
```

#### 3. Deploy OpenAI Models

Azure OpenAI requires explicit model deployments:

```bash
az cognitiveservices account deployment create \
  --name <your-openai-resource> \
  --resource-group <resource-group> \
  --deployment-name gpt-4 \
  --model-name gpt-4 \
  --model-version "0613" \
  --model-format OpenAI

az cognitiveservices account deployment create \
  --name <your-openai-resource> \
  --resource-group <resource-group> \
  --deployment-name text-embedding-3-large \
  --model-name text-embedding-3-large \
  --model-version "1" \
  --model-format OpenAI
```

Or use the Azure Portal → Azure OpenAI → Model deployments.

#### 4. Migrate Data

If you have existing data in Qdrant:

```bash
# Option 1: Migrate vectors as-is
npm run migrate:to-azure

# Option 2: Re-index with Azure OpenAI embeddings
npm run migrate:reindex

# Verify migration quality
npm run migrate:verify
```

#### 5. Deploy Application

Deploy to Azure Container Apps or App Service:

```bash
# Container Apps (recommended)
az containerapp update \
  --name <app-name> \
  --resource-group <resource-group> \
  --set-env-vars AZURE_MODE=true

# Or use the deployment script
cd infra
./deploy.sh prod --deploy-app
```

### Azure vs Local Mode Comparison

| Feature | Local Mode (`AZURE_MODE=false`) | Azure Mode (`AZURE_MODE=true`) |
|---------|--------------------------------|--------------------------------|
| **Vector Store** | Qdrant (self-hosted) | Azure AI Search |
| **Search Type** | Vector only | Hybrid (vector + lexical) |
| **LLM/Embeddings** | OpenAI API | Azure OpenAI |
| **Document Storage** | Not available | Azure Blob Storage |
| **Cache** | Local Redis | Azure Cache for Redis |
| **Secrets** | `.env` file | Azure Key Vault (optional) |
| **Monitoring** | Prometheus metrics | Application Insights |
| **Authentication** | API keys in env | Managed Identity (optional) |
| **Cost** | ~$30/month (OpenAI API) | ~$150-250/month (dev)<br>~$600-1200/month (prod) |

### Azure Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client    │────▶│  Container App   │────▶│  Azure OpenAI   │
└─────────────┘     │   (Node.js)      │     └─────────────────┘
                    └──────────────────┘              │
                            │                         │
                    ┌───────┴────────────────────────┴────┐
                    │                                     │
            ┌───────▼────────┐                  ┌────────▼────────┐
            │  Azure AI      │                  │  Blob Storage   │
            │  Search        │                  │  (Documents)    │
            └────────────────┘                  └─────────────────┘
                    │                                     │
            ┌───────▼────────┐                  ┌────────▼────────┐
            │  Azure Cache   │                  │   Key Vault     │
            │  for Redis     │                  │   (Secrets)     │
            └────────────────┘                  └─────────────────┘
                    │
            ┌───────▼────────┐
            │  Application   │
            │  Insights      │
            └────────────────┘
```

### Azure Services Configuration

#### Azure OpenAI
- **Deployments required**: 
  - `gpt-4` or `gpt-35-turbo` for chat completion
  - `text-embedding-3-large` for embeddings
- **Capacity**: Adjust TPM/RPM based on load
- **Region**: Choose region with capacity (e.g., East US, Sweden Central)
- **Note**: Requires special access approval

#### Azure AI Search
- **Index**: Automatically created with vector search enabled
- **Tier**: Basic for dev, Standard or higher for production
- **Vector Config**: HNSW algorithm with cosine similarity
- **Hybrid Search**: Combines vector + BM25 lexical search

#### Azure Blob Storage
- **Container**: `documents` (automatically created)
- **Organization**: Files stored as `{customerId}/{documentId}`
- **Metadata**: Tracked for all documents
- **Access**: Private (no public access)

#### Azure Cache for Redis
- **Tier**: Basic/Standard for dev, Premium for production
- **Eviction**: LRU (allkeys-lru policy)
- **Persistence**: Recommended for production
- **SSL**: Enabled by default (port 6380)

#### Key Vault (Optional)
- **Purpose**: Store secrets securely
- **Access**: Managed Identity or service principal
- **Secrets**: OpenAI keys, Search keys, Storage keys
- **Not required**: Can use environment variables instead

#### Application Insights
- **Telemetry**: Query latency, cache hits, errors
- **Correlation**: Request tracking with IDs
- **Sampling**: Configurable to control costs
- **Dashboards**: Pre-built in Azure Portal

### Feature Flag: AZURE_MODE

The service uses a single feature flag to switch between local and Azure services:

```bash
# Local mode (default) - uses Qdrant, OpenAI API, local Redis
AZURE_MODE=false

# Azure mode - uses Azure AI Search, Azure OpenAI, Azure services
AZURE_MODE=true
```

When `AZURE_MODE=true`, the application automatically:
- Uses Azure OpenAI client instead of standard OpenAI
- Uses Azure AI Search instead of Qdrant
- Stores documents in Azure Blob Storage
- Connects to Azure Cache for Redis (if configured)
- Sends telemetry to Application Insights

**No code changes needed** - just flip the flag!

### Migration Scripts

#### migrate-vectors-to-azure.ts
Migrates existing vectors from Qdrant to Azure AI Search:

```bash
# Dry run (export only, don't import)
npm run migrate:to-azure -- --dry-run

# Full migration with custom batch size
npm run migrate:to-azure -- --batch-size=100

# Export to custom path
npm run migrate:to-azure -- --export-path=/tmp/vectors.ndjson
```

#### reindex-with-azure-embeddings.ts
Re-generates embeddings using Azure OpenAI and indexes to Azure AI Search:

```bash
# Dry run
npm run migrate:reindex -- --dry-run

# Full reindex
npm run migrate:reindex

# Custom batch size (smaller = fewer API calls but slower)
npm run migrate:reindex -- --batch-size=5
```

**When to use**:
- Switching from one embedding model to another
- Old embeddings are incompatible
- Want to ensure consistency with Azure OpenAI embeddings

#### verify-migration.ts
Compares search results between Qdrant and Azure AI Search:

```bash
# Run verification with default queries
npm run migrate:verify

# Test more queries
npm run migrate:verify -- --queries=20

# Different top-k value
npm run migrate:verify -- --top-k=10
```

**Output**:
- Overlap percentage (how many results match)
- Average score difference
- Detailed comparison per query
- Quality assessment

### Cost Considerations

#### Development Environment
- Azure OpenAI: ~$50-100/month (depends on usage)
- Azure AI Search (Basic): ~$75/month
- Blob Storage: ~$5/month
- Redis (Basic): ~$15/month
- Application Insights: ~$5/month
- **Total: ~$150-250/month**

#### Production Environment
- Azure OpenAI (Standard, higher capacity): ~$200-500/month
- Azure AI Search (Standard S1): ~$250/month
- Blob Storage: ~$10/month
- Redis (Premium P1): ~$100/month
- Application Insights: ~$20/month
- Container Apps: ~$50-100/month
- **Total: ~$600-1200/month**

**Cost optimization tips**:
- Use Basic tier for non-critical workloads
- Enable Application Insights sampling
- Use Blob Storage lifecycle policies
- Share Azure OpenAI deployment across environments
- Monitor and adjust capacity based on actual usage

### Deployment Guide

See complete deployment guide in `infra/README.md`:

- Prerequisites and permissions
- Step-by-step deployment
- RBAC configuration
- Troubleshooting
- Rollback procedures

Also see `infra/migration-plan.md` for:
- 7-phase migration timeline (4-5 weeks)
- Blue-green deployment strategy
- Cutover and rollback plans
- Post-migration validation

### Development with Azure

See `dev-setup.md` for local development with Azure integration:

- Using Azure services from local machine
- Hybrid mode (mix of local and Azure)
- Integration testing
- Debugging with Application Insights

### Azure Security Best Practices

1. **Use Managed Identity**: Avoid storing credentials
   ```bash
   AZURE_KEYVAULT_USE_DEFAULT_CREDENTIAL=true
   ```

2. **Store secrets in Key Vault**: Don't commit to git
   ```bash
   AZURE_OPENAI_KEY_SECRET_NAME=openai-api-key
   ```

3. **Enable Private Endpoints**: For production workloads
   - Azure AI Search
   - Blob Storage
   - Redis

4. **Use RBAC**: Fine-grained permissions
   - Reader for read-only access
   - Contributor for full access
   - Separate identities per environment

5. **Monitor Access**: Application Insights tracks all requests
   - Failed authentication attempts
   - Unusual access patterns
   - Performance anomalies

### Troubleshooting Azure Deployment

See `infra/TROUBLESHOOTING.md` for comprehensive troubleshooting guide.

Common issues:

#### "Azure OpenAI resource not found"
- **Cause**: OpenAI resource requires special approval
- **Solution**: Apply at https://aka.ms/oai/access
- **Timeline**: Can take days to weeks

#### "Deployment not found"
- **Cause**: Models not deployed in Azure OpenAI
- **Solution**: Deploy models via Azure Portal or CLI
- **Models needed**: `gpt-4`, `text-embedding-3-large`

#### "Failed to authenticate"
- **Cause**: Managed Identity not configured
- **Solution**: Use API keys initially, or configure RBAC

#### "Index not found"
- **Cause**: Azure Search index not created
- **Solution**: Run app once to auto-create, or create manually

For more issues, see `infra/TROUBLESHOOTING.md`.

### API Compatibility

✅ **All existing APIs remain unchanged** when switching to Azure mode:

- `POST /form-query`: Same request/response format
- `POST /ingest`: Same request/response format  
- `GET /health`: Same format (adds Azure service status)
- `GET /metrics`: Same Prometheus format

**Confidence calculation** remains consistent:
- Same weighted formula (50% similarity, 30% metadata, 20% LLM)
- Azure Search provides both vector and lexical scores
- Final confidence score format unchanged

**Switching is transparent** to API clients!

### Documentation

- **[dev-setup.md](./dev-setup.md)**: Local development guide
- **[CHANGELOG.md](./CHANGELOG.md)**: Migration changes and notes
- **[infra/README.md](./infra/README.md)**: Infrastructure deployment
- **[infra/migration-plan.md](./infra/migration-plan.md)**: Production migration guide
- **[infra/TROUBLESHOOTING.md](./infra/TROUBLESHOOTING.md)**: Common issues

### Getting Help

- Check `infra/TROUBLESHOOTING.md` for common issues
- Review Application Insights for runtime errors
- Check Azure Portal service health
- Review deployment logs in Azure
- See `dev-setup.md` for development issues

