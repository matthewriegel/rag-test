/**
 * Azure-specific configuration
 * This file centralizes all Azure service configuration
 */

export interface AzureConfig {
  enabled: boolean;
  openai: {
    endpoint: string;
    apiKey?: string;
    keyVaultSecretName?: string;
    deployments: {
      generation: string; // Deployment name for gpt-4 or similar
      embedding: string;  // Deployment name for text-embedding-3-large
    };
    apiVersion: string;
  };
  search: {
    endpoint: string;
    apiKey?: string;
    keyVaultSecretName?: string;
    indexName: string;
    vectorSize: number;
  };
  blob: {
    accountName: string;
    containerName: string;
    accountKey?: string;
    keyVaultSecretName?: string;
    connectionString?: string;
  };
  redis: {
    // Azure Cache for Redis connection string
    connectionString?: string;
    // Or individual components
    host?: string;
    port?: number;
    password?: string;
    keyVaultSecretName?: string;
  };
  keyVault: {
    vaultUrl?: string;
    useDefaultCredential: boolean;
  };
  appInsights: {
    connectionString?: string;
    instrumentationKey?: string;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    if (isAzureMode()) {
      throw new Error(`Environment variable ${key} is required in Azure mode but not set`);
    }
    return '';
  }
  return value || defaultValue || '';
}

function getEnvVarOptional(key: string): string | undefined {
  return process.env[key];
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function isAzureMode(): boolean {
  return process.env['AZURE_MODE'] === 'true';
}

export const azureConfig: AzureConfig = {
  enabled: isAzureMode(),

  openai: {
    endpoint: getEnvVar('AZURE_OPENAI_ENDPOINT', ''),
    apiKey: getEnvVarOptional('AZURE_OPENAI_KEY'),
    keyVaultSecretName: getEnvVarOptional('AZURE_OPENAI_KEY_SECRET_NAME'),
    deployments: {
      // Note: gpt-4.1-mini doesn't exist; using gpt-4 or gpt-35-turbo deployment
      generation: getEnvVar('AZURE_OPENAI_GENERATION_DEPLOYMENT', 'gpt-4'),
      embedding: getEnvVar('AZURE_OPENAI_EMBEDDING_DEPLOYMENT', 'text-embedding-3-large'),
    },
    apiVersion: getEnvVar('AZURE_OPENAI_API_VERSION', '2024-02-15-preview'),
  },

  search: {
    endpoint: getEnvVar('AZURE_SEARCH_ENDPOINT', ''),
    apiKey: getEnvVarOptional('AZURE_SEARCH_API_KEY'),
    keyVaultSecretName: getEnvVarOptional('AZURE_SEARCH_KEY_SECRET_NAME'),
    indexName: getEnvVar('AZURE_SEARCH_INDEX_NAME', 'rag-documents'),
    vectorSize: 3072, // text-embedding-3-large produces 3072-dimensional vectors
  },

  blob: {
    accountName: getEnvVar('AZURE_BLOB_ACCOUNT_NAME', ''),
    containerName: getEnvVar('AZURE_BLOB_CONTAINER_NAME', 'documents'),
    accountKey: getEnvVarOptional('AZURE_BLOB_ACCOUNT_KEY'),
    keyVaultSecretName: getEnvVarOptional('AZURE_BLOB_KEY_SECRET_NAME'),
    connectionString: getEnvVarOptional('AZURE_BLOB_CONNECTION_STRING'),
  },

  redis: {
    connectionString: getEnvVarOptional('AZURE_REDIS_CONNECTION_STRING'),
    host: getEnvVarOptional('AZURE_REDIS_HOST'),
    port: getEnvNumber('AZURE_REDIS_PORT', 6380), // Azure Redis default SSL port
    password: getEnvVarOptional('AZURE_REDIS_PASSWORD'),
    keyVaultSecretName: getEnvVarOptional('AZURE_REDIS_PASSWORD_SECRET_NAME'),
  },

  keyVault: {
    vaultUrl: getEnvVarOptional('AZURE_KEYVAULT_URL'),
    useDefaultCredential: getEnvVarOptional('AZURE_KEYVAULT_USE_DEFAULT_CREDENTIAL') === 'true',
  },

  appInsights: {
    connectionString: getEnvVarOptional('APPLICATIONINSIGHTS_CONNECTION_STRING'),
    instrumentationKey: getEnvVarOptional('APPINSIGHTS_INSTRUMENTATIONKEY'),
  },
};
