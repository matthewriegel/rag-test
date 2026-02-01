# Azure Deployment Troubleshooting Guide

Quick reference for common issues when deploying the RAG service to Azure.

## Quick Diagnostics

```bash
# Check deployment status
az deployment group list \
  --resource-group rg-rag-service-dev \
  --query "[].{name:name, state:properties.provisioningState, timestamp:properties.timestamp}" \
  --output table

# Get deployment error details
az deployment group show \
  --resource-group rg-rag-service-dev \
  --name <deployment-name> \
  --query properties.error

# Check container app logs
az containerapp logs show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --follow

# Check container app health
az containerapp show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --query properties.runningStatus
```

## Common Issues

### 1. Azure OpenAI Access Denied

**Symptom:**
```
Code: Unauthorized
Message: Access denied due to Virtual Network/Firewall rules
```

**Solution:**
```bash
# Check if you have Azure OpenAI access
az cognitiveservices account list --query "[?kind=='OpenAI']"

# If empty, apply for access
# Visit: https://aka.ms/oai/access

# Verify network settings
az cognitiveservices account show \
  --name <openai-name> \
  --resource-group <rg-name> \
  --query properties.networkAcls
```

### 2. Key Vault Access Denied

**Symptom:**
```
The user, group or application 'appid=xxx' does not have secrets get permission
```

**Solution:**
```bash
# Grant managed identity access to Key Vault
MANAGED_IDENTITY_PRINCIPAL_ID="<principal-id>"
KEYVAULT_NAME="<keyvault-name>"

az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $MANAGED_IDENTITY_PRINCIPAL_ID \
  --scope /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/$KEYVAULT_NAME

# Verify role assignment
az role assignment list \
  --scope /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/$KEYVAULT_NAME \
  --query "[].{principal:principalName, role:roleDefinitionName}"
```

### 3. Container App Won't Start

**Symptom:**
```
Container 'rag-service' was terminated with exit code '1'
```

**Solutions:**

**Check environment variables:**
```bash
az containerapp show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --query properties.template.containers[0].env
```

**Check container logs:**
```bash
az containerapp logs show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --tail 50
```

**Common fixes:**
- Missing environment variables
- Wrong Docker image tag
- Health check endpoint not responding
- Port mismatch (ensure PORT=3000)

### 4. Search Index Not Found

**Symptom:**
```
The index 'rag-documents' for service '<search-service>' was not found
```

**Solution:**
```bash
# The index is auto-created on first run
# If not, check logs to see why it failed

# Create manually if needed via Azure Portal or REST API
# Or use Azure Search SDK in your application initialization
```

### 5. Redis Connection Failed

**Symptom:**
```
Error: connect ETIMEDOUT
```

**Solutions:**

**Check Redis configuration:**
```bash
az redis show \
  --name <redis-name> \
  --resource-group <rg-name> \
  --query "{name:name, sslPort:sslPort, hostName:hostName, enableNonSslPort:enableNonSslPort}"
```

**Verify firewall rules:**
```bash
az redis firewall-rules list \
  --name <redis-name> \
  --resource-group <rg-name>

# Allow Azure services
az redis update \
  --name <redis-name> \
  --resource-group <rg-name> \
  --set publicNetworkAccess=Enabled
```

### 6. Deployment Quota Exceeded

**Symptom:**
```
Operation could not be completed as it results in exceeding approved <resource> quota
```

**Solution:**
```bash
# Check current quotas
az vm list-usage \
  --location eastus \
  --query "[?contains(name.value, 'cores')]" \
  --output table

# Request quota increase
# Azure Portal -> Help + Support -> New support request -> Service and subscription limits (quotas)
```

### 7. Resource Name Conflicts

**Symptom:**
```
The resource name '<name>' is already in use
```

**Solution:**
```bash
# Use custom unique suffix
az deployment group create \
  --resource-group rg-rag-service-dev \
  --template-file main.bicep \
  --parameters parameters.json \
  --parameters uniqueSuffix="$(date +%s | tail -c 6)"
```

### 8. Managed Identity Not Working

**Symptom:**
```
ManagedIdentityCredential authentication failed
```

**Solutions:**

**Verify managed identity is assigned:**
```bash
az containerapp show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --query identity
```

**Check AZURE_CLIENT_ID is set:**
```bash
az containerapp show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --query "properties.template.containers[0].env[?name=='AZURE_CLIENT_ID']"
```

**Verify role assignments:**
```bash
az role assignment list \
  --assignee <managed-identity-client-id> \
  --all
```

### 9. High Costs

**Symptom:**
Daily costs higher than expected

**Investigation:**
```bash
# Check costs by resource
az consumption usage list \
  --start-date $(date -d '7 days ago' +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "[?contains(instanceId, 'rg-rag-service')]" \
  --output table

# Common causes:
# - Azure OpenAI token usage (check in portal)
# - Search service tier too high
# - Too many container replicas
# - Storage transaction costs
```

**Solutions:**
- Monitor OpenAI usage and implement caching
- Use Basic tier for dev environments
- Reduce min/max replicas for dev
- Implement lifecycle policies for blob storage

### 10. Performance Issues

**Symptom:**
Slow response times

**Investigation:**

**Check Application Insights:**
```bash
# Query response times
az monitor app-insights query \
  --app <app-insights-name> \
  --resource-group rg-rag-service-dev \
  --analytics-query "requests | where timestamp > ago(1h) | summarize avg(duration), percentile(duration, 95), percentile(duration, 99) by name"
```

**Check Azure OpenAI throttling:**
```bash
# In Application Insights -> Logs
exceptions
| where timestamp > ago(1h)
| where outerMessage contains "429"
| summarize count() by bin(timestamp, 5m)
```

**Common fixes:**
- Increase Azure OpenAI TPM quota
- Scale up Redis cache tier
- Add more container replicas
- Optimize search queries
- Implement response caching

## Debugging Techniques

### Local Testing with Azure Services

```bash
# Login with Azure CLI
az login

# Test Azure OpenAI locally
export AZURE_MODE=true
export AZURE_OPENAI_ENDPOINT="https://your-openai.openai.azure.com/"
# ... other env vars ...

npm run start:dev
```

### Enable Verbose Logging

```bash
# Update container app with debug logging
az containerapp update \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --set-env-vars LOG_LEVEL=debug AZURE_LOG_LEVEL=verbose
```

### Test Individual Services

**Test OpenAI:**
```bash
curl -X POST "https://<your-openai>.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview" \
  -H "api-key: <key>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}],"max_tokens":10}'
```

**Test Search:**
```bash
curl "https://<your-search>.search.windows.net/indexes?api-version=2024-07-01" \
  -H "api-key: <admin-key>"
```

**Test Redis:**
```bash
redis-cli -h <your-redis>.redis.cache.windows.net -p 6380 -a <password> --tls PING
```

**Test Blob Storage:**
```bash
az storage blob list \
  --account-name <storage-account> \
  --container-name documents \
  --auth-mode login
```

### Monitor in Real-Time

```bash
# Container logs
az containerapp logs show \
  --name ca-rag-service-dev \
  --resource-group rg-rag-service-dev \
  --follow

# Application Insights live metrics
# Azure Portal -> Application Insights -> Live Metrics
```

## Getting Help

### Collect Diagnostic Information

```bash
# Run this script to collect all diagnostic info
cat > collect-diagnostics.sh << 'EOF'
#!/bin/bash
RESOURCE_GROUP="rg-rag-service-dev"
OUTPUT_DIR="diagnostics-$(date +%Y%m%d-%H%M%S)"
mkdir -p $OUTPUT_DIR

echo "Collecting diagnostics..."

# Deployment info
az deployment group list --resource-group $RESOURCE_GROUP > $OUTPUT_DIR/deployments.json

# Container app info
az containerapp show --name ca-rag-service-dev --resource-group $RESOURCE_GROUP > $OUTPUT_DIR/containerapp.json

# Recent logs
az containerapp logs show --name ca-rag-service-dev --resource-group $RESOURCE_GROUP --tail 100 > $OUTPUT_DIR/logs.txt

# Resource list
az resource list --resource-group $RESOURCE_GROUP > $OUTPUT_DIR/resources.json

echo "Diagnostics collected in $OUTPUT_DIR/"
EOF

chmod +x collect-diagnostics.sh
./collect-diagnostics.sh
```

### Useful Links

- [Azure OpenAI Troubleshooting](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/troubleshoot)
- [Azure Search Troubleshooting](https://learn.microsoft.com/en-us/azure/search/search-troubleshoot-common-issues)
- [Container Apps Troubleshooting](https://learn.microsoft.com/en-us/azure/container-apps/troubleshooting)
- [Azure Support](https://azure.microsoft.com/en-us/support/options/)

## Emergency Rollback

If you need to quickly rollback:

```bash
# Option 1: Roll back to previous container image
az containerapp update \
  --name ca-rag-service-prod \
  --resource-group rg-rag-service-prod \
  --image <your-acr>.azurecr.io/rag-service:<previous-tag>

# Option 2: Scale down to stop serving traffic
az containerapp update \
  --name ca-rag-service-prod \
  --resource-group rg-rag-service-prod \
  --min-replicas 0 \
  --max-replicas 0

# Option 3: Restore from previous successful deployment
az deployment group create \
  --resource-group rg-rag-service-prod \
  --template-file main.bicep \
  --parameters @deployment-outputs-prod-backup.json
```

## Support Channels

1. **Internal Team**: Check your team's Slack/Teams channel
2. **Azure Support**: Create a support ticket in Azure Portal
3. **Community**: Stack Overflow with tag `azure`
4. **Documentation**: Review Azure docs and this repository's README

## Prevention

### Pre-Deployment Checklist

- [ ] Run `./deploy.sh <env> --validate-only`
- [ ] Run `./deploy.sh <env> --what-if`
- [ ] Test in dev environment first
- [ ] Review cost estimates
- [ ] Check quota limits
- [ ] Backup existing deployment parameters
- [ ] Notify stakeholders
- [ ] Have rollback plan ready

### Monitoring Setup

Set up these alerts in Application Insights:
- Error rate > 1%
- P95 latency > 5s
- Availability < 99%
- Azure OpenAI 429 errors
- Container restarts

### Regular Maintenance

- Review costs weekly
- Update container images monthly
- Rotate secrets every 90 days
- Review and optimize search indexes
- Clean up old blob storage data
- Update dependencies for security patches
