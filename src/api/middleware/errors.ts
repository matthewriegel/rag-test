import { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  logger.error(
    {
      error: err,
      path: _req.path,
      method: _req.method,
    },
    'Request error'
  );

  // Don't expose internal errors in production
  const message =
    process.env['NODE_ENV'] === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(500).json({
    error: message,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
}
