import { config } from '../../config/index.js';
import { ConfidenceSignals, ConfidenceResult } from '../../config/types.js';

/**
 * Calculate confidence score using weighted combination of signals
 * 
 * Example calculation:
 * - simScore = 0.76 (average cosine similarity of top-3 results)
 * - metaScore = 0.90 (metadata match quality)
 * - llmScore = 0.70 (LLM self-reported confidence)
 * 
 * Weighted combination (default weights: 0.5, 0.3, 0.2):
 * 1) 0.5 * simScore = 0.5 * 0.76 = 0.380
 * 2) 0.3 * metaScore = 0.3 * 0.90 = 0.270
 * 3) 0.2 * llmScore = 0.2 * 0.70 = 0.140
 * 4) finalConfidence = 0.380 + 0.270 + 0.140 = 0.790
 * 
 * Returns: 0.79 (rounded to 2 decimals)
 */
export function calculateConfidence(signals: ConfidenceSignals): ConfidenceResult {
  const weights = config.confidence.weights;

  // Calculate weighted components
  const simComponent = weights.similarity * signals.simScore;
  const metaComponent = weights.metadata * signals.metaScore;
  const llmComponent = weights.llm * signals.llmScore;

  // Sum to get final confidence
  const finalConfidence = simComponent + metaComponent + llmComponent;

  // Round to 2 decimal places
  const rounded = Math.round(finalConfidence * 100) / 100;

  // Build calculation explanation
  const calculation = [
    `Confidence Calculation:`,
    `1) Similarity component: ${weights.similarity.toFixed(1)} * ${signals.simScore.toFixed(2)} = ${simComponent.toFixed(3)}`,
    `2) Metadata component: ${weights.metadata.toFixed(1)} * ${signals.metaScore.toFixed(2)} = ${metaComponent.toFixed(3)}`,
    `3) LLM component: ${weights.llm.toFixed(1)} * ${signals.llmScore.toFixed(2)} = ${llmComponent.toFixed(3)}`,
    `4) Final confidence: ${simComponent.toFixed(3)} + ${metaComponent.toFixed(3)} + ${llmComponent.toFixed(3)} = ${finalConfidence.toFixed(3)}`,
    `5) Rounded: ${rounded.toFixed(2)}`,
  ].join('\n');

  return {
    finalConfidence: rounded,
    signals,
    calculation,
  };
}

/**
 * Calculate average similarity score from top results
 */
export function calculateSimilarityScore(scores: number[], topN: number = 3): number {
  if (scores.length === 0) {
    return 0;
  }

  const topScores = scores.slice(0, Math.min(topN, scores.length));
  const average = topScores.reduce((sum, score) => sum + score, 0) / topScores.length;

  return Math.min(1.0, Math.max(0.0, average));
}

/**
 * Calculate metadata match score
 */
export function calculateMetadataScore(
  requestMetadata: Record<string, unknown>,
  resultMetadata: Record<string, unknown>
): number {
  const requestKeys = Object.keys(requestMetadata);

  if (requestKeys.length === 0) {
    return 1.0; // No metadata to match
  }

  let matches = 0;
  for (const key of requestKeys) {
    if (resultMetadata[key] === requestMetadata[key]) {
      matches++;
    }
  }

  return matches / requestKeys.length;
}

/**
 * Extract confidence score from LLM response
 */
export function extractLLMConfidence(response: string): number {
  // Look for confidence in response (e.g., "Confidence: 0.85" or similar patterns)
  const patterns = [
    /confidence[:\s]+([0-9.]+)/i,
    /certainty[:\s]+([0-9.]+)/i,
    /score[:\s]+([0-9.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match && match[1]) {
      const score = parseFloat(match[1]);
      if (!isNaN(score)) {
        // Normalize to 0-1 range if needed
        return score > 1 ? score / 100 : score;
      }
    }
  }

  // Default to moderate confidence if not found
  return 0.7;
}
