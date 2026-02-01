#!/usr/bin/env node
/**
 * Reindex documents with Azure OpenAI embeddings
 * 
 * This script:
 * 1. Reads documents from existing Qdrant (text only)
 * 2. Re-generates embeddings using Azure OpenAI
 * 3. Uploads to Azure AI Search with new embeddings
 * 
 * Use this if old embeddings are incompatible or you want to regenerate them.
 * 
 * Usage:
 *   tsx scripts/reindex-with-azure-embeddings.ts [--dry-run] [--batch-size=10]
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config, azureConfig } from '../src/config/index.js';
import { azureSearchVectorStore } from '../src/lib/azure/searchAdapter.js';
import { azureOpenAIClient } from '../src/lib/azure/openaiClient.js';
import { logger } from '../src/lib/logger.js';
import { DocumentChunk } from '../src/config/types.js';

interface ReindexOptions {
  dryRun: boolean;
  batchSize: number;
}

async function parseArgs(): Promise<ReindexOptions> {
  const args = process.argv.slice(2);
  const options: ReindexOptions = {
    dryRun: args.includes('--dry-run'),
    batchSize: 10, // Smaller batch for embedding API rate limits
  };

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    }
  }

  return options;
}

async function reindexDocuments(
  qdrantClient: QdrantClient,
  collectionName: string,
  batchSize: number,
  dryRun: boolean
): Promise<{ processed: number; failed: number }> {
  logger.info({ collection: collectionName }, 'Starting reindex from Qdrant');

  let totalProcessed = 0;
  let totalFailed = 0;
  let offset: string | undefined = undefined;
  let batch: DocumentChunk[] = [];

  try {
    while (true) {
      // Scroll through all points
      const result = await qdrantClient.scroll(collectionName, {
        limit: 100,
        with_payload: true,
        with_vector: false, // Don't need old vectors
        offset,
      });

      if (!result.points || result.points.length === 0) {
        break;
      }

      for (const point of result.points) {
        const chunk: DocumentChunk = {
          id: point.id as string,
          content: (point.payload?.['content'] as string) || '',
          metadata: {
            documentId: (point.payload?.['metadata'] as Record<string, unknown>)?.['documentId'] as string || '',
            chunkIndex: (point.payload?.['metadata'] as Record<string, unknown>)?.['chunkIndex'] as number || 0,
            totalChunks: (point.payload?.['metadata'] as Record<string, unknown>)?.['totalChunks'] as number || 0,
            customerId: (point.payload?.['metadata'] as Record<string, unknown>)?.['customerId'] as string,
            source: (point.payload?.['metadata'] as Record<string, unknown>)?.['source'] as string,
          },
        };

        batch.push(chunk);

        // Process batch when full
        if (batch.length >= batchSize) {
          const result = await processBatch(batch, dryRun);
          totalProcessed += result.processed;
          totalFailed += result.failed;
          batch = [];

          logger.info(
            { processed: totalProcessed, failed: totalFailed },
            'Reindex progress'
          );

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Check if there are more points
      if (!result.next_page_offset) {
        break;
      }
      offset = result.next_page_offset as string;
    }

    // Process remaining batch
    if (batch.length > 0) {
      const result = await processBatch(batch, dryRun);
      totalProcessed += result.processed;
      totalFailed += result.failed;
    }

    logger.info(
      { processed: totalProcessed, failed: totalFailed },
      'Reindex complete'
    );
    return { processed: totalProcessed, failed: totalFailed };
  } catch (error) {
    logger.error({ error }, 'Reindex failed');
    throw error;
  }
}

async function processBatch(
  chunks: DocumentChunk[],
  dryRun: boolean
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  try {
    // Extract text from chunks
    const texts = chunks.map((chunk) => chunk.content);

    // Generate embeddings with Azure OpenAI
    logger.debug({ count: texts.length }, 'Generating embeddings');
    const embeddings = await azureOpenAIClient.createBatchEmbeddings(texts);

    // Attach embeddings to chunks
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
    }

    // Upload to Azure Search
    if (!dryRun) {
      await azureSearchVectorStore.storeChunks(chunks);
    }

    processed = chunks.length;
    logger.debug({ processed }, 'Batch processed');
  } catch (error) {
    logger.error({ error, count: chunks.length }, 'Batch failed');
    failed = chunks.length;
  }

  return { processed, failed };
}

async function main() {
  const options = await parseArgs();

  // Verify Azure mode is enabled
  if (!azureConfig.enabled) {
    logger.error('AZURE_MODE must be set to true for reindexing with Azure embeddings');
    process.exit(1);
  }

  logger.info({ options }, 'Starting reindex with Azure embeddings');

  // 1. Connect to Qdrant
  const qdrantClient = new QdrantClient({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey,
  });

  // 2. Initialize Azure Search
  if (!options.dryRun) {
    await azureSearchVectorStore.initialize();
  }

  // 3. Reindex documents
  const result = await reindexDocuments(
    qdrantClient,
    config.qdrant.collectionName,
    options.batchSize,
    options.dryRun
  );

  logger.info(result, 'Reindex completed');

  if (options.dryRun) {
    logger.info('Dry run: documents processed but not uploaded to Azure Search');
  } else {
    // 4. Verify
    const azureStats = await azureSearchVectorStore.getCollectionInfo();
    logger.info({ azureStats }, 'Azure Search index statistics');
  }

  if (result.failed > 0) {
    logger.warn({ failed: result.failed }, 'Some documents failed to process');
    process.exit(1);
  }

  logger.info('Reindexing completed successfully');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Reindexing failed');
  process.exit(1);
});
