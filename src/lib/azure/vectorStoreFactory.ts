/**
 * Vector Store Factory
 * Returns either Azure AI Search or Qdrant vector store based on configuration
 */

import { config } from '../../config/index.js';
import { VectorStore } from '../vectorStore/index.js';
import { AzureSearchVectorStore } from './searchAdapter.js';
import { logger } from '../logger.js';
import { DocumentChunk, SearchResult } from '../../config/types.js';

/**
 * Interface that both vector stores must implement
 */
export interface IVectorStore {
  initialize(): Promise<void>;
  storeChunks(chunks: DocumentChunk[]): Promise<void>;
  search(
    queryEmbedding: number[],
    limit?: number,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]>;
  deleteDocument(documentId: string): Promise<void>;
  getCollectionInfo(): Promise<unknown>;
  deleteCollection(): Promise<void>;
}

/**
 * Get the appropriate vector store based on configuration
 */
export function getVectorStore(): IVectorStore {
  if (config.azureMode) {
    logger.info('Using Azure AI Search vector store');
    return new AzureSearchVectorStore();
  } else {
    logger.info('Using Qdrant vector store');
    return new VectorStore();
  }
}

// Export singleton instance
export const vectorStoreClient = getVectorStore();
