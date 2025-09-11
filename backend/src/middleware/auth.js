/**
 * Middleware d'authentification et d'autorisation
 * Note: Pour une version basique, l'auth est simplifiée
 * En production, vous devriez implémenter JWT + utilisateurs
 */

import jwt from 'jsonwebtoken'
import config from '../config/env.js'

/**
 * Middleware d'authentification JWT (optionnel pour la demo)
 * Actuellement désactivé car pas d'auth utilisateur implémentée
 */
export function authenticateToken(req, res, next) {
  // Pour l'instant, on skip l'auth en mode développement
  if (config.nodeEnv === 'development') {
    console.log('🔓 Authentication bypassed in development mode')
    return next()
  }

  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'No token provided in Authorization header'
    })
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    req.user = decoded
    next()
  } catch (error) {
    console.error('Token verification failed:', error)
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        error: 'Access token has expired'
      })
    }

    return res.status(403).json({
      success: false,
      message: 'Invalid token',
      error: 'Access token is invalid'
    })
  }
}

/**
 * Middleware optionnel d'authentification
 * Permet l'accès anonyme mais enrichit les infos si token présent
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    // Pas de token, mais on continue
    req.user = null
    return next()
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret)
    req.user = decoded
  } catch (error) {
    // Token invalide, mais on continue quand même
    req.user = null
    console.warn('Optional auth: invalid token provided')
  }

  next()
}

/**
 * Génère un JWT pour les tests (fonction utilitaire)
 */
export function generateTestToken(payload = { userId: 'test-user', role: 'admin' }) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '24h',
    issuer: 'doc2ai-backend',
    audience: 'doc2ai-frontend'
  })
}

/**
 * Middleware de vérification des permissions (placeholder)
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    // Pour l'instant, on accepte tout le monde en mode développement
    if (config.nodeEnv === 'development') {
      return next()
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User must be authenticated to access this resource'
      })
    }

    // Vérification des permissions (à implémenter selon vos besoins)
    const userPermissions = req.user.permissions || []
    const userRole = req.user.role || 'user'

    // Admin a tous les droits
    if (userRole === 'admin') {
      return next()
    }

    // Vérifier si l'utilisateur a la permission requise
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: `Required permission: ${permission}`
      })
    }

    next()
  }
}

/**
 * Middleware de limitation d'accès par rôle
 */
export function requireRole(requiredRole) {
  return (req, res, next) => {
    if (config.nodeEnv === 'development') {
      return next()
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      })
    }

    const userRole = req.user.role || 'user'
    const roleHierarchy = {
      'user': 1,
      'moderator': 2,
      'admin': 3
    }

    const userLevel = roleHierarchy[userRole] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 99

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient role',
        error: `Required role: ${requiredRole}, your role: ${userRole}`
      })
    }

    next()
  }
}

/**
 * Middleware pour les opérations d'administration
 */
export const requireAdmin = requireRole('admin')

/**
 * Middleware pour logger les tentatives d'authentification
 */
export function logAuthAttempts(req, res, next) {
  const authHeader = req.headers['authorization']
  const hasToken = !!authHeader
  const userAgent = req.get('User-Agent')
  const ip = req.ip || req.connection.remoteAddress

  console.log('🔐 Auth attempt:', {
    method: req.method,
    url: req.originalUrl,
    hasToken,
    userAgent: userAgent?.substring(0, 50),
    ip,
    timestamp: new Date().toISOString()
  })

  next()
}

/**
 * Middleware pour les routes publiques (pas d'auth requise)
 */
export function publicRoute(req, res, next) {
  // Simplement passer, ces routes sont accessibles à tous
  next()
}

/**
 * Middleware pour extraire les infos utilisateur du token sans validation stricte
 */
export function extractUserInfo(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  req.userInfo = {
    isAuthenticated: false,
    userId: null,
    role: null
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret)
      req.userInfo = {
        isAuthenticated: true,
        userId: decoded.userId,
        role: decoded.role,
        ...decoded
      }
    } catch (error) {
      // Token invalide, mais on garde les valeurs par défaut
      console.warn('Token extraction failed:', error.message)
    }
  }

  next()
}