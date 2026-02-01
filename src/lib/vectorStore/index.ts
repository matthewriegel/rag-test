import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../config/index.js';
import { DocumentChunk, SearchResult } from '../../config/types.js';
import { logger } from '../logger.js';

export class VectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private vectorSize: number;
  private initialized = false;

  constructor() {
    const clientConfig: {
      url: string;
      apiKey?: string | undefined;
    } = {
      url: config.qdrant.url,
    };

    if (config.qdrant.apiKey) {
      clientConfig.apiKey = config.qdrant.apiKey;
    }

    this.client = new QdrantClient(clientConfig);
    this.collectionName = config.qdrant.collectionName;
    this.vectorSize = config.qdrant.vectorSize;
  }

  /**
   * Initialize vector store and create collection if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!exists) {
        logger.info({ collection: this.collectionName }, 'Creating Qdrant collection');
        
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
      }

      this.initialized = true;
      logger.info({ collection: this.collectionName }, 'Vector store initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize vector store');
      throw error;
    }
  }

  /**
   * Store document chunks with embeddings
   */
  async storeChunks(chunks: DocumentChunk[]): Promise<void> {
    await this.initialize();

    if (chunks.length === 0) {
      return;
    }

    const points = chunks.map((chunk) => ({
      id: chunk.id,
      vector: chunk.embedding || [],
      payload: {
        content: chunk.content,
        metadata: chunk.metadata,
      },
    }));

    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points,
      });

      logger.info({ chunks: chunks.length }, 'Stored chunks in vector store');
    } catch (error) {
      logger.error({ error, chunks: chunks.length }, 'Failed to store chunks');
      throw error;
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async search(
    queryEmbedding: number[],
    limit: number = config.rag.topK,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    await this.initialize();

    try {
      const searchParams: {
        vector: number[];
        limit: number;
        with_payload: boolean;
        filter?: {
          must: Array<{
            key: string;
            match: { value: unknown };
          }>;
        };
      } = {
        vector: queryEmbedding,
        limit,
        with_payload: true,
      };

      // Add metadata filter if provided
      if (filter && Object.keys(filter).length > 0) {
        searchParams.filter = {
          must: Object.entries(filter).map(([key, value]) => ({
            key: `metadata.${key}`,
            match: { value },
          })),
        };
      }

      const results = await this.client.search(this.collectionName, searchParams);

      return results.map((result) => ({
        id: result.id as string,
        score: result.score,
        payload: {
          content: (result.payload?.['content'] as string) || '',
          metadata: (result.payload?.['metadata'] as DocumentChunk['metadata']) || {
            documentId: '',
            chunkIndex: 0,
            totalChunks: 0,
          },
        },
      }));
    } catch (error) {
      logger.error({ error }, 'Vector search failed');
      throw error;
    }
  }

  /**
   * Delete all points for a specific document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.initialize();

    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'metadata.documentId',
              match: { value: documentId },
            },
          ],
        },
      });

      logger.info({ documentId }, 'Deleted document from vector store');
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete document');
      throw error;
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<unknown> {
    await this.initialize();
    return this.client.getCollection(this.collectionName);
  }

  /**
   * Delete entire collection
   */
  async deleteCollection(): Promise<void> {
    try {
      await this.client.deleteCollection(this.collectionName);
      this.initialized = false;
      logger.info({ collection: this.collectionName }, 'Deleted collection');
    } catch (error) {
      logger.error({ error }, 'Failed to delete collection');
      throw error;
    }
  }
}

export const vectorStore = new VectorStore();
