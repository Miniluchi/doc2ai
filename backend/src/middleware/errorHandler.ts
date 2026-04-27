import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import logger from '../config/logger.js';

// Typed superset of Error covering all error shapes seen in this app
interface AppError extends Error {
  code?: string;
  statusCode?: number;
  status?: number;
  type?: string;
  details?: unknown;
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err: error }, 'Unhandled error');

  if (error.code === 'P2002') {
    res.status(409).json({
      success: false,
      message: 'Resource already exists',
      error: 'Duplicate entry detected',
    });
    return;
  }

  if (error.code === 'P2025') {
    res.status(404).json({
      success: false,
      message: 'Resource not found',
      error: 'The requested resource does not exist',
    });
    return;
  }

  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: 'Authentication token is invalid',
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Token expired',
      error: 'Authentication token has expired',
    });
    return;
  }

  if (error.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON',
      error: 'Request body contains invalid JSON',
    });
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      message: 'Payload too large',
      error: 'Request payload exceeds size limit',
    });
    return;
  }

  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    res.status(408).json({
      success: false,
      message: 'Request timeout',
      error: 'The request took too long to complete',
    });
    return;
  }

  if (error.code === 'EACCES' || error.code === 'EPERM') {
    res.status(403).json({
      success: false,
      message: 'Permission denied',
      error: 'Insufficient permissions to complete the operation',
    });
    return;
  }

  if (error.code === 'ENOENT') {
    res.status(404).json({
      success: false,
      message: 'File not found',
      error: 'The requested file or directory does not exist',
    });
    return;
  }

  if (error.code === 'ENOSPC') {
    res.status(507).json({
      success: false,
      message: 'Insufficient storage',
      error: 'Not enough disk space to complete the operation',
    });
    return;
  }

  const statusCode = error.statusCode ?? error.status ?? 500;
  const message = error.message || 'Internal server error';

  const errorResponse: Record<string, unknown> = {
    success: false,
    message: statusCode === 500 ? 'Internal server error' : message,
    error: config.nodeEnv === 'development' ? message : 'An unexpected error occurred',
  };

  if (config.nodeEnv === 'development') {
    errorResponse['stack'] = error.stack;
    errorResponse['details'] = {
      name: error.name,
      code: error.code,
      statusCode,
    };
  }

  res.status(statusCode).json(errorResponse);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      api: '/api',
      health: '/api/health',
      sources: '/api/sources',
      conversions: '/api/conversions',
      monitoring: '/api/monitoring',
    },
  });
}

export function asyncErrorHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function wrapAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return function (req: Request, res: Response, next: NextFunction): void {
    fn(req, res, next).catch(next);
  };
}

export function validationErrorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      error: error.message,
      details: error.details ?? {},
    });
    return;
  }
  next(error);
}

export function logError(error: AppError, req: Request, _res: Response, next: NextFunction): void {
  logger.error(
    {
      err: error,
      url: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    },
    'Request error',
  );

  next(error);
}
