# Development Setup Guide

This guide covers setting up the RAG service for local development with Azure integration.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development (Non-Azure)](#local-development-non-azure)
- [Azure Integration Development](#azure-integration-development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required
- **Node.js**: Version 20 or higher
- **npm**: Latest version
- **Docker**: For local dependencies (Qdrant, Redis)
- **Git**: For version control

### Optional (for Azure integration)
- **Azure CLI**: For Azure resource management
- **Azure subscription**: For deploying and testing Azure services
- **OpenAI API Key** OR **Azure OpenAI access**

## Local Development (Non-Azure)

This mode uses local services (Qdrant, OpenAI API) and is the default.

### Step 1: Clone and Install

```bash
git clone <repository-url>
cd rag-test
npm install
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Azure Mode - KEEP FALSE for local development
AZURE_MODE=false

# OpenAI API (direct)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Local services
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379
```

### Step 3: Start Dependencies

```bash
# Start Qdrant and Redis
docker-compose up qdrant redis -d

# Verify they're running
docker-compose ps
```

### Step 4: Run the Application

```bash
# Development mode with auto-reload
npm run start:dev

# Or build and run production mode
npm run build
npm start
```

### Step 5: Load Sample Data

```bash
npm run load-sample-data
```

### Step 6: Test the API

```bash
# Health check
curl http://localhost:3000/health

# Sample query
curl -X POST http://localhost:3000/form-query \
  -H "Content-Type: application/json" \
  -d '{
    "formQuestion": "What is your returns policy?",
    "customerId": "cust-123"
  }'
```

## Azure Integration Development

This mode allows you to develop with Azure services for testing the Azure integration.

### Step 1: Azure Prerequisites

1. **Azure Subscription**: You need an active Azure subscription

2. **Azure OpenAI Access**: Apply for access at https://aka.ms/oai/access
   - This can take several days to weeks for approval
   - You'll receive an email when approved

3. **Install Azure CLI**:
   ```bash
   # macOS
   brew install azure-cli
   
   # Windows
   winget install Microsoft.AzureCLI
   
   # Linux
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   ```

4. **Login to Azure**:
   ```bash
   az login
   az account set --subscription <your-subscription-id>
   ```

### Step 2: Deploy Azure Resources (Development)

```bash
cd infra

# Deploy development environment
./deploy.sh dev

# Note the output values - you'll need them for configuration
```

This deploys:
- Azure OpenAI resource
- Azure AI Search
- Azure Blob Storage
- Azure Cache for Redis
- Key Vault
- Application Insights

**Cost**: ~$150-250/month for development tier

### Step 3: Configure Azure Environment

```bash
cp src/config/azure.env.example .env.azure
```

Edit `.env.azure` with values from deployment:

```bash
# Enable Azure mode
AZURE_MODE=true

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/
AZURE_OPENAI_KEY=your-key-here
AZURE_OPENAI_GENERATION_DEPLOYMENT=gpt-4
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large

# Azure AI Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_API_KEY=your-search-key
AZURE_SEARCH_INDEX_NAME=rag-documents

# Azure Blob Storage
AZURE_BLOB_ACCOUNT_NAME=yourstorageaccount
AZURE_BLOB_CONTAINER_NAME=documents
AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=https;...

# Azure Cache for Redis
AZURE_REDIS_CONNECTION_STRING=your-redis.redis.cache.windows.net:6380,password=...

# Optional: Key Vault (recommended for production)
AZURE_KEYVAULT_URL=https://your-keyvault.vault.azure.net/
AZURE_KEYVAULT_USE_DEFAULT_CREDENTIAL=false

# Application Insights
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
```

Merge with your base `.env`:

```bash
cat .env.azure >> .env
```

### Step 4: Deploy OpenAI Models

Azure OpenAI requires deploying models before use:

```bash
# Deploy GPT-4 for generation
az cognitiveservices account deployment create \
  --name <your-openai-resource> \
  --resource-group <resource-group> \
  --deployment-name gpt-4 \
  --model-name gpt-4 \
  --model-version "0613" \
  --model-format OpenAI \
  --sku-name "Standard" \
  --sku-capacity 10

# Deploy text-embedding-3-large for embeddings
az cognitiveservices account deployment create \
  --name <your-openai-resource> \
  --resource-group <resource-group> \
  --deployment-name text-embedding-3-large \
  --model-name text-embedding-3-large \
  --model-version "1" \
  --model-format OpenAI \
  --sku-name "Standard" \
  --sku-capacity 10
```

Or use the Azure Portal:
1. Go to your Azure OpenAI resource
2. Navigate to "Model deployments"
3. Click "Create new deployment"
4. Select model and configure capacity

### Step 5: Run with Azure Services

```bash
# Start local Redis for development (Azure Redis is optional for dev)
docker-compose up redis -d

# Run application in Azure mode
npm run start:dev

# Check logs to verify Azure mode is active
# You should see: "Using Azure OpenAI client" and "Using Azure AI Search vector store"
```

### Step 6: Load Sample Data to Azure

```bash
# This will use Azure OpenAI for embeddings and Azure AI Search for storage
npm run load-sample-data
```

### Step 7: Test Azure Integration

```bash
# Test query with Azure services
curl -X POST http://localhost:3000/form-query \
  -H "Content-Type: application/json" \
  -d '{
    "formQuestion": "What is your returns policy?",
    "customerId": "cust-123"
  }'

# Check Application Insights for telemetry
# Go to Azure Portal -> Application Insights -> Transaction search
```

## Hybrid Development (Recommended)

You can mix local and Azure services during development:

### Option 1: Azure OpenAI + Local Vector Store
```bash
AZURE_MODE=false
# Use regular OpenAI config, but point to Azure
OPENAI_API_KEY=<use Azure OpenAI key>
# Use local Qdrant
QDRANT_URL=http://localhost:6333
```

### Option 2: Local OpenAI + Azure Search
```bash
AZURE_MODE=true
# This will use Azure AI Search but you can still use local OpenAI for embeddings
```

## Testing

### Run Unit Tests

```bash
npm test
# or
npm run test:unit
```

### Run Integration Tests

```bash
# Start local services first
docker-compose up qdrant redis -d

# Run integration tests
npm run test:integration
```

### Test with Azure Services

```bash
# Set AZURE_MODE=true in .env
AZURE_MODE=true npm test
```

### Run Migration Scripts (Test Mode)

```bash
# Dry run migration
npm run migrate:to-azure -- --dry-run

# Verify migration quality
npm run migrate:verify
```

## Linting and Formatting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck
```

## Common Development Workflows

### Adding New Documents

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

### Switching Between Local and Azure

1. **To Azure**:
   ```bash
   # Update .env
   AZURE_MODE=true
   
   # Restart application
   npm run start:dev
   ```

2. **To Local**:
   ```bash
   # Update .env
   AZURE_MODE=false
   
   # Make sure Qdrant is running
   docker-compose up qdrant -d
   
   # Restart application
   npm run start:dev
   ```

### Migrating Data Between Environments

```bash
# Export from Qdrant, import to Azure
AZURE_MODE=false npm run migrate:to-azure

# Re-index with Azure embeddings
AZURE_MODE=true npm run migrate:reindex

# Verify migration
npm run migrate:verify
```

## Troubleshooting

### "OPENAI_API_KEY is required"

**Solution**: Make sure `.env` file exists with `OPENAI_API_KEY` set, or set `AZURE_MODE=true` with Azure OpenAI configured.

### "Failed to initialize vector store"

**Solution**: 
- **Local mode**: Ensure Qdrant is running: `docker-compose up qdrant -d`
- **Azure mode**: Check Azure Search endpoint and API key in `.env`

### "Azure OpenAI deployment not found"

**Solution**: Verify deployment names match in `.env`:
```bash
AZURE_OPENAI_GENERATION_DEPLOYMENT=gpt-4
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large
```

### Redis connection errors

**Solution**:
- **Local**: `docker-compose up redis -d`
- **Azure**: Check connection string format

### Rate limiting errors

**Solution**:
- **Azure OpenAI**: Increase deployment capacity (TPM/RPM)
- **Standard OpenAI**: Wait or upgrade tier
- Both: Application automatically retries with backoff

### Application Insights not receiving data

**Solution**:
- Verify connection string is correct
- Check that telemetry is initialized (look for log: "Application Insights telemetry initialized")
- Data can take 2-5 minutes to appear in Azure Portal

### "Cannot find module" errors

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### TypeScript compilation errors

**Solution**:
```bash
# Check TypeScript version
npx tsc --version

# Clean and rebuild
rm -rf dist
npm run build
```

## Performance Tips

### Local Development
- Use `LOG_LEVEL=info` instead of `debug` for better performance
- Reduce `RAG_TOP_K` to 3 for faster queries during development
- Use smaller chunk sizes if testing with large documents

### Azure Development
- Use lower-tier resources for development (save costs)
- Consider shared OpenAI deployment across team
- Use Application Insights sampling to reduce data ingestion costs

## Environment Variables Quick Reference

See `.env.example` for complete list. Key variables:

- `AZURE_MODE`: Enable/disable Azure services
- `OPENAI_API_KEY`: OpenAI API key (local mode)
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint (Azure mode)
- `QDRANT_URL`: Qdrant connection (local mode)
- `AZURE_SEARCH_ENDPOINT`: Azure Search endpoint (Azure mode)
- `LOG_LEVEL`: Logging verbosity (debug, info, warn, error)

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- See [README.md](./README.md) for API documentation
- Check [CHANGELOG.md](./CHANGELOG.md) for recent changes
- Review [infra/migration-plan.md](./infra/migration-plan.md) for production deployment
