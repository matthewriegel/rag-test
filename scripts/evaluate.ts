import { ragService } from '../src/services/rag/index.js';
import { logger } from '../src/lib/logger.js';

interface EvaluationCase {
  question: string;
  expectedAnswer: string;
  customerId?: string;
  context?: Record<string, unknown>;
}

interface EvaluationResult {
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  confidence: number;
  sources: number;
  passed: boolean;
}

/**
 * Evaluation harness for testing confidence calibration
 * 
 * This tool helps measure:
 * 1. Confidence score calibration
 * 2. Answer accuracy
 * 3. Retrieval quality
 */
class EvaluationHarness {
  async evaluateTestCases(cases: EvaluationCase[]): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    for (const testCase of cases) {
      logger.info({ question: testCase.question }, 'Evaluating test case');

      try {
        const response = await ragService.processQuery({
          formQuestion: testCase.question,
          customerId: testCase.customerId,
          context: testCase.context,
        });

        // Simple keyword matching for evaluation
        const passed = this.checkAnswerQuality(
          response.answer,
          testCase.expectedAnswer
        );

        results.push({
          question: testCase.question,
          expectedAnswer: testCase.expectedAnswer,
          actualAnswer: response.answer,
          confidence: response.confidence,
          sources: response.sources.length,
          passed,
        });
      } catch (error) {
        logger.error({ error, question: testCase.question }, 'Evaluation failed');
        results.push({
          question: testCase.question,
          expectedAnswer: testCase.expectedAnswer,
          actualAnswer: 'ERROR',
          confidence: 0,
          sources: 0,
          passed: false,
        });
      }
    }

    return results;
  }

  private checkAnswerQuality(actual: string, expected: string): boolean {
    // Use Jaccard similarity over token sets for more reliable comparison
    const normalizeAndTokenize = (text: string): Set<string> => {
      return new Set(
        text
          .toLowerCase()
          .split(/\W+/)
          .filter((token) => token.length > 2)
      );
    };

    const actualTokens = normalizeAndTokenize(actual);
    const expectedTokens = normalizeAndTokenize(expected);

    if (expectedTokens.size === 0) {
      // If there are no informative expected tokens, fall back to strict equality
      return actual.trim().toLowerCase() === expected.trim().toLowerCase();
    }

    let intersectionSize = 0;
    for (const token of expectedTokens) {
      if (actualTokens.has(token)) {
        intersectionSize++;
      }
    }

    const unionSize = actualTokens.size + expectedTokens.size - intersectionSize;
    const jaccardSimilarity = unionSize === 0 ? 0 : intersectionSize / unionSize;

    // Pass if Jaccard similarity is at least 0.5
    return jaccardSimilarity >= 0.5;
  }

  printReport(results: EvaluationResult[]): void {
    console.log('\n=== Evaluation Report ===\n');

    let totalPassed = 0;
    let totalConfidence = 0;
    const confidenceByResult: { passed: number[]; failed: number[] } = {
      passed: [],
      failed: [],
    };

    for (const result of results) {
      if (result.passed) {
        totalPassed++;
        confidenceByResult.passed.push(result.confidence);
      } else {
        confidenceByResult.failed.push(result.confidence);
      }
      totalConfidence += result.confidence;
    }

    const accuracy = (totalPassed / results.length) * 100;
    const avgConfidence = totalConfidence / results.length;
    const avgConfidencePassed =
      confidenceByResult.passed.length > 0
        ? confidenceByResult.passed.reduce((a, b) => a + b, 0) /
          confidenceByResult.passed.length
        : 0;
    const avgConfidenceFailed =
      confidenceByResult.failed.length > 0
        ? confidenceByResult.failed.reduce((a, b) => a + b, 0) /
          confidenceByResult.failed.length
        : 0;

    console.log(`Total Cases: ${results.length}`);
    console.log(`Passed: ${totalPassed} (${accuracy.toFixed(1)}%)`);
    console.log(`Failed: ${results.length - totalPassed}`);
    console.log(`\nConfidence Scores:`);
    console.log(`  Overall Average: ${avgConfidence.toFixed(2)}`);
    console.log(`  Average (Passed): ${avgConfidencePassed.toFixed(2)}`);
    console.log(`  Average (Failed): ${avgConfidenceFailed.toFixed(2)}`);

    // Confidence calibration check
    const calibrationGap = Math.abs(accuracy / 100 - avgConfidence);
    console.log(`\nCalibration Gap: ${calibrationGap.toFixed(2)}`);
    console.log(
      `(Gap < 0.15 is good, < 0.1 is excellent)\n`
    );

    console.log('=== Individual Results ===\n');
    for (const result of results) {
      const status = result.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`${status} (conf: ${result.confidence.toFixed(2)})`);
      console.log(`  Q: ${result.question}`);
      console.log(`  A: ${result.actualAnswer.substring(0, 100)}...`);
      console.log();
    }
  }
}

// Sample test cases
const testCases: EvaluationCase[] = [
  {
    question: 'What is your returns policy?',
    expectedAnswer: 'items can be returned within 30 days',
    customerId: 'cust-123',
  },
  {
    question: 'How long does standard shipping take?',
    expectedAnswer: '5-7 business days',
    customerId: 'cust-123',
  },
  {
    question: 'What payment methods do you accept?',
    expectedAnswer: 'credit cards PayPal Apple Pay Google Pay',
  },
  {
    question: 'How much do the wireless headphones cost?',
    expectedAnswer: '$299.99',
    customerId: 'cust-123',
  },
  {
    question: 'Does the smart watch have GPS?',
    expectedAnswer: 'GPS tracking',
    customerId: 'cust-123',
  },
];

async function runEvaluation(): Promise<void> {
  const harness = new EvaluationHarness();

  logger.info('Starting evaluation harness');

  // First, ensure sample data is loaded
  logger.info('Ensure sample data is loaded before running evaluation');

  const results = await harness.evaluateTestCases(testCases);
  harness.printReport(results);
}

runEvaluation()
  .then(() => {
    logger.info('Evaluation complete');
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error({ error }, 'Evaluation failed');
    process.exit(1);
  });
