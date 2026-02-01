import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import queryRoutes from './routes/query.js';
import ingestRoutes from './routes/ingest.js';
import healthRoutes from './routes/health.js';

export function createApp(): express.Application {
  const app = express();

  // Trust proxy for rate limiting behind reverse proxy
  app.set('trust proxy', 1);

  // Body parser middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Metrics middleware
  app.use(metricsMiddleware);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);

  // Routes
  app.use('/', queryRoutes);
  app.use('/', ingestRoutes);
  app.use('/', healthRoutes);

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export async function startServer(): Promise<void> {
  const app = createApp();
  const port = config.port;

  app.listen(port, () => {
    logger.info(
      {
        port,
        env: config.env,
        logLevel: config.logLevel,
      },
      'RAG service started'
    );
  });
}
