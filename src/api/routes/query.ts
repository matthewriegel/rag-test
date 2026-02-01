import { Router, Request, Response } from 'express';
import { ragService } from '../../services/rag/index.js';
import { FormQueryRequest } from '../../config/types.js';
import { logger } from '../../lib/logger.js';
import { trackQuery } from '../middleware/metrics.js';
import { cacheService } from '../../lib/cache/index.js';

const router = Router();

/**
 * POST /form-query
 * Process a form question with RAG
 */
router.post('/form-query', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { customerId, formQuestion, context }: FormQueryRequest = req.body;

    if (!formQuestion || typeof formQuestion !== 'string') {
      res.status(400).json({ error: 'formQuestion is required and must be a string' });
      return;
    }

    logger.info(
      {
        customerId,
        questionLength: formQuestion.length,
      },
      'Received form query'
    );

    // Check if response was cached
    const wasCached = !!(await cacheService.getCachedQuery(formQuestion, customerId));

    const result = await ragService.processQuery({
      customerId,
      formQuestion,
      context,
    });

    const duration = Date.now() - startTime;
    trackQuery(duration, wasCached);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Form query failed');
    const duration = Date.now() - startTime;
    trackQuery(duration, false);

    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;
