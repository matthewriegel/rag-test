# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Azure Migration

### Added

#### Azure Services Integration
- **Azure OpenAI Support**: Complete integration with Azure OpenAI for embeddings and chat completion
  - Support for both API key and Managed Identity authentication
  - Compatible with `text-embedding-3-large` and GPT-4 deployments
  - Automatic retry logic with exponential backoff
  
- **Azure AI Search (Cognitive Search)**: Vector + hybrid search capabilities
  - HNSW algorithm for efficient vector search
  - Lexical search with BM25 ranking
  - Semantic search configurations
  - Automatic index creation and management
  
- **Azure Blob Storage**: Document storage and management
  - Hierarchical organization by customerId
  - Support for connection string, account key, or Managed Identity
  - Metadata tracking for all uploaded documents
  
- **Azure Key Vault**: Centralized secrets management
  - Optional integration using DefaultAzureCredential
  - Secret caching for performance
  - Fallback to environment variables in development
  
- **Application Insights**: Telemetry and monitoring
  - OpenTelemetry integration
  - Custom event, metric, and dependency tracking
  - Operation duration tracking

#### Configuration & Deployment
- **Feature Flag**: `AZURE_MODE` environment variable to switch between Azure and local services
  - `AZURE_MODE=true`: Use Azure OpenAI, AI Search, Blob Storage
  - `AZURE_MODE=false`: Use local OpenAI API, Qdrant, no blob storage (default)
  
- **Azure Configuration Files**:
  - `src/config/azure.ts`: Centralized Azure service configuration
  - `src/config/azure.env.example`: Example environment variables for Azure mode
  - Comprehensive parameter validation and error messages

- **Infrastructure as Code**: Production-ready Bicep templates
  - `infra/main.bicep`: Complete Azure resource provisioning
  - Support for development, staging, and production environments
  - Automated deployment scripts with validation and rollback
  - Estimated costs and RBAC documentation

#### Migration Tools
- **Vector Migration Script** (`scripts/migrate-vectors-to-azure.ts`):
  - Export vectors from Qdrant to NDJSON format
  - Import to Azure AI Search with batch processing
  - Dry-run mode for testing
  - Progress tracking and error handling
  
- **Reindexing Script** (`scripts/reindex-with-azure-embeddings.ts`):
  - Re-generate embeddings using Azure OpenAI
  - Batch processing with rate limit handling
  - Useful when changing embedding models or dimensions
  
- **Verification Script** (`scripts/verify-migration.ts`):
  - Compare search results between Qdrant and Azure AI Search
  - Calculate overlap and score differences
  - Generate quality assessment report

#### Documentation
- **Infrastructure Documentation** (`infra/`):
  - `README.md`: Deployment guide with cost estimates
  - `migration-plan.md`: Complete 7-phase migration timeline
  - `TROUBLESHOOTING.md`: Common issues and solutions
  - `INDEX.md`: Quick reference and architecture overview
  
- **Development Setup** (`dev-setup.md`):
  - Local development with Azure resources
  - Integration testing guide
  - Troubleshooting common issues

### Changed

- **OpenAI Client**: Extended to support confidence score requests
  - Added `requestConfidenceScore` option to `generateCompletion()`
  - Automatically appends confidence instruction to system messages
  - Compatible with both standard and Azure OpenAI clients
  
- **Vector Store Interface**: Abstracted for Azure/local switching
  - Factory pattern for client selection based on `AZURE_MODE`
  - Identical interface for both Qdrant and Azure AI Search
  - Seamless switching without code changes
  
- **Docker Compose**: Updated for Azure mode support
  - Environment variable `AZURE_MODE` controls service usage
  - Qdrant can be disabled when using Azure AI Search
  - Redis remains active for both modes (local or Azure Cache)
  
- **Package Dependencies**: Added Azure SDKs
  - `@azure/openai`: Azure OpenAI client
  - `@azure/search-documents`: Azure AI Search
  - `@azure/storage-blob`: Blob storage
  - `@azure/identity`: Authentication and credentials
  - `@azure/keyvault-secrets`: Key Vault integration
  - `@azure/monitor-opentelemetry`: Application Insights

### Maintained

- **API Compatibility**: All existing endpoints unchanged
  - `POST /form-query`: Identical request/response format
  - `POST /ingest`: Identical request/response format
  - `GET /health`: Identical response (includes vector store type)
  - `GET /metrics`: Identical Prometheus format
  
- **Confidence Calculation**: Preserved algorithm and output format
  - Same weighted combination: 50% similarity, 30% metadata, 20% LLM
  - Compatible with both Qdrant and Azure AI Search scores
  - Azure Search provides both vector similarity and lexical scores
  
- **Caching Behavior**: Redis caching unchanged
  - Query result caching (1 hour TTL)
  - Embedding caching (7 days TTL)
  - Customer data caching (24 hours TTL)
  - Works with both local Redis and Azure Cache for Redis
  
- **Testing**: Existing tests continue to work
  - Unit tests for chunking and confidence
  - Integration tests for API endpoints
  - Mock implementations for Azure services in test mode

### Migration Path

#### For Development
1. Set `AZURE_MODE=false` (default) to continue using local services
2. Run with `docker-compose up` as before
3. No changes needed to existing workflows

#### For Azure Deployment
1. Provision Azure resources using Bicep templates (`infra/deploy.sh`)
2. Configure environment variables in Azure (App Service/Container App)
3. Set `AZURE_MODE=true` in production environment
4. Run migration scripts to transfer data:
   ```bash
   npm run migrate:to-azure        # Migrate existing vectors
   # OR
   npm run migrate:reindex         # Re-index with new embeddings
   npm run migrate:verify          # Verify migration quality
   ```

### Breaking Changes

**None** - This is a backward-compatible migration. Existing functionality is preserved.

### Security Enhancements

- **Managed Identity**: Support for keyless authentication in Azure
- **Key Vault Integration**: Centralized secret management (optional)
- **Private Endpoints**: Bicep templates include options for network isolation
- **RBAC**: Fine-grained role assignments in infrastructure templates

### Performance Considerations

- **Azure AI Search**: Comparable or better performance than Qdrant for most workloads
  - HNSW algorithm optimized for vector search
  - Hybrid search combines vector and lexical ranking
  
- **Azure OpenAI**: May have different rate limits than direct OpenAI API
  - Configure deployment capacity based on expected load
  - Built-in retry logic handles rate limiting
  
- **Blob Storage**: Adds latency for document retrieval
  - Consider caching original documents in Redis if frequently accessed
  - Async upload to avoid blocking ingestion pipeline

### Cost Impact

See `infra/README.md` for detailed cost estimates:
- **Development**: ~$150-250/month
- **Production**: ~$600-1200/month (depends on scale)

### Notes

- Azure OpenAI resource requires special access approval (https://aka.ms/oai/access)
- Some regions may not support all Azure AI services
- Recommend gradual migration with parallel running for validation
- Monitor Application Insights for performance after migration

## Previous Versions

### [1.0.0] - Initial Release
- Production-ready RAG service with OpenAI, Qdrant, and Redis
- Confidence scoring with multi-signal approach
- Comprehensive caching and retry logic
- Docker deployment support
