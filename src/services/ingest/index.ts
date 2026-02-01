import { embeddingService } from '../../lib/embeddings/index.js';
import { vectorStore } from '../../lib/vectorStore/index.js';
import { cacheService } from '../../lib/cache/index.js';
import { DocumentChunk, IngestRequest, IngestResponse } from '../../config/types.js';
import { logger } from '../../lib/logger.js';
import { redactPII } from '../../lib/logger.js';

export class IngestionService {
  /**
   * Ingest a document with idempotency
   * If document already exists, it will be replaced
   */
  async ingestDocument(request: IngestRequest): Promise<IngestResponse> {
    const { documentId, customerId, content, metadata = {} } = request;

    logger.info(
      {
        documentId,
        customerId,
        contentLength: content.length,
      },
      'Starting document ingestion'
    );

    try {
      // Delete existing document if present (idempotency)
      await vectorStore.deleteDocument(documentId);

      // Apply PII redaction if enabled
      const processedContent = this.applyPIIRedaction(content);

      // Chunk the document
      const chunker = embeddingService.getChunker();
      const chunks = chunker.chunkText(processedContent);

      if (chunks.length === 0) {
        logger.warn({ documentId }, 'No chunks created from document');
        return {
          success: false,
          documentId,
          chunksCreated: 0,
        };
      }

      // Create embeddings for all chunks
      const embeddingResults = await embeddingService.embedBatch(
        chunks.map((c) => c.text)
      );

      // Validate all embeddings were created successfully
      for (let i = 0; i < embeddingResults.length; i++) {
        const embedding = embeddingResults[i]?.embedding;
        if (!embedding || embedding.length === 0) {
          throw new Error(
            `Failed to create embedding for chunk ${i} of document ${documentId}`
          );
        }
      }

      // Prepare document chunks for storage
      const documentChunks: DocumentChunk[] = chunks.map((chunk, index) => ({
        id: `${documentId}-chunk-${index}`,
        content: chunk.text,
        embedding: embeddingResults[index]?.embedding,
        metadata: {
          documentId,
          customerId,
          chunkIndex: index,
          totalChunks: chunks.length,
          ...metadata,
        },
      }));

      // Store in vector database
      await vectorStore.storeChunks(documentChunks);

      // Invalidate related query cache
      if (customerId) {
        await cacheService.clearPattern(`query:${customerId}`);
      }

      logger.info(
        {
          documentId,
          customerId,
          chunksCreated: chunks.length,
        },
        'Document ingestion completed'
      );

      return {
        success: true,
        documentId,
        chunksCreated: chunks.length,
      };
    } catch (error) {
      logger.error(
        {
          error,
          documentId,
          customerId,
        },
        'Document ingestion failed'
      );
      throw error;
    }
  }

  /**
   * Batch ingest multiple documents
   */
  async ingestBatch(requests: IngestRequest[]): Promise<IngestResponse[]> {
    logger.info({ count: requests.length }, 'Starting batch ingestion');

    const results = await Promise.allSettled(
      requests.map((request) => this.ingestDocument(request))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logger.error(
          {
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            documentId: requests[index]?.documentId,
          },
          'Batch ingestion item failed'
        );
        return {
          success: false,
          documentId: requests[index]?.documentId || 'unknown',
          chunksCreated: 0,
        };
      }
    });
  }

  /**
   * Apply PII redaction to content
   * This is a hook for implementing custom PII redaction logic
   */
  private applyPIIRedaction(content: string): string {
    // In a production system, you might want to use a more sophisticated
    // PII detection and redaction system
    const redacted = redactPII(content);
    return typeof redacted === 'string' ? redacted : content;
  }
}

export const ingestionService = new IngestionService();
