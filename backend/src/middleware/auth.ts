import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import logger from '../config/logger.js';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  if (config.nodeEnv === 'development') {
    logger.debug('Authentication bypassed in development mode');
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'No token provided in Authorization header',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
    req.user = decoded;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Token verification failed');

    const err = error as Error;
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: 'Token expired',
        error: 'Access token has expired',
      });
      return;
    }

    res.status(403).json({
      success: false,
      message: 'Invalid token',
      error: 'Access token is invalid',
    });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = undefined;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
    req.user = decoded;
  } catch {
    req.user = undefined;
    logger.warn('Optional auth: invalid token provided');
  }

  next();
}

const DEFAULT_TEST_PAYLOAD = { userId: 'test-user', role: 'admin' };

export function generateTestToken(payload?: Record<string, unknown>): string {
  const tokenPayload = payload ?? DEFAULT_TEST_PAYLOAD;
  return jwt.sign(tokenPayload, config.jwtSecret, {
    expiresIn: '24h',
    issuer: 'doc2ai-backend',
    audience: 'doc2ai-frontend',
  });
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.nodeEnv === 'development') {
      return next();
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User must be authenticated to access this resource',
      });
      return;
    }

    const userPermissions = (req.user['permissions'] as string[] | undefined) ?? [];
    const userRole = (req.user['role'] as string | undefined) ?? 'user';

    if (userRole === 'admin') {
      return next();
    }

    if (!userPermissions.includes(permission)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: `Required permission: ${permission}`,
      });
      return;
    }

    next();
  };
}

export function requireRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.nodeEnv === 'development') {
      return next();
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const userRole = (req.user['role'] as string | undefined) ?? 'user';
    const roleHierarchy: Record<string, number> = {
      user: 1,
      moderator: 2,
      admin: 3,
    };

    const userLevel = roleHierarchy[userRole] ?? 0;
    const requiredLevel = roleHierarchy[requiredRole] ?? 99;

    if (userLevel < requiredLevel) {
      res.status(403).json({
        success: false,
        message: 'Insufficient role',
        error: `Required role: ${requiredRole}, your role: ${userRole}`,
      });
      return;
    }

    next();
  };
}

export const requireAdmin = requireRole('admin');

export function logAuthAttempts(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const hasToken = !!authHeader;
  const userAgent = req.get('User-Agent');
  const ip = req.ip ?? req.socket.remoteAddress;

  logger.info(
    {
      method: req.method,
      url: req.originalUrl,
      hasToken,
      userAgent: userAgent?.substring(0, 50),
      ip,
    },
    'Auth attempt',
  );

  next();
}

export function publicRoute(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

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
