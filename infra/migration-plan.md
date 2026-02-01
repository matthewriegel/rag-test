# Azure Migration Plan for RAG Service

This document outlines the complete migration plan for moving the RAG service from the current deployment (likely local/Docker/other cloud) to Azure.

## Table of Contents
- [Migration Overview](#migration-overview)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Strategy](#migration-strategy)
- [Detailed Migration Steps](#detailed-migration-steps)
- [Data Migration](#data-migration)
- [Cutover Plan](#cutover-plan)
- [Rollback Plan](#rollback-plan)
- [Post-Migration Validation](#post-migration-validation)
- [Success Criteria](#success-criteria)

## Migration Overview

### Current State
- Service running on: [Docker/VM/Other Cloud Provider]
- Vector Database: Qdrant
- Cache: Redis (self-hosted or cloud)
- Document Storage: Local filesystem or S3-compatible storage
- LLM Provider: OpenAI API
- Monitoring: Basic logging

### Target State (Azure)
- Service: Azure Container Apps
- Vector Database: Azure Cognitive Search with vector capabilities
- Cache: Azure Cache for Redis
- Document Storage: Azure Blob Storage
- LLM Provider: Azure OpenAI Service
- Monitoring: Application Insights + Log Analytics
- Security: Azure Key Vault + Managed Identity

### Migration Type
**Blue-Green Deployment with Gradual Traffic Shift**
- Build complete Azure environment (Green)
- Migrate data
- Test thoroughly
- Gradually shift traffic
- Keep old environment (Blue) for rollback
- Decommission old environment after validation period

### Estimated Timeline
- **Phase 1 - Planning & Preparation**: 1 week
- **Phase 2 - Infrastructure Setup**: 1 week
- **Phase 3 - Data Migration**: 3-5 days
- **Phase 4 - Testing**: 1 week
- **Phase 5 - Cutover**: 1 day
- **Phase 6 - Post-Migration Validation**: 1 week
- **Phase 7 - Decommissioning**: 1 week

**Total: 4-5 weeks** (with buffer for issues)

## Pre-Migration Checklist

### Azure Prerequisites

- [ ] **Azure Subscription**
  - [ ] Active subscription with sufficient credits/budget
  - [ ] Appropriate resource quotas (check OpenAI, Search, Redis quotas)
  - [ ] Cost alerts configured

- [ ] **Azure OpenAI Access**
  - [ ] Applied for access at https://aka.ms/oai/access
  - [ ] Received approval confirmation email
  - [ ] Verified access by attempting to create a resource
  - [ ] Identified available regions for Azure OpenAI

- [ ] **Permissions & Access**
  - [ ] Subscription Owner or Contributor + User Access Administrator role
  - [ ] Ability to create resource groups
  - [ ] Ability to assign RBAC roles
  - [ ] Azure CLI installed and configured locally
  - [ ] Authenticated to correct subscription

- [ ] **Networking (if using Private Endpoints)**
  - [ ] Virtual Network design completed
  - [ ] Subnet allocation planned
  - [ ] Private DNS zones identified
  - [ ] ExpressRoute/VPN configured (if hybrid)

### Application Prerequisites

- [ ] **Codebase Readiness**
  - [ ] Azure client wrappers implemented and tested
  - [ ] Environment variable configuration supports Azure mode
  - [ ] Health check endpoint implemented
  - [ ] Graceful shutdown handlers implemented
  - [ ] All tests passing

- [ ] **Container Image**
  - [ ] Dockerfile optimized for production
  - [ ] Multi-stage build implemented
  - [ ] Security scanning completed
  - [ ] Image size optimized
  - [ ] Non-root user configured

- [ ] **Container Registry**
  - [ ] Azure Container Registry (ACR) created or identified
  - [ ] ACR admin credentials or managed identity configured
  - [ ] CI/CD pipeline can push to ACR

### Data Prerequisites

- [ ] **Data Inventory**
  - [ ] Document count and total size calculated
  - [ ] Vector embeddings count calculated
  - [ ] Cache data retention policy defined
  - [ ] Data sensitivity and compliance requirements documented

- [ ] **Data Export**
  - [ ] Export script for Qdrant vectors created
  - [ ] Export script for documents created
  - [ ] Export script for Redis cache created (if needed)
  - [ ] Export scripts tested on subset of data
  - [ ] Exported data validated for integrity

- [ ] **Data Mapping**
  - [ ] Qdrant to Azure Search mapping documented
  - [ ] Document storage path mapping defined
  - [ ] Redis key namespace mapping defined

### Testing Prerequisites

- [ ] **Test Environment**
  - [ ] Azure test/dev environment provisioned
  - [ ] Test data set prepared
  - [ ] Performance benchmarks from current system recorded
  - [ ] Test scripts and scenarios documented

- [ ] **Monitoring & Alerting**
  - [ ] Application Insights configured
  - [ ] Key metrics identified and dashboards created
  - [ ] Alert rules defined
  - [ ] On-call rotation notified

### Business Prerequisites

- [ ] **Stakeholder Communication**
  - [ ] Migration plan reviewed with stakeholders
  - [ ] Maintenance window scheduled and communicated
  - [ ] Rollback decision criteria agreed upon
  - [ ] Success metrics defined

- [ ] **Documentation**
  - [ ] Runbook for migration created
  - [ ] Rollback procedures documented
  - [ ] Post-migration verification checklist created
  - [ ] Azure architecture diagram created

- [ ] **Budget Approval**
  - [ ] Azure cost estimates reviewed
  - [ ] Budget allocated for 3-6 months
  - [ ] Cost monitoring alerts configured

## Migration Strategy

### Approach: Parallel Run + Blue-Green Deployment

We'll use a phased approach to minimize risk:

1. **Build Green Environment** (Azure) while Blue (current) runs
2. **Migrate Data** from Blue to Green
3. **Parallel Run** - Both environments serve traffic
4. **Gradual Traffic Shift** - Increase Azure traffic percentage
5. **Monitor & Validate** - Compare metrics between environments
6. **Full Cutover** - Switch 100% to Azure
7. **Decommission Blue** - After validation period

### Traffic Split Strategy

| Week | Current System | Azure System | Notes |
|------|----------------|--------------|-------|
| 1 | 100% | 0% | Build & test Azure |
| 2 | 100% | 0% | Data migration |
| 3 | 90% | 10% | Initial production traffic |
| 4 | 50% | 50% | Equal split for comparison |
| 5 | 10% | 90% | Primary on Azure |
| 6 | 0% | 100% | Full cutover |
| 7-8 | 0% (standby) | 100% | Validation period |
| 9+ | Decommissioned | 100% | Complete migration |

## Detailed Migration Steps

### Phase 1: Planning & Preparation (Week 1)

#### Day 1-2: Azure Access & Setup
```bash
# 1. Verify Azure access
az login
az account show

# 2. Check Azure OpenAI access
az provider show -n Microsoft.CognitiveServices --query "resourceTypes[?resourceType=='accounts'].locations"

# 3. Set up Azure CLI environment
export AZURE_SUBSCRIPTION_ID="<your-subscription-id>"
export AZURE_LOCATION="eastus"
export RESOURCE_GROUP="rg-rag-service-prod"

# 4. Create resource group
az group create \
  --name $RESOURCE_GROUP \
  --location $AZURE_LOCATION \
  --tags Environment=production Application=rag-service
```

#### Day 3-4: Infrastructure as Code
```bash
# 1. Review and customize Bicep templates
cd infra

# 2. Update parameters.json with production values
# Edit: redisCacheSku, storageAccountSku, minReplicas, etc.

# 3. Validate templates
az deployment group validate \
  --resource-group $RESOURCE_GROUP \
  --template-file main.bicep \
  --parameters parameters.json

# 4. Run what-if analysis
az deployment group what-if \
  --resource-group $RESOURCE_GROUP \
  --template-file main.bicep \
  --parameters parameters.json
```

#### Day 5-7: Container Registry & Image Build
```bash
# 1. Create Azure Container Registry
ACR_NAME="ragserviceacr"
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Standard \
  --admin-enabled true

# 2. Build and push container image
az acr build \
  --registry $ACR_NAME \
  --image rag-service:v1.0.0 \
  --file Dockerfile \
  .

# 3. Verify image
az acr repository show \
  --name $ACR_NAME \
  --image rag-service:v1.0.0
```

### Phase 2: Infrastructure Deployment (Week 2)

#### Day 1: Deploy Core Infrastructure
```bash
# 1. Deploy all Azure resources
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json \
  --parameters environment=prod \
  --parameters dockerImage="$ACR_NAME.azurecr.io/rag-service:v1.0.0" \
  --name "rag-prod-$(date +%Y%m%d-%H%M%S)"

# This takes 15-20 minutes

# 2. Capture outputs
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name <deployment-name> \
  --query properties.outputs > deployment-outputs.json
```

#### Day 2: Configure Azure OpenAI
```bash
# 1. Get OpenAI endpoint from outputs
OPENAI_ENDPOINT=$(jq -r '.openAiServiceEndpoint.value' deployment-outputs.json)

# 2. Verify deployments
az cognitiveservices account deployment list \
  --name $(jq -r '.openAiServiceName.value' deployment-outputs.json) \
  --resource-group $RESOURCE_GROUP

# 3. Test OpenAI endpoint
OPENAI_KEY=$(az cognitiveservices account keys list \
  --name $(jq -r '.openAiServiceName.value' deployment-outputs.json) \
  --resource-group $RESOURCE_GROUP \
  --query key1 -o tsv)

curl -X POST "$OPENAI_ENDPOINT/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview" \
  -H "api-key: $OPENAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"max_tokens":10}'
```

#### Day 3: Configure Azure Cognitive Search
```bash
# 1. Get Search endpoint
SEARCH_ENDPOINT=$(jq -r '.searchServiceEndpoint.value' deployment-outputs.json)
SEARCH_KEY=$(az search admin-key show \
  --resource-group $RESOURCE_GROUP \
  --service-name $(jq -r '.searchServiceName.value' deployment-outputs.json) \
  --query primaryKey -o tsv)

# 2. The index will be auto-created by the application
# Or create manually using the Azure Portal or REST API

# 3. Verify search service
curl -X GET "$SEARCH_ENDPOINT/indexes?api-version=2024-07-01" \
  -H "api-key: $SEARCH_KEY"
```

#### Day 4-5: Configure Networking & Security
```bash
# 1. Verify Key Vault is accessible
KEYVAULT_NAME=$(jq -r '.keyVaultName.value' deployment-outputs.json)
az keyvault secret list --vault-name $KEYVAULT_NAME

# 2. Test managed identity access
# This is verified during application startup

# 3. Configure Application Insights alerts
# - High error rate alert
# - Availability alert
# - Performance degradation alert

# 4. If using private endpoints (production), configure:
# - Private DNS zones
# - VNet peering
# - Service endpoints
```

### Phase 3: Data Migration (Week 3)

#### Preparation: Create Migration Scripts

**Export from Qdrant (export-qdrant.ts)**
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';
import * as fs from 'fs';

const client = new QdrantClient({ url: process.env.QDRANT_URL });
const COLLECTION_NAME = 'documents';
const OUTPUT_FILE = 'qdrant-export.json';

async function exportQdrant() {
  const points = [];
  let offset = null;
  
  while (true) {
    const response = await client.scroll(COLLECTION_NAME, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: true,
    });
    
    points.push(...response.points);
    
    if (!response.next_page_offset) break;
    offset = response.next_page_offset;
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(points, null, 2));
  console.log(`Exported ${points.length} points to ${OUTPUT_FILE}`);
}

exportQdrant();
```

**Import to Azure Search (import-search.ts)**
```typescript
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import * as fs from 'fs';

const endpoint = process.env.AZURE_SEARCH_ENDPOINT!;
const apiKey = process.env.AZURE_SEARCH_API_KEY!;
const indexName = 'rag-documents';

const searchClient = new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey));

async function importToSearch() {
  const data = JSON.parse(fs.readFileSync('qdrant-export.json', 'utf-8'));
  
  // Transform Qdrant format to Azure Search format
  const documents = data.map((point: any) => ({
    id: point.id.toString(),
    content: point.payload.content,
    metadata: JSON.stringify(point.payload.metadata),
    embedding: point.vector,
  }));
  
  // Upload in batches
  const batchSize = 100;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    await searchClient.uploadDocuments(batch);
    console.log(`Uploaded batch ${i / batchSize + 1}`);
  }
  
  console.log(`Imported ${documents.length} documents`);
}

importToSearch();
```

#### Day 1-2: Export Data from Current System
```bash
# 1. Export Qdrant vectors
tsx scripts/export-qdrant.ts

# 2. Export documents from current storage
# If using S3:
aws s3 sync s3://your-bucket/documents ./documents-export/

# If using local filesystem:
tar -czf documents-export.tar.gz /path/to/documents

# 3. Export Redis cache (optional - can rebuild)
redis-cli --rdb dump.rdb

# 4. Verify exports
ls -lh qdrant-export.json documents-export/ dump.rdb
```

#### Day 3-4: Import Data to Azure
```bash
# 1. Upload documents to Azure Blob Storage
STORAGE_ACCOUNT=$(jq -r '.storageAccountName.value' deployment-outputs.json)
CONTAINER_NAME="documents"

az storage blob upload-batch \
  --account-name $STORAGE_ACCOUNT \
  --destination $CONTAINER_NAME \
  --source ./documents-export/ \
  --auth-mode login

# 2. Import vectors to Azure Search
export AZURE_SEARCH_ENDPOINT=$(jq -r '.searchServiceEndpoint.value' deployment-outputs.json)
export AZURE_SEARCH_API_KEY=$SEARCH_KEY

tsx scripts/import-search.ts

# 3. Verify import
curl -X GET "$SEARCH_ENDPOINT/indexes/$INDEX_NAME/docs/\$count?api-version=2024-07-01" \
  -H "api-key: $SEARCH_KEY"

# 4. Redis cache - let it rebuild naturally (faster than import)
# Or import using redis-cli if needed
```

#### Day 5: Data Validation
```bash
# 1. Compare document counts
# Current system:
curl http://current-system/api/stats

# Azure system:
curl https://$(jq -r '.containerAppUrl.value' deployment-outputs.json)/api/stats

# 2. Test sample queries on both systems
# 3. Verify embeddings match
# 4. Check document accessibility
```

### Phase 4: Testing (Week 4)

#### Day 1-2: Functional Testing
```bash
# 1. Health check
curl https://$(jq -r '.containerAppUrl.value' deployment-outputs.json)/health

# 2. Document upload
curl -X POST https://$(jq -r '.containerAppUrl.value' deployment-outputs.json)/api/documents \
  -H "Content-Type: application/json" \
  -d '{"content": "Test document", "metadata": {"source": "test"}}'

# 3. Query endpoint
curl -X POST https://$(jq -r '.containerAppUrl.value' deployment-outputs.json)/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "topK": 5}'

# 4. Chat endpoint
curl -X POST https://$(jq -r '.containerAppUrl.value' deployment-outputs.json)/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the test about?", "conversationId": "test-123"}'
```

#### Day 3: Performance Testing
```bash
# 1. Install Apache Bench or similar
sudo apt-get install apache2-utils

# 2. Load test query endpoint
ab -n 1000 -c 10 -p query.json -T application/json \
  https://$(jq -r '.containerAppUrl.value' deployment-outputs.json)/api/query

# 3. Monitor Application Insights during load test
# Check:
# - Response times
# - Error rates
# - Azure OpenAI throttling
# - Search service performance

# 4. Compare with current system baseline
```

#### Day 4-5: Integration & E2E Testing
```bash
# Run full test suite against Azure environment
export AZURE_MODE=true
export AZURE_OPENAI_ENDPOINT=$(jq -r '.openAiServiceEndpoint.value' deployment-outputs.json)
# ... set other Azure env vars ...

npm run test:integration
```

### Phase 5: Gradual Cutover (Weeks 5-6)

#### Week 5: Initial Production Traffic (10%)

**Option 1: DNS-based traffic split**
```bash
# Configure DNS with weighted routing
# Route 10% to Azure, 90% to current system
# (Requires Route 53, Azure Traffic Manager, or similar)
```

**Option 2: Application-level routing**
```bash
# Update load balancer / API gateway
# Configure traffic split rules
```

**Option 3: Feature flag**
```typescript
// In your client application
const useAzure = Math.random() < 0.1; // 10% to Azure
const endpoint = useAzure 
  ? 'https://azure-endpoint' 
  : 'https://current-endpoint';
```

**Monitoring checklist:**
- [ ] Error rates similar between systems
- [ ] Response times within acceptable range
- [ ] No Azure OpenAI throttling
- [ ] Search query performance acceptable
- [ ] No increase in customer complaints

#### Week 6: Increase to 50%
```bash
# Gradually increase Azure traffic
# Day 1: 20%
# Day 2: 30%
# Day 3: 40%
# Day 4: 50%

# Monitor closely at each step
```

#### Week 6: Full Cutover (100%)
```bash
# After successful 50% split for several days:
# Day 5: 75%
# Day 6: 90%
# Day 7: 100%

# Update DNS to point fully to Azure
# Keep old system running in standby mode
```

### Phase 6: Post-Migration Validation (Week 7)

#### Daily Checks (First Week)
```bash
# 1. Monitor Application Insights dashboards
# 2. Check error logs
# 3. Review performance metrics
# 4. Verify cost actuals vs estimates
# 5. Collect user feedback
```

#### Validation Criteria
- [ ] Error rate < 0.1%
- [ ] P95 response time < 2s for queries
- [ ] P99 response time < 5s for queries
- [ ] Zero data loss incidents
- [ ] No critical security issues
- [ ] Cost within 10% of estimates
- [ ] Zero unplanned downtime
- [ ] Customer satisfaction maintained or improved

### Phase 7: Decommissioning (Week 8+)

**After 1-2 weeks of stable operation at 100% Azure:**

```bash
# 1. Export logs from old system (archive)
# 2. Backup any remaining data
# 3. Document decommissioning
# 4. Cancel old subscriptions/services
# 5. Remove DNS records
# 6. Deallocate VMs/containers
# 7. Delete resources
# 8. Final cost reconciliation
```

## Data Migration

### Vector Database Migration (Qdrant → Azure Search)

#### Challenges
- Different index schemas
- Different vector search APIs
- Large dataset size
- Minimize downtime

#### Strategy
1. **Schema Mapping**
   - Qdrant payload → Azure Search fields
   - Vector field configuration
   - Metadata preservation

2. **Migration Process**
   - Export in batches (avoid memory issues)
   - Transform data format
   - Import in batches (avoid rate limits)
   - Validate each batch

3. **Validation**
   - Count verification
   - Random sample testing
   - Query result comparison

### Document Storage Migration

#### Current → Azure Blob Storage

```bash
# Using AzCopy for fast transfer
azcopy copy \
  'https://current-storage/*' \
  'https://ragservicestorage.blob.core.windows.net/documents' \
  --recursive=true \
  --check-length=true

# Verify transfer
az storage blob list \
  --account-name ragservicestorage \
  --container-name documents \
  --num-results 10
```

### Cache Migration (Optional)

Redis cache can typically be rebuilt, but if needed:

```bash
# Export from current Redis
redis-cli --rdb dump.rdb

# Import to Azure Redis
# (Not directly supported - let cache rebuild naturally)
```

## Cutover Plan

### Pre-Cutover Checklist (T-24 hours)

- [ ] All data migrated and validated
- [ ] All tests passing
- [ ] Monitoring and alerts configured
- [ ] Rollback plan reviewed and understood
- [ ] On-call team notified and available
- [ ] Stakeholders notified
- [ ] Maintenance window confirmed
- [ ] Backup of current system taken

### Cutover Steps (T-0)

**T-0:00 - Start Cutover**
```bash
# 1. Put current system in read-only mode (if applicable)
# 2. Final data sync
# 3. Update DNS / load balancer
# 4. Monitor for 30 minutes
```

**T+0:30 - Verify**
```bash
# 1. Check health endpoints
# 2. Run smoke tests
# 3. Monitor Application Insights
# 4. Check error logs
```

**T+1:00 - Full Traffic**
```bash
# 1. Switch 100% traffic to Azure
# 2. Keep old system in standby
# 3. Monitor closely
```

**T+4:00 - Initial Validation**
```bash
# 1. Review metrics
# 2. Check for any issues
# 3. Collect initial feedback
```

**T+24:00 - Day 1 Review**
```bash
# 1. Full metrics review
# 2. Cost validation
# 3. Performance comparison
# 4. Issue log review
# 5. Go/No-Go decision for continuing
```

## Rollback Plan

### Rollback Decision Criteria

**Immediate Rollback (Critical)**
- Service completely down for > 5 minutes
- Data loss detected
- Security breach
- Critical functionality broken

**Planned Rollback (Major Issues)**
- Error rate > 5%
- Performance degradation > 50%
- Costs > 200% of estimates
- Multiple customer complaints

### Rollback Procedure

**Immediate Rollback (< 15 minutes)**
```bash
# 1. Switch traffic back to old system via DNS/LB
# This is instantaneous with proper setup

# 2. Verify old system is healthy
curl http://old-system/health

# 3. Monitor old system
# 4. Notify stakeholders
# 5. Begin root cause analysis
```

**Data Rollback (if needed)**
```bash
# 1. Stop writes to Azure system
# 2. Restore from backup
# 3. Sync any delta from Azure back to old system
# 4. Validate data integrity
```

### Post-Rollback Actions

1. **Immediate** (0-2 hours)
   - Incident report
   - Preserve logs and evidence
   - Notify all stakeholders

2. **Short-term** (2-24 hours)
   - Root cause analysis
   - Fix identification
   - Test fix in non-prod
   - Plan remediation

3. **Long-term** (1-2 weeks)
   - Implement fixes
   - Re-test thoroughly
   - Plan second migration attempt
   - Update migration plan

## Post-Migration Validation

### Day 1 Validation

- [ ] All endpoints responding correctly
- [ ] Error rate within normal range
- [ ] No data loss
- [ ] Performance metrics acceptable
- [ ] No security issues
- [ ] Cost tracking enabled

### Week 1 Validation

- [ ] Daily metrics review
- [ ] User feedback collected
- [ ] Performance trends analyzed
- [ ] Cost actuals vs. estimates
- [ ] No major issues
- [ ] Documentation updated

### Month 1 Validation

- [ ] Full cost analysis
- [ ] Performance optimization opportunities identified
- [ ] Scaling behavior validated
- [ ] Disaster recovery tested
- [ ] Team training completed
- [ ] Migration retrospective held

## Success Criteria

### Technical Success Criteria

1. **Availability**: > 99.9% uptime
2. **Performance**: 
   - P95 query latency < 2s
   - P99 query latency < 5s
3. **Reliability**: Error rate < 0.1%
4. **Data Integrity**: Zero data loss
5. **Security**: Zero security incidents
6. **Scalability**: Auto-scaling working as expected

### Business Success Criteria

1. **Cost**: Within 10% of estimates
2. **User Experience**: No degradation
3. **Compliance**: All requirements met
4. **Team Readiness**: Team confident operating Azure
5. **Documentation**: Complete and accurate

### Migration Success Criteria

1. **Zero Downtime**: No user-facing downtime
2. **Data Migration**: 100% data migrated
3. **Feature Parity**: All features working
4. **Rollback Tested**: Rollback procedure validated
5. **Lessons Learned**: Documented for future migrations

## Appendix

### Useful Commands

```bash
# Monitor container app logs
az containerapp logs show \
  --name <container-app-name> \
  --resource-group $RESOURCE_GROUP \
  --follow

# Scale container app manually
az containerapp update \
  --name <container-app-name> \
  --resource-group $RESOURCE_GROUP \
  --min-replicas 5 \
  --max-replicas 20

# Query Application Insights
az monitor app-insights query \
  --app <app-insights-name> \
  --resource-group $RESOURCE_GROUP \
  --analytics-query "requests | where timestamp > ago(1h) | summarize count() by resultCode"

# Check costs
az consumption usage list \
  --start-date $(date -d '7 days ago' +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d)
```

### Contact Information

- **Migration Lead**: [Name] - [Email]
- **Azure SME**: [Name] - [Email]
- **Development Team**: [Team Email/Slack]
- **On-Call**: [PagerDuty/Phone]
- **Stakeholders**: [Distribution List]

### References

- [Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/)
- [Azure Migration Guide](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/)
- [Azure Cognitive Search](https://learn.microsoft.com/en-us/azure/search/)
