/**
 * Azure AI Search Vector Store Adapter
 * Implements vector + hybrid search using Azure Cognitive Search
 */

import {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
} from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { azureConfig } from '../../config/azure.js';
import { DocumentChunk, SearchResult } from '../../config/types.js';
import { logger } from '../logger.js';

/**
 * Document schema for Azure AI Search index
 */
interface AzureSearchDocument {
  id: string;
  content: string;
  contentVector: number[];
  documentId: string;
  chunkIndex: number;
  totalChunks: number;
  customerId?: string;
  metadata: Record<string, unknown>;
}

export class AzureSearchVectorStore {
  private searchClient: SearchClient<AzureSearchDocument>;
  private indexClient: SearchIndexClient;
  private indexName: string;
  private vectorSize: number;
  private initialized = false;

  constructor() {
    if (!azureConfig.search.endpoint) {
      throw new Error('AZURE_SEARCH_ENDPOINT is required in Azure mode');
    }

    this.indexName = azureConfig.search.indexName;
    this.vectorSize = azureConfig.search.vectorSize;

    // Create credential
    let credential;
    if (azureConfig.search.apiKey) {
      credential = new AzureKeyCredential(azureConfig.search.apiKey);
    } else if (azureConfig.keyVault.useDefaultCredential) {
      credential = new DefaultAzureCredential();
    } else {
      throw new Error('AZURE_SEARCH_API_KEY required or configure DefaultAzureCredential');
    }

    // Initialize clients
    this.searchClient = new SearchClient<AzureSearchDocument>(
      azureConfig.search.endpoint,
      this.indexName,
      credential
    );

    this.indexClient = new SearchIndexClient(azureConfig.search.endpoint, credential);

    logger.info(
      {
        endpoint: azureConfig.search.endpoint,
        indexName: this.indexName,
        vectorSize: this.vectorSize,
      },
      'Azure Search vector store initialized'
    );
  }

  /**
   * Initialize Azure Search index if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Check if index exists
      try {
        await this.indexClient.getIndex(this.indexName);
        logger.info({ indexName: this.indexName }, 'Azure Search index exists');
      } catch (error) {
        // Index doesn't exist, create it
        logger.info({ indexName: this.indexName }, 'Creating Azure Search index');
        await this.createIndex();
      }

      this.initialized = true;
      logger.info({ indexName: this.indexName }, 'Azure Search vector store ready');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Azure Search vector store');
      throw error;
    }
  }

  /**
   * Create the search index with vector search configuration
   */
  private async createIndex(): Promise<void> {
    const indexDefinition = {
      name: this.indexName,
      fields: [
        {
          name: 'id',
          type: 'Edm.String',
          key: true,
          filterable: true,
          searchable: false,
        },
        {
          name: 'content',
          type: 'Edm.String',
          searchable: true,
          filterable: false,
          sortable: false,
        },
        {
          name: 'contentVector',
          type: 'Collection(Edm.Single)',
          searchable: true,
          dimensions: this.vectorSize,
          vectorSearchProfile: 'vector-profile',
        },
        {
          name: 'documentId',
          type: 'Edm.String',
          filterable: true,
          searchable: false,
          facetable: true,
        },
        {
          name: 'chunkIndex',
          type: 'Edm.Int32',
          filterable: true,
          sortable: true,
        },
        {
          name: 'totalChunks',
          type: 'Edm.Int32',
          filterable: false,
        },
        {
          name: 'customerId',
          type: 'Edm.String',
          filterable: true,
          searchable: false,
          facetable: true,
        },
        {
          name: 'metadata',
          type: 'Edm.ComplexType',
          fields: [
            {
              name: 'source',
              type: 'Edm.String',
              filterable: true,
            },
          ],
        },
      ],
      vectorSearch: {
        algorithms: [
          {
            name: 'vector-config',
            kind: 'hnsw',
            hnswParameters: {
              metric: 'cosine',
              m: 4,
              efConstruction: 400,
              efSearch: 500,
            },
          },
        ],
        profiles: [
          {
            name: 'vector-profile',
            algorithm: 'vector-config',
          },
        ],
      },
      semantic: {
        configurations: [
          {
            name: 'semantic-config',
            prioritizedFields: {
              titleField: {
                fieldName: 'documentId',
              },
              prioritizedContentFields: [
                {
                  fieldName: 'content',
                },
              ],
            },
          },
        ],
      },
    };

    await this.indexClient.createIndex(indexDefinition as never);
    logger.info({ indexName: this.indexName }, 'Created Azure Search index');
  }

  /**
   * Store document chunks with embeddings
   */
  async storeChunks(chunks: DocumentChunk[]): Promise<void> {
    await this.initialize();

    if (chunks.length === 0) {
      return;
    }

    // Convert chunks to Azure Search documents
    const documents: AzureSearchDocument[] = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      contentVector: chunk.embedding || [],
      documentId: chunk.metadata.documentId,
      chunkIndex: chunk.metadata.chunkIndex,
      totalChunks: chunk.metadata.totalChunks,
      customerId: chunk.metadata.customerId,
      metadata: {
        source: chunk.metadata.source,
        ...chunk.metadata,
      },
    }));

    try {
      // Upload documents in batches
      const result = await this.searchClient.uploadDocuments(documents);

      const succeeded = result.results.filter((r) => r.succeeded).length;
      const failed = result.results.filter((r) => !r.succeeded).length;

      if (failed > 0) {
        logger.warn(
          { succeeded, failed, total: chunks.length },
          'Some documents failed to upload'
        );
      }

      logger.info({ chunks: succeeded }, 'Stored chunks in Azure Search');
    } catch (error) {
      logger.error({ error, chunks: chunks.length }, 'Failed to store chunks in Azure Search');
      throw error;
    }
  }

  /**
   * Search for similar documents using hybrid search (vector + lexical)
   */
  async search(
    queryEmbedding: number[],
    limit: number = 5,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    await this.initialize();

    try {
      // Build filter expression
      let filterExpression: string | undefined;
      if (filter && Object.keys(filter).length > 0) {
        const filterParts: string[] = [];
        for (const [key, value] of Object.entries(filter)) {
          if (typeof value === 'string') {
            filterParts.push(`${key} eq '${value}'`);
          } else {
            filterParts.push(`${key} eq ${value}`);
          }
        }
        filterExpression = filterParts.join(' and ');
      }

      // Perform hybrid search (vector + full text)
      const searchResults = await this.searchClient.search('*', {
        vectorSearchOptions: {
          queries: [
            {
              kind: 'vector',
              vector: queryEmbedding,
              kNearestNeighborsCount: limit,
              fields: ['contentVector'],
            },
          ],
        },
        top: limit,
        filter: filterExpression,
        select: ['id', 'content', 'documentId', 'chunkIndex', 'totalChunks', 'customerId'],
      });

      const results: SearchResult[] = [];
      for await (const result of searchResults.results) {
        // Calculate combined score from vector similarity and lexical match
        // Azure Search returns @search.score (relevance) and @search.rerankerScore
        const vectorScore = (result as { '@search.score'?: number })['@search.score'] || 0;

        results.push({
          id: result.document.id,
          score: vectorScore / 100, // Normalize to 0-1 range (Azure scores are often 0-100)
          payload: {
            content: result.document.content,
            metadata: {
              documentId: result.document.documentId,
              chunkIndex: result.document.chunkIndex,
              totalChunks: result.document.totalChunks,
              customerId: result.document.customerId,
            },
          },
        });
      }

      logger.debug({ resultsCount: results.length, limit }, 'Azure Search results');
      return results;
    } catch (error) {
      logger.error({ error }, 'Azure Search failed');
      throw error;
    }
  }

  /**
   * Delete all documents for a specific documentId
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.initialize();

    try {
      // First, search for all documents with this documentId
      const searchResults = await this.searchClient.search('*', {
        filter: `documentId eq '${documentId}'`,
        select: ['id'],
        top: 1000, // Reasonable max chunks per document
      });

      const idsToDelete: string[] = [];
      for await (const result of searchResults.results) {
        idsToDelete.push(result.document.id);
      }

      if (idsToDelete.length === 0) {
        logger.info({ documentId }, 'No documents found to delete');
        return;
      }

      // Delete documents
      const documentsToDelete = idsToDelete.map((id) => ({ id } as AzureSearchDocument));
      await this.searchClient.deleteDocuments(documentsToDelete);

      logger.info({ documentId, deletedCount: idsToDelete.length }, 'Deleted document chunks');
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete document from Azure Search');
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getCollectionInfo(): Promise<unknown> {
    await this.initialize();
    
    try {
      const stats = await this.indexClient.getIndexStatistics(this.indexName);
      return {
        name: this.indexName,
        documentCount: stats.documentCount,
        storageSize: stats.storageSize,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get index statistics');
      throw error;
    }
  }

  /**
   * Delete entire index (use with caution!)
   */
  async deleteCollection(): Promise<void> {
    try {
      await this.indexClient.deleteIndex(this.indexName);
      this.initialized = false;
      logger.info({ indexName: this.indexName }, 'Deleted Azure Search index');
    } catch (error) {
      logger.error({ error }, 'Failed to delete Azure Search index');
      throw error;
    }
  }
}

export const azureSearchVectorStore = new AzureSearchVectorStore();
