import { config } from '../../config/index.js';
import { logger } from '../logger.js';

export interface TextChunk {
  text: string;
  index: number;
  totalChunks: number;
}

/**
 * Deterministic text chunking with token estimation
 * Uses character-based approximation (1 token ≈ 4 characters for English text)
 */
export class TextChunker {
  private readonly charsPerToken = 4;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(chunkSize?: number, chunkOverlap?: number) {
    this.chunkSize = chunkSize ?? config.rag.chunkSize;
    this.chunkOverlap = chunkOverlap ?? config.rag.chunkOverlap;

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error('Chunk overlap must be less than chunk size');
    }
  }

  /**
   * Split text into chunks with overlap
   */
  chunkText(text: string): TextChunk[] {
    const chunkChars = this.chunkSize * this.charsPerToken;
    const overlapChars = this.chunkOverlap * this.charsPerToken;

    // Clean and normalize text
    const cleanText = text.replace(/\s+/g, ' ').trim();

    if (cleanText.length === 0) {
      return [];
    }

    if (cleanText.length <= chunkChars) {
      return [{ text: cleanText, index: 0, totalChunks: 1 }];
    }

    const chunks: TextChunk[] = [];
    let start = 0;

    while (start < cleanText.length) {
      const end = Math.min(start + chunkChars, cleanText.length);
      
      // Try to break at sentence boundary
      let chunkEnd = end;
      if (end < cleanText.length) {
        const lastPeriod = cleanText.lastIndexOf('.', end);
        const lastQuestion = cleanText.lastIndexOf('?', end);
        const lastExclamation = cleanText.lastIndexOf('!', end);
        const lastNewline = cleanText.lastIndexOf('\n', end);
        
        const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclamation, lastNewline);
        
        // Only use sentence boundary if it's within reasonable distance
        if (breakPoint > start && breakPoint > end - chunkChars * 0.3) {
          chunkEnd = breakPoint + 1;
        }
      }

      const chunkText = cleanText.slice(start, chunkEnd).trim();
      
      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          index: chunks.length,
          totalChunks: 0, // Will be updated after all chunks are created
        });
      }

      // Move start position with overlap
      start = chunkEnd - overlapChars;
      
      // Ensure we make progress
      if (start <= (chunks[chunks.length - 1]?.text.length ?? 0)) {
        start = chunkEnd;
      }
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalChunks = totalChunks;
    });

    logger.debug(
      { 
        textLength: text.length, 
        chunksCreated: totalChunks,
        chunkSize: this.chunkSize,
        overlap: this.chunkOverlap
      },
      'Text chunked'
    );

    return chunks;
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }
}

export const textChunker = new TextChunker();
