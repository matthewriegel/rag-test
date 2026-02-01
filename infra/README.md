# Azure Infrastructure Deployment Guide

This directory contains Bicep templates for deploying the RAG service to Azure.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Azure OpenAI Access](#azure-openai-access)
- [Deployment Instructions](#deployment-instructions)
- [Configuration](#configuration)
- [Required RBAC Permissions](#required-rbac-permissions)
- [Cost Estimates](#cost-estimates)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) (version 2.50.0 or later)
- [Bicep CLI](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/install) (installed with Azure CLI)
- An active Azure subscription
- Sufficient permissions to create resources (see [RBAC Permissions](#required-rbac-permissions))

### Verify Installation
```bash
# Check Azure CLI version
az --version

# Check Bicep version
az bicep version

# Login to Azure
az login

# Set your subscription
az account set --subscription "<your-subscription-id>"
```

## Azure OpenAI Access

**IMPORTANT:** Azure OpenAI is a **limited-access service** that requires approval before you can use it.

### How to Request Access

1. Apply for access at: [https://aka.ms/oai/access](https://aka.ms/oai/access)
2. Fill out the form with:
   - Business justification
   - Use case details
   - Expected usage volume
3. Wait for approval (typically 1-5 business days)
4. You'll receive an email confirmation when approved

### Check Your Access Status

```bash
# List available OpenAI resources in your subscription
az cognitiveservices account list --query "[?kind=='OpenAI']"

# If empty and you haven't applied, you need to request access first
```

### Alternative: Use OpenAI API (Development Only)

If you don't have Azure OpenAI access yet, you can:
1. Use the OpenAI API for development/testing (set `AZURE_MODE=false`)
2. Deploy everything except Azure OpenAI
3. Add Azure OpenAI later after approval

To deploy without Azure OpenAI, comment out the OpenAI sections in `main.bicep` temporarily.

## Deployment Instructions

### 1. Set Up Environment

```bash
# Navigate to the repository root
cd /path/to/rag-service

# Set deployment variables
RESOURCE_GROUP="rg-rag-service-dev"
LOCATION="eastus"
ENVIRONMENT="dev"  # or "staging", "prod"
```

### 2. Create Resource Group

```bash
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION \
  --tags Environment=$ENVIRONMENT Application=rag-service
```

### 3. Validate the Bicep Template

```bash
az deployment group validate \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json \
  --parameters environment=$ENVIRONMENT
```

### 4. Preview Changes (What-If)

```bash
az deployment group what-if \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json \
  --parameters environment=$ENVIRONMENT
```

### 5. Deploy Infrastructure

```bash
# Deploy with verbose output
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json \
  --parameters environment=$ENVIRONMENT \
  --name "rag-infrastructure-$(date +%Y%m%d-%H%M%S)" \
  --verbose
```

This deployment will take approximately **15-20 minutes** to complete.

### 6. Capture Deployment Outputs

```bash
# Get deployment outputs
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name <deployment-name> \
  --query properties.outputs

# Save to file for reference
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name <deployment-name> \
  --query properties.outputs > deployment-outputs.json
```

## Configuration

### Environment-Specific Parameters

Create environment-specific parameter files:

#### Development (parameters.dev.json)
```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environment": { "value": "dev" },
    "redisCacheSku": { "value": "Basic" },
    "redisCacheCapacity": { "value": 0 },
    "minReplicas": { "value": 1 },
    "maxReplicas": { "value": 3 },
    "enablePublicNetworkAccess": { "value": true }
  }
}
```

#### Production (parameters.prod.json)
```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environment": { "value": "prod" },
    "redisCacheSku": { "value": "Standard" },
    "redisCacheCapacity": { "value": 2 },
    "storageAccountSku": { "value": "Standard_GRS" },
    "minReplicas": { "value": 2 },
    "maxReplicas": { "value": 10 },
    "enablePublicNetworkAccess": { "value": false }
  }
}
```

### Update Docker Image

After building your container image:

```bash
# Build and push to Azure Container Registry (ACR)
ACR_NAME="your-acr-name"
IMAGE_TAG="v1.0.0"

# Build image
docker build -t $ACR_NAME.azurecr.io/rag-service:$IMAGE_TAG .

# Login to ACR
az acr login --name $ACR_NAME

# Push image
docker push $ACR_NAME.azurecr.io/rag-service:$IMAGE_TAG

# Update parameter file
# Set dockerImage parameter to: "$ACR_NAME.azurecr.io/rag-service:$IMAGE_TAG"

# Redeploy
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters infra/parameters.json \
  --parameters dockerImage="$ACR_NAME.azurecr.io/rag-service:$IMAGE_TAG"
```

### Create Azure Search Index

The deployment creates the Search service but not the index. Create it after deployment:

```bash
# Option 1: Use the application's initialization logic
# The app will auto-create the index on first run

# Option 2: Create manually via Azure Portal or REST API
# See: https://learn.microsoft.com/en-us/azure/search/search-what-is-an-index
```

## Required RBAC Permissions

### Deployment User/Service Principal Needs

To deploy this infrastructure, you need the following permissions:

#### Subscription-Level Roles
- **Contributor**: Create and manage resources
- **User Access Administrator**: Assign RBAC roles (for managed identity permissions)

Or these specific roles at Resource Group scope:
- **Owner**: Combines Contributor + User Access Administrator
- Recommended for production deployments

#### Minimum Permissions (Granular)
If you can't use Owner/Contributor roles, you need these specific permissions:

```bash
# Create a custom role (requires subscription Owner/User Access Admin)
az role definition create --role-definition '{
  "Name": "RAG Infrastructure Deployer",
  "Description": "Can deploy RAG service infrastructure",
  "Actions": [
    "Microsoft.Resources/deployments/*",
    "Microsoft.Resources/subscriptions/resourceGroups/*",
    "Microsoft.ManagedIdentity/userAssignedIdentities/*",
    "Microsoft.OperationalInsights/workspaces/*",
    "Microsoft.Insights/components/*",
    "Microsoft.KeyVault/vaults/*",
    "Microsoft.Search/searchServices/*",
    "Microsoft.CognitiveServices/accounts/*",
    "Microsoft.Cache/redis/*",
    "Microsoft.Storage/storageAccounts/*",
    "Microsoft.App/managedEnvironments/*",
    "Microsoft.App/containerApps/*",
    "Microsoft.Authorization/roleAssignments/*"
  ],
  "AssignableScopes": ["/subscriptions/<subscription-id>"]
}'
```

### Runtime Permissions (Managed Identity)

The deployed managed identity automatically receives these roles:
- **Key Vault Secrets User** on Key Vault
- **Storage Blob Data Contributor** on Storage Account

Additional roles you may need to assign manually:
- **Cognitive Services OpenAI User** on Azure OpenAI (if using RBAC instead of keys)
- **Search Index Data Contributor** on Azure Search (if using RBAC instead of keys)

## Cost Estimates

### Development Environment (~$150-250/month)

| Resource | SKU/Tier | Estimated Cost (Monthly) |
|----------|----------|--------------------------|
| Azure OpenAI | S0 (pay-per-use) | $50-150 (usage-based) |
| Cognitive Search | Basic | $75 |
| Redis Cache | Basic C1 (1GB) | $17 |
| Storage Account | Standard LRS | $5-10 |
| Container App | 0.5 vCPU, 1GB RAM | $10-20 |
| Application Insights | Pay-per-GB | $5-10 |
| Key Vault | Standard | $1 |
| **Total** | | **~$163-283/month** |

### Production Environment (~$600-1200/month)

| Resource | SKU/Tier | Estimated Cost (Monthly) |
|----------|----------|--------------------------|
| Azure OpenAI | S0 (pay-per-use) | $200-500 (usage-based) |
| Cognitive Search | Standard S1 (2 replicas) | $500 |
| Redis Cache | Standard C2 (2.5GB) | $65 |
| Storage Account | Standard GRS | $20-30 |
| Container App | 2-10 replicas | $50-100 |
| Application Insights | Pay-per-GB | $20-40 |
| Key Vault | Standard | $1 |
| **Total** | | **~$856-1236/month** |

### Cost Optimization Tips

1. **Azure OpenAI**: This is usage-based. Monitor token consumption.
   - Use GPT-3.5 instead of GPT-4 for non-critical queries
   - Implement response caching
   - Set max token limits

2. **Cognitive Search**: Use Basic tier for dev, Standard for prod
   - Only pay for replicas you need
   - Consider autoscaling for variable workloads

3. **Redis Cache**: Start small, scale up as needed
   - Basic C0 (250MB) costs only $16/month for dev

4. **Container Apps**: Set appropriate min/max replicas
   - Scale to zero for non-prod environments if possible

5. **Storage**: Use LRS for dev, GRS only for prod
   - Implement lifecycle policies to archive old data

### Monitor Costs

```bash
# View cost analysis
az consumption usage list \
  --start-date $(date -d '30 days ago' +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "[?contains(instanceId, 'rg-rag-service')]"

# Set up budget alerts in Azure Portal:
# Cost Management + Billing > Budgets > Create
```

## Troubleshooting

### Common Issues

#### 1. Azure OpenAI Deployment Fails

**Error**: `The subscription does not have access to Azure OpenAI Service`

**Solution**:
- Request access at https://aka.ms/oai/access
- Wait for approval email
- Temporarily comment out OpenAI resources in `main.bicep` if needed

#### 2. Resource Name Already Exists

**Error**: `Resource with name 'xxx' already exists`

**Solution**:
```bash
# Use a custom suffix
az deployment group create \
  --parameters uniqueSuffix="$(openssl rand -hex 4)"
```

#### 3. Insufficient Permissions

**Error**: `Authorization failed`

**Solution**:
- Ensure you have Owner or Contributor + User Access Administrator roles
- Check you're deploying to the correct subscription
- Verify resource providers are registered:
```bash
az provider register --namespace Microsoft.CognitiveServices
az provider register --namespace Microsoft.Search
az provider register --namespace Microsoft.Cache
az provider register --namespace Microsoft.App
```

#### 4. Quota Exceeded

**Error**: `Quota exceeded for resource type`

**Solution**:
```bash
# Check quotas
az vm list-usage --location eastus --output table

# Request quota increase in Azure Portal:
# Help + Support > New support request > Quota
```

#### 5. Container App Fails to Start

**Error**: Container app is not healthy

**Solution**:
1. Check logs:
```bash
az containerapp logs show \
  --name <container-app-name> \
  --resource-group $RESOURCE_GROUP \
  --follow
```

2. Verify environment variables are correct
3. Check the health endpoint is responding
4. Ensure the Docker image is accessible

### Get Help

```bash
# View deployment logs
az deployment group show \
  --resource-group $RESOURCE_GROUP \
  --name <deployment-name> \
  --query properties.error

# Check resource deployment status
az deployment group list \
  --resource-group $RESOURCE_GROUP \
  --query "[].{name:name, state:properties.provisioningState}"
```

## Next Steps

After successful deployment:

1. **Configure Search Index**: Create the vector search index (auto-created on first run)
2. **Upload Documents**: Use the document ingestion API
3. **Test Endpoints**: Verify health and query endpoints
4. **Set Up Monitoring**: Configure alerts in Application Insights
5. **Review Security**: Disable public access for production
6. **Set Up CI/CD**: Automate deployments (see GitHub Actions examples)

## Additional Resources

- [Azure Bicep Documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/)
- [Azure Cognitive Search](https://learn.microsoft.com/en-us/azure/search/)
- [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/)

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review Azure documentation
3. Open an issue in the repository
4. Contact your Azure support team
