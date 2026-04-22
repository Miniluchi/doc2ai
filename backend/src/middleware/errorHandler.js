import config from '../config/env.js';

export function errorHandler(error, req, res, _next) {
  console.error('❌ Unhandled error:', error);

  if (error.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'Resource already exists',
      error: 'Duplicate entry detected',
    });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Resource not found',
      error: 'The requested resource does not exist',
    });
  }

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: 'Authentication token is invalid',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      error: 'Authentication token has expired',
    });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON',
      error: 'Request body contains invalid JSON',
    });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'Payload too large',
      error: 'Request payload exceeds size limit',
    });
  }

  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    return res.status(408).json({
      success: false,
      message: 'Request timeout',
      error: 'The request took too long to complete',
    });
  }

  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return res.status(403).json({
      success: false,
      message: 'Permission denied',
      error: 'Insufficient permissions to complete the operation',
    });
  }

  if (error.code === 'ENOENT') {
    return res.status(404).json({
      success: false,
      message: 'File not found',
      error: 'The requested file or directory does not exist',
    });
  }

  if (error.code === 'ENOSPC') {
    return res.status(507).json({
      success: false,
      message: 'Insufficient storage',
      error: 'Not enough disk space to complete the operation',
    });
  }

  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal server error';

  const errorResponse = {
    success: false,
    message: statusCode === 500 ? 'Internal server error' : message,
    error: config.nodeEnv === 'development' ? message : 'An unexpected error occurred',
  };

  if (config.nodeEnv === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = {
      name: error.name,
      code: error.code,
      statusCode,
    };
  }

  res.status(statusCode).json(errorResponse);
}

export function notFoundHandler(req, res) {
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

export function asyncErrorHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function wrapAsync(fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next);
  };
}

export function validationErrorHandler(error, req, res, next) {
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      error: error.message,
      details: error.details || {},
    });
  }
  next(error);
}

export function logError(error, req, res, next) {
  console.error('Error details:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  next(error);
}
