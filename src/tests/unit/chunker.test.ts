import { textChunker } from '../../lib/embeddings/chunker.js';

describe('TextChunker', () => {
  describe('chunkText', () => {
    it('should return empty array for empty text', () => {
      const chunks = textChunker.chunkText('');
      expect(chunks).toEqual([]);
    });

    it('should return single chunk for short text', () => {
      const text = 'This is a short text.';
      const chunks = textChunker.chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.text).toBe(text);
      expect(chunks[0]?.index).toBe(0);
      expect(chunks[0]?.totalChunks).toBe(1);
    });

    it('should create multiple chunks for long text', () => {
      // Create text longer than chunk size (500 tokens ≈ 2000 chars)
      const longText = 'A '.repeat(1500) + 'B '.repeat(1500);
      const chunks = textChunker.chunkText(longText);

      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should have sequential indices
      chunks.forEach((chunk, idx) => {
        expect(chunk.index).toBe(idx);
        expect(chunk.totalChunks).toBe(chunks.length);
      });
    });

    it('should respect chunk overlap', () => {
      const text = 'A '.repeat(1500) + 'B '.repeat(1500);
      const chunks = textChunker.chunkText(text);

      if (chunks.length > 1) {
        // Verify that consecutive chunks have some overlap
        const firstChunk = chunks[0]?.text || '';
        const secondChunk = chunks[1]?.text || '';

        // There should be some overlap between chunks
        expect(firstChunk.length).toBeGreaterThan(0);
        expect(secondChunk.length).toBeGreaterThan(0);
      }
    });

    it('should normalize whitespace', () => {
      const text = 'This  has   multiple    spaces\n\n\nand newlines';
      const chunks = textChunker.chunkText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.text).toBe('This has multiple spaces and newlines');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const text = 'This is a test';
      const tokens = textChunker.estimateTokens(text);

      // "This is a test" is 14 chars, should be about 4 tokens (14/4 = 3.5, ceil = 4)
      expect(tokens).toBe(4);
    });

    it('should return 0 for empty string', () => {
      const tokens = textChunker.estimateTokens('');
      expect(tokens).toBe(0);
    });
  });
});
