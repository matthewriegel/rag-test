import { vectorStore } from '../src/lib/vectorStore/index.js';
import { cacheService } from '../src/lib/cache/index.js';
import { logger } from '../src/lib/logger.js';

async function resetDatabase(): Promise<void> {
  logger.info('Resetting database...');

  try {
    // Delete Qdrant collection
    logger.info('Deleting Qdrant collection');
    try {
      await vectorStore.deleteCollection();
    } catch (error) {
      logger.warn({ error }, 'Collection may not exist');
    }

    // Reinitialize collection
    logger.info('Recreating Qdrant collection');
    await vectorStore.initialize();

    // Clear Redis cache
    logger.info('Clearing Redis cache');
    await cacheService.clearPattern('');

    logger.info('Database reset complete');
  } catch (error) {
    logger.error({ error }, 'Failed to reset database');
    throw error;
  }
}

resetDatabase()
  .then(() => {
    logger.info('Done');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Script failed');
    process.exit(1);
  });
