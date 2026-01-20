/**
 * Middleware de gestion des erreurs pour Express
 */

import config from "../config/env.js";

/**
 * Middleware principal de gestion d'erreur
 */
export function errorHandler(error, req, res, _next) {
  console.error("❌ Unhandled error:", error);

  // Erreur de validation Prisma
  if (error.code === "P2002") {
    return res.status(409).json({
      success: false,
      message: "Resource already exists",
      error: "Duplicate entry detected",
    });
  }

  // Erreur de validation Prisma - Record not found
  if (error.code === "P2025") {
    return res.status(404).json({
      success: false,
      message: "Resource not found",
      error: "The requested resource does not exist",
    });
  }

  // Erreur JWT
  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
      error: "Authentication token is invalid",
    });
  }

  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
      error: "Authentication token has expired",
    });
  }

  // Erreur de validation des données (body parser, etc.)
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON",
      error: "Request body contains invalid JSON",
    });
  }

  // Erreur de payload trop grand
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Payload too large",
      error: "Request payload exceeds size limit",
    });
  }

  // Erreur de timeout
  if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
    return res.status(408).json({
      success: false,
      message: "Request timeout",
      error: "The request took too long to complete",
    });
  }

  // Erreur de permission/accès
  if (error.code === "EACCES" || error.code === "EPERM") {
    return res.status(403).json({
      success: false,
      message: "Permission denied",
      error: "Insufficient permissions to complete the operation",
    });
  }

  // Erreur de fichier non trouvé
  if (error.code === "ENOENT") {
    return res.status(404).json({
      success: false,
      message: "File not found",
      error: "The requested file or directory does not exist",
    });
  }

  // Erreur d'espace disque insuffisant
  if (error.code === "ENOSPC") {
    return res.status(507).json({
      success: false,
      message: "Insufficient storage",
      error: "Not enough disk space to complete the operation",
    });
  }

  // Erreur par défaut
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || "Internal server error";

  // En développement, on expose plus de détails
  const errorResponse = {
    success: false,
    message: statusCode === 500 ? "Internal server error" : message,
    error:
      config.nodeEnv === "development"
        ? message
        : "An unexpected error occurred",
  };

  // Ajouter la stack trace en développement
  if (config.nodeEnv === "development") {
    errorResponse.stack = error.stack;
    errorResponse.details = {
      name: error.name,
      code: error.code,
      statusCode,
    };
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Middleware pour gérer les routes non trouvées
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found",
    error: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: {
      api: "/api",
      health: "/api/health",
      sources: "/api/sources",
      conversions: "/api/conversions",
      monitoring: "/api/monitoring",
    },
  });
}

/**
 * Middleware pour capturer les erreurs async non gérées
 */
export function asyncErrorHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wrapper pour les routes async
 */
export function wrapAsync(fn) {
  return function (req, res, next) {
    fn(req, res, next).catch(next);
  };
}

/**
 * Middleware de validation des erreurs de requête
 */
export function validationErrorHandler(error, req, res, next) {
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      error: error.message,
      details: error.details || {},
    });
  }
  next(error);
}

/**
 * Log des erreurs pour monitoring
 */
export function logError(error, req, res, next) {
  // Log détaillé de l'erreur
  console.error("Error details:", {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  next(error);
}
