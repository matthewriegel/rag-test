import { Router, Request, Response } from 'express';
import { ingestionService } from '../../services/ingest/index.js';
import { logger } from '../../lib/logger.js';
import { authenticateAPIKey } from '../middleware/auth.js';
import { trackIngestion } from '../middleware/metrics.js';

const router = Router();

/**
 * POST /ingest
 * Ingest a document into the vector store (requires API key)
 */
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/ingest', authenticateAPIKey, async (req: Request, res: Response) => {
  try {
    const { documentId, customerId, content, metadata } = req.body as {
      documentId?: unknown;
      customerId?: string;
      content?: unknown;
      metadata?: Record<string, unknown>;
    };

    if (!documentId || typeof documentId !== 'string') {
      res.status(400).json({ error: 'documentId is required and must be a string' });
      return;
    }

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content is required and must be a string' });
      return;
    }

    logger.info(
      {
        documentId,
        customerId,
        contentLength: content.length,
      },
      'Received ingest request'
    );

    const result = await ingestionService.ingestDocument({
      documentId,
      customerId,
      content,
      metadata,
    });

    trackIngestion();

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Ingestion failed');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;
