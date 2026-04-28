import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import logger from '../config/logger.js';

export function extractUserInfo(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  req.userInfo = {
    isAuthenticated: false,
    userId: null,
    role: null,
  };

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
      req.userInfo = {
        isAuthenticated: true,
        userId: (decoded['userId'] as string | undefined) ?? null,
        role: (decoded['role'] as string | undefined) ?? null,
        ...decoded,
      };
    } catch (error) {
      logger.warn({ err: error }, 'Token extraction failed');
    }
  }

  next();
}
