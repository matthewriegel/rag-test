import {
  calculateConfidence,
  calculateSimilarityScore,
  calculateMetadataScore,
  extractLLMConfidence,
} from '../../services/rag/confidence.js';

describe('Confidence Calculation', () => {
  describe('calculateConfidence', () => {
    it('should calculate confidence with default weights', () => {
      const signals = {
        simScore: 0.76,
        metaScore: 0.9,
        llmScore: 0.7,
      };

      const result = calculateConfidence(signals);

      // Expected: 0.5 * 0.76 + 0.3 * 0.9 + 0.2 * 0.7 = 0.38 + 0.27 + 0.14 = 0.79
      expect(result.finalConfidence).toBe(0.79);
      expect(result.signals).toEqual(signals);
      expect(result.calculation).toContain('0.790');
    });

    it('should handle perfect scores', () => {
      const signals = {
        simScore: 1.0,
        metaScore: 1.0,
        llmScore: 1.0,
      };

      const result = calculateConfidence(signals);
      expect(result.finalConfidence).toBe(1.0);
    });

    it('should handle zero scores', () => {
      const signals = {
        simScore: 0.0,
        metaScore: 0.0,
        llmScore: 0.0,
      };

      const result = calculateConfidence(signals);
      expect(result.finalConfidence).toBe(0.0);
    });

    it('should include detailed calculation steps', () => {
      const signals = {
        simScore: 0.76,
        metaScore: 0.9,
        llmScore: 0.7,
      };

      const result = calculateConfidence(signals);

      expect(result.calculation).toContain('Similarity component');
      expect(result.calculation).toContain('Metadata component');
      expect(result.calculation).toContain('LLM component');
      expect(result.calculation).toContain('Final confidence');
    });
  });

  describe('calculateSimilarityScore', () => {
    it('should average top 3 scores', () => {
      const scores = [0.9, 0.8, 0.7, 0.6, 0.5];
      const avgScore = calculateSimilarityScore(scores, 3);

      // (0.9 + 0.8 + 0.7) / 3 = 0.8
      expect(avgScore).toBeCloseTo(0.8, 2);
    });

    it('should handle fewer scores than requested', () => {
      const scores = [0.9, 0.8];
      const avgScore = calculateSimilarityScore(scores, 3);

      // (0.9 + 0.8) / 2 = 0.85
      expect(avgScore).toBeCloseTo(0.85, 2);
    });

    it('should return 0 for empty array', () => {
      const avgScore = calculateSimilarityScore([], 3);
      expect(avgScore).toBe(0);
    });

    it('should clamp values to 0-1 range', () => {
      const scores = [1.5, 1.2];
      const avgScore = calculateSimilarityScore(scores, 2);

      expect(avgScore).toBe(1.0);
    });
  });

  describe('calculateMetadataScore', () => {
    it('should return 1.0 when all metadata matches', () => {
      const request = { customerId: 'cust-123', type: 'document' };
      const result = { customerId: 'cust-123', type: 'document' };

      const score = calculateMetadataScore(request, result);
      expect(score).toBe(1.0);
    });

    it('should return partial score for partial matches', () => {
      const request = { customerId: 'cust-123', type: 'document' };
      const result = { customerId: 'cust-123', type: 'other' };

      const score = calculateMetadataScore(request, result);
      expect(score).toBe(0.5); // 1 out of 2 matched
    });

    it('should return 0 when nothing matches', () => {
      const request = { customerId: 'cust-123', type: 'document' };
      const result = { customerId: 'cust-456', type: 'other' };

      const score = calculateMetadataScore(request, result);
      expect(score).toBe(0);
    });

    it('should return 1.0 when request has no metadata', () => {
      const request = {};
      const result = { customerId: 'cust-123' };

      const score = calculateMetadataScore(request, result);
      expect(score).toBe(1.0);
    });
  });

  describe('extractLLMConfidence', () => {
    it('should extract confidence from response', () => {
      const response = 'Answer: Yes\nReasoning: Because\nConfidence: 0.85';
      const confidence = extractLLMConfidence(response);

      expect(confidence).toBe(0.85);
    });

    it('should handle different formats', () => {
      const response = 'The certainty is 0.92 based on the evidence';
      const confidence = extractLLMConfidence(response);

      expect(confidence).toBe(0.92);
    });

    it('should normalize percentage values', () => {
      const response = 'Confidence: 85';
      const confidence = extractLLMConfidence(response);

      expect(confidence).toBe(0.85);
    });

    it('should return default when no confidence found', () => {
      const response = 'Just a regular answer with no confidence';
      const confidence = extractLLMConfidence(response);

      expect(confidence).toBe(0.7); // Default
    });
  });
});
