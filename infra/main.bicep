// ===================================================================
// Azure RAG Service Infrastructure - Main Bicep Template
// ===================================================================
// This template provisions all infrastructure required for the RAG service
// including Azure OpenAI, Cognitive Search, Redis, Storage, Key Vault,
// Application Insights, and Container App for hosting.
// ===================================================================

targetScope = 'resourceGroup'

// ===================================================================
// PARAMETERS
// ===================================================================

@description('Environment name (e.g., dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Application name - used for resource naming')
@minLength(3)
@maxLength(20)
param appName string

@description('Unique suffix for globally unique resource names (leave empty for auto-generation)')
param uniqueSuffix string = uniqueString(resourceGroup().id)

@description('Azure OpenAI location (limited availability - check Azure portal)')
@allowed(['eastus', 'eastus2', 'southcentralus', 'westus', 'westeurope', 'northeurope', 'uksouth', 'swedencentral', 'switzerlandnorth', 'australiaeast', 'canadaeast', 'francecentral', 'japaneast'])
param openAiLocation string = 'eastus'

@description('GPT model deployment name and version')
param gptDeploymentName string = 'gpt-4'
param gptModelName string = 'gpt-4'
param gptModelVersion string = '0613'
param gptDeploymentCapacity int = 10

@description('Embedding model deployment name and version')
param embeddingDeploymentName string = 'text-embedding-3-large'
param embeddingModelName string = 'text-embedding-3-large'
param embeddingModelVersion string = '1'
param embeddingDeploymentCapacity int = 10

@description('Azure Search index configuration')
param searchIndexName string = 'rag-documents'

@description('Redis cache SKU')
@allowed(['Basic', 'Standard', 'Premium'])
param redisCacheSku string = 'Basic'

@description('Redis cache capacity (0-6 for Basic/Standard, 1-5 for Premium)')
@minValue(0)
@maxValue(6)
param redisCacheCapacity int = 1

@description('Storage account SKU')
@allowed(['Standard_LRS', 'Standard_GRS', 'Standard_RAGRS', 'Premium_LRS'])
param storageAccountSku string = 'Standard_LRS'

@description('Blob container name for documents')
param blobContainerName string = 'documents'

@description('Enable public network access (disable for production)')
param enablePublicNetworkAccess bool = environment != 'prod'

@description('Docker image for the RAG service')
param dockerImage string = 'nginx:latest' // Placeholder - update with ACR image

@description('Container CPU cores')
param containerCpu string = '0.5'

@description('Container memory in GB')
param containerMemory string = '1.0'

@description('Minimum container replicas')
@minValue(0)
@maxValue(30)
param minReplicas int = environment == 'prod' ? 2 : 1

@description('Maximum container replicas')
@minValue(1)
@maxValue(30)
param maxReplicas int = environment == 'prod' ? 10 : 3

@description('Tags to apply to all resources')
param tags object = {
  Application: appName
  Environment: environment
  ManagedBy: 'Bicep'
  CostCenter: 'Engineering'
}

// ===================================================================
// VARIABLES
// ===================================================================

var resourceNames = {
  openAi: 'oai-${appName}-${environment}-${uniqueSuffix}'
  search: 'srch-${appName}-${environment}-${uniqueSuffix}'
  redis: 'redis-${appName}-${environment}-${uniqueSuffix}'
  storage: 'st${replace(appName, '-', '')}${environment}${uniqueSuffix}'
  keyVault: 'kv-${appName}-${environment}-${take(uniqueSuffix, 6)}'
  logAnalytics: 'log-${appName}-${environment}'
  appInsights: 'appi-${appName}-${environment}'
  containerAppEnv: 'cae-${appName}-${environment}'
  containerApp: 'ca-${appName}-${environment}'
  managedIdentity: 'id-${appName}-${environment}'
}

// ===================================================================
// MANAGED IDENTITY
// ===================================================================

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: resourceNames.managedIdentity
  location: location
  tags: tags
}

// ===================================================================
// LOG ANALYTICS & APPLICATION INSIGHTS
// ===================================================================

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: resourceNames.logAnalytics
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: environment == 'prod' ? 90 : 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: environment == 'prod' ? -1 : 5
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: resourceNames.appInsights
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ===================================================================
// KEY VAULT
// ===================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: resourceNames.keyVault
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: environment == 'prod'
    publicNetworkAccess: enablePublicNetworkAccess ? 'Enabled' : 'Disabled'
    networkAcls: enablePublicNetworkAccess ? {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    } : {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
  }
}

// Grant the managed identity access to Key Vault secrets
resource keyVaultSecretUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ===================================================================
// AZURE COGNITIVE SEARCH
// ===================================================================

resource searchService 'Microsoft.Search/searchServices@2024-03-01-preview' = {
  name: resourceNames.search
  location: location
  tags: tags
  sku: {
    name: environment == 'prod' ? 'standard' : 'basic'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    replicaCount: environment == 'prod' ? 2 : 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: enablePublicNetworkAccess ? 'enabled' : 'disabled'
    networkRuleSet: {
      bypass: 'AzureServices'
    }
    // Vector search and semantic search capabilities are enabled by default
    semanticSearch: environment == 'prod' ? 'standard' : 'free'
  }
}

// Store Search API key in Key Vault
resource searchApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'azure-search-api-key'
  parent: keyVault
  tags: tags
  properties: {
    value: searchService.listAdminKeys().primaryKey
    contentType: 'text/plain'
  }
}

// ===================================================================
// AZURE OPENAI
// ===================================================================
// NOTE: Azure OpenAI requires special approval and may not be available
// in all subscriptions. Apply for access at: https://aka.ms/oai/access

resource openAiService 'Microsoft.CognitiveServices/accounts@2023-10-01-preview' = {
  name: resourceNames.openAi
  location: openAiLocation
  tags: tags
  sku: {
    name: 'S0'
  }
  kind: 'OpenAI'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: resourceNames.openAi
    publicNetworkAccess: enablePublicNetworkAccess ? 'Enabled' : 'Disabled'
    networkAcls: enablePublicNetworkAccess ? {
      defaultAction: 'Allow'
    } : {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

// Deploy GPT model
resource gptDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-10-01-preview' = {
  name: gptDeploymentName
  parent: openAiService
  sku: {
    name: 'Standard'
    capacity: gptDeploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: gptModelName
      version: gptModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

// Deploy Embedding model
resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2023-10-01-preview' = {
  name: embeddingDeploymentName
  parent: openAiService
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: embeddingModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
  sku: {
    name: 'Standard'
    capacity: embeddingDeploymentCapacity
  }
  dependsOn: [
    gptDeployment // Deploy sequentially to avoid conflicts
  ]
}

// Store OpenAI key in Key Vault
resource openAiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'azure-openai-api-key'
  parent: keyVault
  tags: tags
  properties: {
    value: openAiService.listKeys().key1
    contentType: 'text/plain'
  }
}

// ===================================================================
// AZURE CACHE FOR REDIS
// ===================================================================

resource redisCache 'Microsoft.Cache/redis@2023-08-01' = {
  name: resourceNames.redis
  location: location
  tags: tags
  properties: {
    sku: {
      name: redisCacheSku
      family: redisCacheSku == 'Premium' ? 'P' : 'C'
      capacity: redisCacheCapacity
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: enablePublicNetworkAccess ? 'Enabled' : 'Disabled'
    redisConfiguration: {
      'maxmemory-policy': 'allkeys-lru'
    }
  }
}

// Store Redis connection string in Key Vault
resource redisConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'azure-redis-connection-string'
  parent: keyVault
  tags: tags
  properties: {
    value: '${redisCache.properties.hostName}:${redisCache.properties.sslPort},password=${redisCache.listKeys().primaryKey},ssl=True,abortConnect=False'
    contentType: 'text/plain'
  }
}

resource redisPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'azure-redis-password'
  parent: keyVault
  tags: tags
  properties: {
    value: redisCache.listKeys().primaryKey
    contentType: 'text/plain'
  }
}

// ===================================================================
// STORAGE ACCOUNT
// ===================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: resourceNames.storage
  location: location
  tags: tags
  sku: {
    name: storageAccountSku
  }
  kind: 'StorageV2'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    publicNetworkAccess: enablePublicNetworkAccess ? 'Enabled' : 'Disabled'
    networkAcls: enablePublicNetworkAccess ? {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    } : {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
    encryption: {
      services: {
        blob: {
          enabled: true
        }
        file: {
          enabled: true
        }
      }
      keySource: 'Microsoft.Storage'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  name: 'default'
  parent: storageAccount
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: environment == 'prod' ? 30 : 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: environment == 'prod' ? 30 : 7
    }
  }
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: blobContainerName
  parent: blobService
  properties: {
    publicAccess: 'None'
  }
}

// Grant managed identity access to storage
resource storageBlobDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, managedIdentity.id, 'Storage Blob Data Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe') // Storage Blob Data Contributor
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Store storage connection string in Key Vault
resource storageConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'azure-blob-connection-string'
  parent: keyVault
  tags: tags
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
    contentType: 'text/plain'
  }
}

resource storageAccountKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: 'azure-blob-account-key'
  parent: keyVault
  tags: tags
  properties: {
    value: storageAccount.listKeys().keys[0].value
    contentType: 'text/plain'
  }
}

// ===================================================================
// CONTAINER APP ENVIRONMENT
// ===================================================================

resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: resourceNames.containerAppEnv
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    zoneRedundant: environment == 'prod'
  }
}

// ===================================================================
// CONTAINER APP (RAG Service)
// ===================================================================

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: resourceNames.containerApp
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      secrets: [
        {
          name: 'appinsights-connection-string'
          value: appInsights.properties.ConnectionString
        }
      ]
      registries: [] // Add ACR configuration when ready
    }
    template: {
      containers: [
        {
          name: 'rag-service'
          image: dockerImage
          resources: {
            cpu: json(containerCpu)
            memory: '${containerMemory}Gi'
          }
          env: [
            // General config
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'AZURE_MODE'
              value: 'true'
            }
            // Azure OpenAI
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              value: openAiService.properties.endpoint
            }
            {
              name: 'AZURE_OPENAI_GENERATION_DEPLOYMENT'
              value: gptDeploymentName
            }
            {
              name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT'
              value: embeddingDeploymentName
            }
            {
              name: 'AZURE_OPENAI_API_VERSION'
              value: '2024-02-15-preview'
            }
            {
              name: 'AZURE_OPENAI_KEY_SECRET_NAME'
              value: 'azure-openai-api-key'
            }
            // Azure Search
            {
              name: 'AZURE_SEARCH_ENDPOINT'
              value: 'https://${searchService.name}.search.windows.net'
            }
            {
              name: 'AZURE_SEARCH_INDEX_NAME'
              value: searchIndexName
            }
            {
              name: 'AZURE_SEARCH_KEY_SECRET_NAME'
              value: 'azure-search-api-key'
            }
            // Azure Blob Storage
            {
              name: 'AZURE_BLOB_ACCOUNT_NAME'
              value: storageAccount.name
            }
            {
              name: 'AZURE_BLOB_CONTAINER_NAME'
              value: blobContainerName
            }
            {
              name: 'AZURE_BLOB_KEY_SECRET_NAME'
              value: 'azure-blob-account-key'
            }
            // Azure Redis
            {
              name: 'AZURE_REDIS_HOST'
              value: redisCache.properties.hostName
            }
            {
              name: 'AZURE_REDIS_PORT'
              value: '6380'
            }
            {
              name: 'AZURE_REDIS_PASSWORD_SECRET_NAME'
              value: 'azure-redis-password'
            }
            // Azure Key Vault
            {
              name: 'AZURE_KEYVAULT_URL'
              value: keyVault.properties.vaultUri
            }
            {
              name: 'AZURE_KEYVAULT_USE_DEFAULT_CREDENTIAL'
              value: 'true'
            }
            // Managed Identity
            {
              name: 'AZURE_CLIENT_ID'
              value: managedIdentity.properties.clientId
            }
            // Application Insights
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 5
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    keyVaultSecretUserRole
    storageBlobDataContributorRole
  ]
}

// ===================================================================
// OUTPUTS
// ===================================================================

output resourceGroupName string = resourceGroup().name
output location string = location
output environment string = environment

output managedIdentityId string = managedIdentity.id
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId

output logAnalyticsWorkspaceId string = logAnalytics.id
output logAnalyticsWorkspaceName string = logAnalytics.name
output appInsightsId string = appInsights.id
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri

output searchServiceId string = searchService.id
output searchServiceName string = searchService.name
output searchServiceEndpoint string = 'https://${searchService.name}.search.windows.net'

output openAiServiceId string = openAiService.id
output openAiServiceName string = openAiService.name
output openAiServiceEndpoint string = openAiService.properties.endpoint
output gptDeploymentName string = gptDeploymentName
output embeddingDeploymentName string = embeddingDeploymentName

output redisCacheId string = redisCache.id
output redisCacheName string = redisCache.name
output redisCacheHostName string = redisCache.properties.hostName
output redisCacheSslPort int = redisCache.properties.sslPort

output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output blobContainerName string = blobContainerName

output containerAppEnvironmentId string = containerAppEnvironment.id
output containerAppId string = containerApp.id
output containerAppName string = containerApp.name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'

output deploymentSummary object = {
  resourceGroup: resourceGroup().name
  environment: environment
  appUrl: 'https://${containerApp.properties.configuration.ingress.fqdn}'
  managedIdentityClientId: managedIdentity.properties.clientId
  keyVaultUrl: keyVault.properties.vaultUri
  searchEndpoint: 'https://${searchService.name}.search.windows.net'
  openAiEndpoint: openAiService.properties.endpoint
  redisHostname: redisCache.properties.hostName
  storageAccount: storageAccount.name
}
