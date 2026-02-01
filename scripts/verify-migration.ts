#!/usr/bin/env node
/**
 * Verify migration by comparing search results between Qdrant and Azure Search
 * 
 * This script:
 * 1. Runs sample queries against both vector stores
 * 2. Compares top-K results
 * 3. Generates a comparison report
 * 
 * Usage:
 *   tsx scripts/verify-migration.ts [--queries=10] [--top-k=5]
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../src/config/index.js';
import { vectorStore } from '../src/lib/vectorStore/index.js';
import { azureSearchVectorStore } from '../src/lib/azure/searchAdapter.js';
import { openaiClient } from '../src/lib/openai/client.js';
import { logger } from '../src/lib/logger.js';

interface VerificationOptions {
  numQueries: number;
  topK: number;
}

interface ComparisonResult {
  query: string;
  qdrantResults: Array<{ id: string; score: number }>;
  azureResults: Array<{ id: string; score: number }>;
  overlap: number;
  averageScoreDiff: number;
}

const SAMPLE_QUERIES = [
  'What is your returns policy?',
  'How do I contact customer support?',
  'What are the shipping options?',
  'Tell me about product warranties',
  'How do I reset my password?',
  'What payment methods do you accept?',
  'Where can I track my order?',
  'Do you offer international shipping?',
  'What is the refund process?',
  'How long does delivery take?',
];

async function parseArgs(): Promise<VerificationOptions> {
  const args = process.argv.slice(2);
  const options: VerificationOptions = {
    numQueries: 10,
    topK: 5,
  };

  for (const arg of args) {
    if (arg.startsWith('--queries=')) {
      options.numQueries = parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--top-k=')) {
      options.topK = parseInt(arg.split('=')[1], 10);
    }
  }

  return options;
}

async function compareQuery(
  query: string,
  topK: number
): Promise<ComparisonResult> {
  logger.info({ query }, 'Running comparison query');

  // Generate embedding
  const embedding = await openaiClient.createEmbedding(query);

  // Search Qdrant
  const qdrantResults = await vectorStore.search(embedding, topK);

  // Search Azure
  const azureResults = await azureSearchVectorStore.search(embedding, topK);

  // Calculate overlap (how many IDs are in both result sets)
  const qdrantIds = new Set(qdrantResults.map((r) => r.id));
  const azureIds = new Set(azureResults.map((r) => r.id));
  const overlap = [...qdrantIds].filter((id) => azureIds.has(id)).length;

  // Calculate average score difference for overlapping results
  let scoreDiffSum = 0;
  let scoreDiffCount = 0;
  for (const qdrantResult of qdrantResults) {
    const azureResult = azureResults.find((r) => r.id === qdrantResult.id);
    if (azureResult) {
      scoreDiffSum += Math.abs(qdrantResult.score - azureResult.score);
      scoreDiffCount++;
    }
  }
  const averageScoreDiff = scoreDiffCount > 0 ? scoreDiffSum / scoreDiffCount : 0;

  return {
    query,
    qdrantResults: qdrantResults.map((r) => ({ id: r.id, score: r.score })),
    azureResults: azureResults.map((r) => ({ id: r.id, score: r.score })),
    overlap,
    averageScoreDiff,
  };
}

async function generateReport(results: ComparisonResult[]): Promise<void> {
  console.log('\n=== MIGRATION VERIFICATION REPORT ===\n');

  // Summary statistics
  const totalQueries = results.length;
  const averageOverlap =
    results.reduce((sum, r) => sum + r.overlap, 0) / totalQueries;
  const averageScoreDiff =
    results.reduce((sum, r) => sum + r.averageScoreDiff, 0) / totalQueries;

  console.log('Summary:');
  console.log(`  Total queries tested: ${totalQueries}`);
  console.log(`  Average overlap: ${averageOverlap.toFixed(2)} out of ${results[0].qdrantResults.length}`);
  console.log(`  Average score difference: ${averageScoreDiff.toFixed(4)}`);
  console.log('');

  // Detailed results
  console.log('Detailed Results:');
  console.log('');

  for (const result of results) {
    console.log(`Query: "${result.query}"`);
    console.log(`  Overlap: ${result.overlap}/${result.qdrantResults.length}`);
    console.log(`  Avg score diff: ${result.averageScoreDiff.toFixed(4)}`);
    
    console.log('  Qdrant top results:');
    result.qdrantResults.slice(0, 3).forEach((r, i) => {
      console.log(`    ${i + 1}. ${r.id.substring(0, 30)}... (${r.score.toFixed(4)})`);
    });
    
    console.log('  Azure top results:');
    result.azureResults.slice(0, 3).forEach((r, i) => {
      console.log(`    ${i + 1}. ${r.id.substring(0, 30)}... (${r.score.toFixed(4)})`);
    });
    
    console.log('');
  }

  // Quality assessment
  console.log('Quality Assessment:');
  if (averageOverlap >= results[0].qdrantResults.length * 0.8) {
    console.log('  ✅ EXCELLENT: High overlap between vector stores (>80%)');
  } else if (averageOverlap >= results[0].qdrantResults.length * 0.6) {
    console.log('  ⚠️  GOOD: Moderate overlap between vector stores (60-80%)');
  } else {
    console.log('  ❌ WARNING: Low overlap between vector stores (<60%)');
    console.log('     Consider re-running migration or checking embeddings');
  }

  if (averageScoreDiff < 0.1) {
    console.log('  ✅ Similarity scores are very close');
  } else if (averageScoreDiff < 0.2) {
    console.log('  ⚠️  Similarity scores have some differences');
  } else {
    console.log('  ❌ WARNING: Significant score differences detected');
  }

  console.log('');
}

async function main() {
  const options = await parseArgs();

  logger.info({ options }, 'Starting migration verification');

  // Initialize both vector stores
  await vectorStore.initialize();
  await azureSearchVectorStore.initialize();

  // Select queries to test
  const queriesToTest = SAMPLE_QUERIES.slice(0, options.numQueries);

  // Run comparisons
  const results: ComparisonResult[] = [];
  for (const query of queriesToTest) {
    try {
      const result = await compareQuery(query, options.topK);
      results.push(result);
      
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      logger.error({ error, query }, 'Query comparison failed');
    }
  }

  // Generate report
  await generateReport(results);

  logger.info('Verification complete');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Verification failed');
  process.exit(1);
});
