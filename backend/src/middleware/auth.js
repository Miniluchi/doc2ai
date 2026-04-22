import jwt from 'jsonwebtoken';
import config from '../config/env.js';

export function authenticateToken(req, res, next) {
  if (config.nodeEnv === 'development') {
    console.log('Authentication bypassed in development mode');
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'No token provided in Authorization header',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        error: 'Access token has expired',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Invalid token',
      error: 'Access token is invalid',
    });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
  } catch {
    req.user = null;
    console.warn('Optional auth: invalid token provided');
  }

  next();
}

const DEFAULT_TEST_PAYLOAD = { userId: 'test-user', role: 'admin' };

export function generateTestToken(payload) {
  const tokenPayload = payload || DEFAULT_TEST_PAYLOAD;
  return jwt.sign(tokenPayload, config.jwtSecret, {
    expiresIn: '24h',
    issuer: 'doc2ai-backend',
    audience: 'doc2ai-frontend',
  });
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (config.nodeEnv === 'development') {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User must be authenticated to access this resource',
      });
    }

    const userPermissions = req.user.permissions || [];
    const userRole = req.user.role || 'user';

    if (userRole === 'admin') {
      return next();
    }

    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: `Required permission: ${permission}`,
      });
    }

    next();
  };
}

export function requireRole(requiredRole) {
  return (req, res, next) => {
    if (config.nodeEnv === 'development') {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userRole = req.user.role || 'user';
    const roleHierarchy = {
      user: 1,
      moderator: 2,
      admin: 3,
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 99;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient role',
        error: `Required role: ${requiredRole}, your role: ${userRole}`,
      });
    }

    next();
  };
}

export const requireAdmin = requireRole('admin');

export function logAuthAttempts(req, res, next) {
  const authHeader = req.headers['authorization'];
  const hasToken = !!authHeader;
  const userAgent = req.get('User-Agent');
  const ip = req.ip || req.connection.remoteAddress;

  console.log('Auth attempt:', {
    method: req.method,
    url: req.originalUrl,
    hasToken,
    userAgent: userAgent?.substring(0, 50),
    ip,
    timestamp: new Date().toISOString(),
  });

  next();
}

export function publicRoute(req, res, next) {
  next();
}

export function extractUserInfo(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  req.userInfo = {
    isAuthenticated: false,
    userId: null,
    role: null,
  };

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.userInfo = {
        isAuthenticated: true,
        userId: decoded.userId,
        role: decoded.role,
        ...decoded,
      };
    } catch (error) {
      console.warn('Token extraction failed:', error.message);
    }
  }

  next();
}
