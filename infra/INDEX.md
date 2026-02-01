# Azure Infrastructure Documentation Index

Complete infrastructure documentation for deploying the RAG service to Azure.

## 📁 Files Overview

### Core Infrastructure
- **`main.bicep`** - Main Bicep template that provisions all Azure resources
  - Azure OpenAI (with GPT-4 and text-embedding-3-large deployments)
  - Azure Cognitive Search (with vector search capability)
  - Azure Cache for Redis
  - Azure Storage Account with Blob container
  - Azure Key Vault
  - Application Insights + Log Analytics Workspace
  - Azure Container App for hosting the Node.js service
  - Managed Identity for secure access

### Configuration Files
- **`parameters.json`** - Default parameters (for dev environment)
- **`parameters.prod.json`** - Production environment parameters
- **`parameters.staging.json`** - Staging environment parameters
- **`.env.azure.example`** - Example environment variables for Azure services

### Scripts
- **`deploy.sh`** - Automated deployment script with validation and rollback support

### Documentation
- **`README.md`** - Deployment instructions, RBAC permissions, cost estimates
- **`migration-plan.md`** - Complete migration plan from current system to Azure
- **`TROUBLESHOOTING.md`** - Common issues and solutions
- **`INDEX.md`** (this file) - Overview and quick reference

## 🚀 Quick Start

### For First-Time Deployment

1. **Prerequisites**
   ```bash
   # Install Azure CLI
   curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   
   # Login to Azure
   az login
   
   # Set your subscription
   az account set --subscription "<subscription-id>"
   ```

2. **Apply for Azure OpenAI Access**
   - Visit: https://aka.ms/oai/access
   - Wait for approval (1-5 business days)

3. **Deploy to Development**
   ```bash
   cd infra
   ./deploy.sh dev
   ```

### For Production Deployment

1. **Review Configuration**
   - Edit `parameters.prod.json` with your settings
   - Review security settings (disable public access, enable private endpoints)

2. **Deploy**
   ```bash
   ./deploy.sh prod --validate-only  # Validate first
   ./deploy.sh prod --what-if        # Preview changes
   ./deploy.sh prod                  # Deploy
   ```

## 📖 Documentation Guide

### Start Here
1. **New to Azure?** → Read `README.md` first
2. **Planning a migration?** → Read `migration-plan.md`
3. **Having issues?** → Check `TROUBLESHOOTING.md`

### By Task

#### Initial Setup
- Read: `README.md` > Prerequisites
- Read: `README.md` > Azure OpenAI Access
- Review: `parameters.json` or create environment-specific file
- Run: `./deploy.sh dev --validate-only`

#### Deploying Infrastructure
- Review: `main.bicep` to understand resources
- Customize: `parameters.<env>.json` for your environment
- Deploy: `./deploy.sh <env>`
- Verify: Check outputs and test endpoints

#### Migration from Existing System
- Read: `migration-plan.md` > Pre-Migration Checklist
- Plan: Follow the week-by-week migration strategy
- Execute: Step-by-step migration process
- Validate: Post-migration validation checklist

#### Troubleshooting
- Quick reference: `TROUBLESHOOTING.md` > Common Issues
- Diagnostics: `TROUBLESHOOTING.md` > Debugging Techniques
- Support: `TROUBLESHOOTING.md` > Getting Help

#### Configuration
- Application config: `.env.azure.example`
- Infrastructure config: `parameters.<env>.json`
- Deployment config: `deploy.sh` environment variables

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Azure Container App                      │
│                      (Node.js Service)                       │
│  - Auto-scaling (1-10 replicas)                             │
│  - Managed Identity for authentication                       │
│  - Health checks & monitoring                                │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Azure OpenAI │    │    Azure     │    │    Azure     │
│              │    │  Cognitive   │    │  Cache for   │
│ - GPT-4      │    │   Search     │    │    Redis     │
│ - Embedding  │    │ - Vector DB  │    │ - Caching    │
└──────────────┘    └──────────────┘    └──────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    Azure     │    │    Azure     │    │ Application  │
│ Blob Storage │    │  Key Vault   │    │   Insights   │
│ - Documents  │    │ - Secrets    │    │ - Monitoring │
└──────────────┘    └──────────────┘    └──────────────┘
```

## 💰 Cost Summary

| Environment | Monthly Cost | Key Resources |
|-------------|--------------|---------------|
| Development | $150-250 | Basic tiers, minimal replicas |
| Staging | $300-450 | Standard tiers, moderate usage |
| Production | $600-1200 | Standard/Premium tiers, HA setup |

> See `README.md` > Cost Estimates for detailed breakdown

## 🔒 Security Best Practices

1. **Use Managed Identity** - No keys in code
2. **Store Secrets in Key Vault** - Centralized secret management
3. **Disable Public Access** - Use private endpoints for production
4. **Enable Soft Delete** - Key Vault & Storage protection
5. **RBAC over Keys** - Use Azure AD authentication
6. **Network Security** - VNet integration, firewall rules
7. **Monitoring & Alerts** - Application Insights tracking

> See `main.bicep` for implementation details

## 📊 Resource Naming Convention

```
Resource Type          | Format                    | Example
-----------------------|---------------------------|---------------------------
Resource Group         | rg-{app}-{env}            | rg-rag-service-prod
Azure OpenAI           | oai-{app}-{env}-{suffix}  | oai-rag-service-prod-abc123
Cognitive Search       | srch-{app}-{env}-{suffix} | srch-rag-service-prod-abc123
Redis Cache            | redis-{app}-{env}-{suffix}| redis-rag-service-prod-abc123
Storage Account        | st{app}{env}{suffix}      | stragserviceprodabc123
Key Vault              | kv-{app}-{env}-{suffix}   | kv-rag-service-prod-abc123
Log Analytics          | log-{app}-{env}           | log-rag-service-prod
Application Insights   | appi-{app}-{env}          | appi-rag-service-prod
Container App Env      | cae-{app}-{env}           | cae-rag-service-prod
Container App          | ca-{app}-{env}            | ca-rag-service-prod
Managed Identity       | id-{app}-{env}            | id-rag-service-prod
```

## 🔄 Common Workflows

### Deploy New Version
```bash
# Build and push new image
docker build -t your-acr.azurecr.io/rag-service:v1.2.0 .
docker push your-acr.azurecr.io/rag-service:v1.2.0

# Update parameter file with new image tag
# Edit parameters.prod.json: dockerImage = "your-acr.azurecr.io/rag-service:v1.2.0"

# Deploy
./deploy.sh prod
```

### Scale Up/Down
```bash
# Via Azure CLI
az containerapp update \
  --name ca-rag-service-prod \
  --resource-group rg-rag-service-prod \
  --min-replicas 5 \
  --max-replicas 20

# Or edit parameters.prod.json and redeploy
```

### View Logs
```bash
# Live logs
az containerapp logs show \
  --name ca-rag-service-prod \
  --resource-group rg-rag-service-prod \
  --follow

# Application Insights logs
# Azure Portal > Application Insights > Logs
```

### Update Secrets
```bash
# Update in Key Vault
az keyvault secret set \
  --vault-name kv-rag-service-prod \
  --name azure-openai-api-key \
  --value "new-key-value"

# Container app will automatically pick up new value on restart
az containerapp restart \
  --name ca-rag-service-prod \
  --resource-group rg-rag-service-prod
```

## 🧪 Testing Checklist

After deployment, verify:

- [ ] Health endpoint responds: `curl https://<app-url>/health`
- [ ] OpenAI integration works: Test `/api/query` endpoint
- [ ] Search integration works: Check vector search results
- [ ] Redis caching works: Monitor cache hit rate
- [ ] Blob storage works: Upload a test document
- [ ] Managed identity works: No authentication errors
- [ ] Application Insights: Metrics appearing in portal
- [ ] Auto-scaling works: Load test and verify scaling

## 📚 Additional Resources

### Microsoft Documentation
- [Azure Bicep](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
- [Azure OpenAI](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Azure Cognitive Search](https://learn.microsoft.com/en-us/azure/search/)
- [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/)
- [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/)
- [Managed Identities](https://learn.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/)

### Related Documentation
- `/ARCHITECTURE.md` - Overall service architecture
- `/README.md` - Application documentation
- `/QUICKSTART.md` - Local development guide
- `/src/config/azure.ts` - Azure configuration code

## 🐛 Known Limitations

1. **Azure OpenAI**: Requires special access approval
2. **Regional Availability**: Azure OpenAI not available in all regions
3. **Quotas**: Default TPM limits may need increases for production
4. **Private Endpoints**: Requires VNet setup (not included in basic template)
5. **Custom Domains**: Requires additional configuration
6. **Backup/DR**: Implement additional backup strategy for production

## 🛠️ Maintenance

### Monthly Tasks
- [ ] Review cost reports and optimize
- [ ] Check for Azure service updates
- [ ] Review Application Insights for issues
- [ ] Update container image with latest patches
- [ ] Rotate secrets (quarterly)

### Quarterly Tasks
- [ ] Review and update Bicep templates
- [ ] Test disaster recovery procedures
- [ ] Review security configuration
- [ ] Update documentation
- [ ] Performance optimization review

## 🆘 Getting Help

1. **Check Documentation**: Review files in this directory
2. **Troubleshooting Guide**: See `TROUBLESHOOTING.md`
3. **Azure Support**: Create ticket in Azure Portal
4. **Team Support**: Contact your DevOps/Platform team
5. **Community**: Stack Overflow, Azure forums

## 📝 Contributing

When updating infrastructure:

1. Test in dev environment first
2. Update relevant documentation
3. Update parameter examples
4. Test with `--what-if` before deploying
5. Document any breaking changes
6. Update this index if adding new files

## ✅ Pre-Deployment Checklist

Before deploying to production:

- [ ] Azure OpenAI access approved and verified
- [ ] All parameter files reviewed and customized
- [ ] Cost estimates reviewed and approved
- [ ] RBAC permissions configured
- [ ] Network security reviewed (private endpoints for prod)
- [ ] Monitoring and alerts configured
- [ ] Backup and DR strategy defined
- [ ] Tested successfully in dev/staging
- [ ] Rollback plan documented and tested
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled (if applicable)

---

**Last Updated**: 2024-02-01  
**Version**: 1.0  
**Maintained By**: Platform Engineering Team
