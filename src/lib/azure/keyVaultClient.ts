/**
 * Azure Key Vault Client
 * Loads secrets from Azure Key Vault for production environments
 */

import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import { azureConfig } from '../../config/azure.js';
import { logger } from '../logger.js';

export class KeyVaultClient {
  private client: SecretClient | null = null;
  private secretCache: Map<string, string> = new Map();

  constructor() {
    if (!azureConfig.keyVault.vaultUrl) {
      logger.info('Key Vault URL not configured, skipping Key Vault client initialization');
      return;
    }

    if (!azureConfig.keyVault.useDefaultCredential) {
      logger.info('DefaultAzureCredential not enabled, skipping Key Vault client');
      return;
    }

    try {
      const credential = new DefaultAzureCredential();
      this.client = new SecretClient(azureConfig.keyVault.vaultUrl, credential);

      logger.info(
        { vaultUrl: azureConfig.keyVault.vaultUrl },
        'Key Vault client initialized'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Key Vault client');
      // Don't throw - allow app to run without Key Vault in dev mode
    }
  }

  /**
   * Get a secret from Key Vault
   * @param secretName - Name of the secret in Key Vault
   * @returns Secret value
   */
  async getSecret(secretName: string): Promise<string | undefined> {
    if (!this.client) {
      logger.warn({ secretName }, 'Key Vault client not initialized, cannot retrieve secret');
      return undefined;
    }

    // Check cache first
    if (this.secretCache.has(secretName)) {
      return this.secretCache.get(secretName);
    }

    try {
      const secret = await this.client.getSecret(secretName);
      
      if (secret.value) {
        // Cache the secret
        this.secretCache.set(secretName, secret.value);
        logger.info({ secretName }, 'Retrieved secret from Key Vault');
        return secret.value;
      }

      logger.warn({ secretName }, 'Secret has no value');
      return undefined;
    } catch (error) {
      logger.error({ error, secretName }, 'Failed to retrieve secret from Key Vault');
      return undefined;
    }
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(secretNames: string[]): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};

    for (const secretName of secretNames) {
      const value = await this.getSecret(secretName);
      if (value) {
        secrets[secretName] = value;
      }
    }

    return secrets;
  }

  /**
   * Clear the secret cache (useful for testing or refreshing secrets)
   */
  clearCache(): void {
    this.secretCache.clear();
    logger.info('Cleared Key Vault secret cache');
  }

  /**
   * Check if Key Vault client is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}

export const keyVaultClient = new KeyVaultClient();
