import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    [key: string]: unknown;
  };
}

/**
 * JWT authentication middleware
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'No authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as {
      userId: string;
      [key: string]: unknown;
    };
    (req as AuthRequest).user = decoded;
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(403).json({ error: 'Invalid token' });
  }
}

/**
 * API key authentication middleware for admin endpoints
 */
export function authenticateAPIKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'No API key provided' });
    return;
  }

  if (apiKey !== config.auth.apiKey) {
    logger.warn('Invalid API key attempt');
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
