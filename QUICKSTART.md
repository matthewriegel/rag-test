# Quick Start Guide

Get the RAG service up and running in 5 minutes.

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- OpenAI API key

## Step 1: Clone and Install

```bash
git clone <repository-url>
cd rag-test
npm install
```

## Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

## Step 3: Start Services

```bash
docker-compose up -d
```

This starts:
- API server (port 3000)
- Qdrant vector database (port 6333)
- Redis cache (port 6379)

Check status:
```bash
docker-compose ps
```

## Step 4: Load Sample Data

```bash
npm run load-sample-data
```

This ingests sample documents about:
- Customer service policies
- Product catalog
- FAQ

## Step 5: Test the Service

### Health Check
```bash
curl http://localhost:3000/health
```

### Ask a Question
```bash
curl -X POST http://localhost:3000/form-query \
  -H "Content-Type: application/json" \
  -d '{
    "formQuestion": "What is your returns policy?",
    "customerId": "cust-123"
  }'
```

Expected response:
```json
{
  "answer": "All items can be returned within 30 days of purchase...",
  "dataPath": ["customer-handbook-001#chunk0"],
  "confidence": 0.87,
  "sources": [
    {
      "docId": "customer-handbook-001",
      "chunkIndex": 0,
      "similarity": 0.92
    }
  ],
  "debug": {
    "llm_reasoning": "Found explicit returns policy..."
  }
}
```

### More Example Queries

**Shipping question:**
```bash
curl -X POST http://localhost:3000/form-query \
  -H "Content-Type: application/json" \
  -d '{
    "formQuestion": "How long does standard shipping take?"
  }'
```

**Product question:**
```bash
curl -X POST http://localhost:3000/form-query \
  -H "Content-Type: application/json" \
  -d '{
    "formQuestion": "How much do the wireless headphones cost?",
    "customerId": "cust-123"
  }'
```

## Step 6: Ingest Your Own Data

```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: development-api-key" \
  -d '{
    "documentId": "my-doc-001",
    "content": "Your document content here...",
    "customerId": "your-customer-id",
    "metadata": {
      "type": "manual",
      "version": "1.0"
    }
  }'
```

## Step 7: Monitor

### View Metrics
```bash
curl http://localhost:3000/metrics
```

### View Logs
```bash
docker-compose logs -f api
```

## Common Operations

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### Reset Database
```bash
npm run reset-db
```

### Run Evaluation
```bash
npm run evaluate
```

### View Qdrant Dashboard
Open http://localhost:6333/dashboard in your browser

## Development Mode

For development with auto-reload:

```bash
# Start dependencies only
docker-compose up -d qdrant redis

# Run API in development mode
npm run start:dev
```

## Troubleshooting

### "OPENAI_API_KEY is required"
Make sure you've set the API key in `.env`

### Services not starting
```bash
docker-compose down
docker-compose up -d
docker-compose ps
```

### Clear all data
```bash
docker-compose down -v
docker-compose up -d
npm run reset-db
npm run load-sample-data
```

### Check service health
```bash
curl http://localhost:3000/health
```

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions
- Explore the code in `src/`
- Customize configuration in `.env`
- Add your own documents via `/ingest` endpoint
- Set up Prometheus monitoring
- Deploy to production (see README for deployment guide)

## Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` in `.env`
- [ ] Change `API_KEY` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Set `LOG_LEVEL=info`
- [ ] Enable Redis password
- [ ] Enable Qdrant API key
- [ ] Set up HTTPS
- [ ] Configure proper rate limits
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Set up backups for Qdrant
- [ ] Enable Redis persistence
- [ ] Review security settings

## Support

For issues and questions:
- Check [README.md](README.md) for detailed documentation
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for design details
- Open a GitHub issue

Enjoy using the RAG service!
