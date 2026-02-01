/**
 * Azure Blob Storage Client
 * Handles storing and retrieving original customer documents
 */

import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { azureConfig } from '../../config/azure.js';
import { logger } from '../logger.js';

export class BlobStorageClient {
  private containerClient: ContainerClient;
  private initialized = false;

  constructor() {
    if (!azureConfig.blob.accountName) {
      throw new Error('AZURE_BLOB_ACCOUNT_NAME is required in Azure mode');
    }

    let blobServiceClient: BlobServiceClient;

    if (azureConfig.blob.connectionString) {
      // Option 1: Connection string
      blobServiceClient = BlobServiceClient.fromConnectionString(
        azureConfig.blob.connectionString
      );
    } else if (azureConfig.blob.accountKey) {
      // Option 2: Account key
      const accountUrl = `https://${azureConfig.blob.accountName}.blob.core.windows.net`;
      blobServiceClient = new BlobServiceClient(
        accountUrl,
        {
          accountName: azureConfig.blob.accountName,
          accountKey: azureConfig.blob.accountKey,
        } as never
      );
    } else if (azureConfig.keyVault.useDefaultCredential) {
      // Option 3: Managed identity
      const accountUrl = `https://${azureConfig.blob.accountName}.blob.core.windows.net`;
      const credential = new DefaultAzureCredential();
      blobServiceClient = new BlobServiceClient(accountUrl, credential);
    } else {
      throw new Error(
        'AZURE_BLOB_CONNECTION_STRING or AZURE_BLOB_ACCOUNT_KEY required or configure DefaultAzureCredential'
      );
    }

    this.containerClient = blobServiceClient.getContainerClient(
      azureConfig.blob.containerName
    );

    logger.info(
      {
        accountName: azureConfig.blob.accountName,
        containerName: azureConfig.blob.containerName,
      },
      'Blob storage client initialized'
    );
  }

  /**
   * Initialize blob container if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create container if it doesn't exist (with no public access)
      await this.containerClient.createIfNotExists();

      this.initialized = true;
      logger.info(
        { containerName: azureConfig.blob.containerName },
        'Blob storage container ready'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize blob storage container');
      throw error;
    }
  }

  /**
   * Upload a document to blob storage
   * @param customerId - Customer identifier for organizing documents
   * @param documentId - Document identifier
   * @param content - Document content (text or buffer)
   * @param metadata - Optional metadata
   * @returns Blob URL
   */
  async uploadDocument(
    customerId: string,
    documentId: string,
    content: string | Buffer,
    metadata?: Record<string, string>
  ): Promise<string> {
    await this.initialize();

    try {
      // Create blob path: customer/documentId
      const blobName = `${customerId}/${documentId}`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Upload with metadata
      const uploadOptions = {
        metadata: {
          customerId,
          documentId,
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      };

      if (typeof content === 'string') {
        await blockBlobClient.upload(content, content.length, uploadOptions);
      } else {
        await blockBlobClient.upload(content, content.length, uploadOptions);
      }

      logger.info({ customerId, documentId, blobName }, 'Uploaded document to blob storage');

      return blockBlobClient.url;
    } catch (error) {
      logger.error({ error, customerId, documentId }, 'Failed to upload document');
      throw error;
    }
  }

  /**
   * Download a document from blob storage
   * @param customerId - Customer identifier
   * @param documentId - Document identifier
   * @returns Document content as string
   */
  async downloadDocument(customerId: string, documentId: string): Promise<string> {
    await this.initialize();

    try {
      const blobName = `${customerId}/${documentId}`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      const downloadResponse = await blockBlobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        throw new Error('No content in blob');
      }

      // Convert stream to string
      const content = await this.streamToString(downloadResponse.readableStreamBody);

      logger.info({ customerId, documentId }, 'Downloaded document from blob storage');

      return content;
    } catch (error) {
      logger.error({ error, customerId, documentId }, 'Failed to download document');
      throw error;
    }
  }

  /**
   * Check if a document exists in blob storage
   */
  async documentExists(customerId: string, documentId: string): Promise<boolean> {
    await this.initialize();

    try {
      const blobName = `${customerId}/${documentId}`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      return await blockBlobClient.exists();
    } catch (error) {
      logger.error({ error, customerId, documentId }, 'Failed to check document existence');
      return false;
    }
  }

  /**
   * Delete a document from blob storage
   */
  async deleteDocument(customerId: string, documentId: string): Promise<void> {
    await this.initialize();

    try {
      const blobName = `${customerId}/${documentId}`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.deleteIfExists();

      logger.info({ customerId, documentId }, 'Deleted document from blob storage');
    } catch (error) {
      logger.error({ error, customerId, documentId }, 'Failed to delete document');
      throw error;
    }
  }

  /**
   * List all documents for a customer
   */
  async listDocuments(customerId: string): Promise<string[]> {
    await this.initialize();

    try {
      const prefix = `${customerId}/`;
      const documents: string[] = [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
        // Extract documentId from blob name (remove customer prefix)
        const documentId = blob.name.substring(prefix.length);
        documents.push(documentId);
      }

      return documents;
    } catch (error) {
      logger.error({ error, customerId }, 'Failed to list documents');
      throw error;
    }
  }

  /**
   * Helper to convert readable stream to string
   */
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data: Buffer) => {
        chunks.push(data);
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      readableStream.on('error', reject);
    });
  }
}

export const blobStorageClient = new BlobStorageClient();
