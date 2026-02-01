#!/usr/bin/env node
/**
 * Migrate vectors from existing Qdrant store to Azure AI Search
 * 
 * This script:
 * 1. Connects to existing Qdrant instance
 * 2. Exports all vectors to NDJSON format
 * 3. Uploads to Azure AI Search via the adapter
 * 
 * Usage:
 *   tsx scripts/migrate-vectors-to-azure.ts [--dry-run] [--batch-size=100]
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../src/config/index.js';
import { azureSearchVectorStore } from '../src/lib/azure/searchAdapter.js';
import { logger } from '../src/lib/logger.js';
import { DocumentChunk } from '../src/config/types.js';
import * as fs from 'fs';
import * as path from 'path';

interface MigrationOptions {
  dryRun: boolean;
  batchSize: number;
  exportPath: string;
}

async function parseArgs(): Promise<MigrationOptions> {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    batchSize: 100,
    exportPath: '/tmp/vector-migration.ndjson',
  };

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    }
    if (arg.startsWith('--export-path=')) {
      options.exportPath = arg.split('=')[1];
    }
  }

  return options;
}

async function exportFromQdrant(
  qdrantClient: QdrantClient,
  collectionName: string,
  exportPath: string
): Promise<number> {
  logger.info({ collection: collectionName }, 'Starting export from Qdrant');

  const writeStream = fs.createWriteStream(exportPath);
  let totalExported = 0;
  let offset: string | undefined = undefined;

  try {
    while (true) {
      // Scroll through all points in batches
      const result = await qdrantClient.scroll(collectionName, {
        limit: 100,
        with_payload: true,
        with_vector: true,
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
          embedding: point.vector as number[],
        };

        writeStream.write(JSON.stringify(chunk) + '\n');
        totalExported++;
      }

      // Check if there are more points
      if (!result.next_page_offset) {
        break;
      }
      offset = result.next_page_offset as string;

      logger.info({ exported: totalExported }, 'Export progress');
    }

    writeStream.end();
    logger.info({ total: totalExported, path: exportPath }, 'Export complete');
    return totalExported;
  } catch (error) {
    logger.error({ error }, 'Export failed');
    throw error;
  }
}

async function importToAzureSearch(
  exportPath: string,
  batchSize: number,
  dryRun: boolean
): Promise<number> {
  logger.info({ path: exportPath, batchSize, dryRun }, 'Starting import to Azure Search');

  const fileContent = fs.readFileSync(exportPath, 'utf-8');
  const lines = fileContent.trim().split('\n');
  let totalImported = 0;
  let batch: DocumentChunk[] = [];

  for (let i = 0; i < lines.length; i++) {
    const chunk: DocumentChunk = JSON.parse(lines[i]);
    batch.push(chunk);

    if (batch.length >= batchSize || i === lines.length - 1) {
      if (!dryRun) {
        await azureSearchVectorStore.storeChunks(batch);
      }
      totalImported += batch.length;
      logger.info({ imported: totalImported, total: lines.length }, 'Import progress');
      batch = [];
    }
  }

  logger.info({ total: totalImported }, 'Import complete');
  return totalImported;
}

async function main() {
  const options = await parseArgs();

  logger.info({ options }, 'Starting vector migration');

  // 1. Connect to Qdrant
  const qdrantClient = new QdrantClient({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey,
  });

  // 2. Export from Qdrant to NDJSON
  const exportedCount = await exportFromQdrant(
    qdrantClient,
    config.qdrant.collectionName,
    options.exportPath
  );

  if (options.dryRun) {
    logger.info(
      { exportedCount, exportPath: options.exportPath },
      'Dry run: vectors exported but not imported'
    );
    return;
  }

  // 3. Import to Azure Search
  await azureSearchVectorStore.initialize();
  const importedCount = await importToAzureSearch(
    options.exportPath,
    options.batchSize,
    options.dryRun
  );

  logger.info(
    { exported: exportedCount, imported: importedCount },
    'Migration complete!'
  );

  // Verify counts match
  if (exportedCount !== importedCount) {
    logger.warn(
      { exported: exportedCount, imported: importedCount },
      'Warning: Exported and imported counts do not match'
    );
  }

  // 4. Verify by getting collection info
  const azureStats = await azureSearchVectorStore.getCollectionInfo();
  logger.info({ azureStats }, 'Azure Search index statistics');

  logger.info('Migration completed successfully');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ error }, 'Migration failed');
  process.exit(1);
});
