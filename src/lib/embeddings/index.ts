import { openaiClient } from '../openai/client.js';
import { textChunker } from './chunker.js';
import { logger } from '../logger.js';

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  index: number;
}

export class EmbeddingService {
  /**
   * Create embedding for a single text
   */
  async embedText(text: string): Promise<number[]> {
    logger.debug({ textLength: text.length }, 'Embedding text');
    return openaiClient.createEmbedding(text);
  }

  /**
   * Create embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    logger.debug({ count: texts.length }, 'Embedding batch');

    if (texts.length === 0) {
      return [];
    }

    const embeddings = await openaiClient.createBatchEmbeddings(texts);

    // Validate that we received the expected number of embeddings
    if (embeddings.length !== texts.length) {
      logger.error(
        {
          requested: texts.length,
          received: embeddings.length,
        },
        'Embedding count mismatch'
      );
      throw new Error(
        `Expected ${texts.length} embeddings but received ${embeddings.length}`
      );
    }

    return texts.map((text, index) => ({
      text,
      embedding: embeddings[index] || [],
      index,
    }));
  }

  /**
   * Chunk text and create embeddings for all chunks
   */
  async embedDocument(text: string): Promise<EmbeddingResult[]> {
    const chunks = textChunker.chunkText(text);

    logger.info(
      {
        textLength: text.length,
        chunks: chunks.length,
      },
      'Embedding document chunks'
    );

    const texts = chunks.map((chunk) => chunk.text);
    return this.embedBatch(texts);
  }

  /**
   * Get chunker instance for external use
   */
  getChunker(): typeof textChunker {
    return textChunker;
  }
}

export const embeddingService = new EmbeddingService();
