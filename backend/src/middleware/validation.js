import { validateDestinationPath } from "../utils/configParser.js";

export function validateSourceData(req, res, next) {
  const { name, platform, config } = req.body;

  const errors = [];

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    errors.push("Name is required and must be a non-empty string");
  } else if (name.length > 100) {
    errors.push("Name must be less than 100 characters");
  }

  const supportedPlatforms = ["sharepoint", "googledrive", "onedrive"];
  if (!platform || !supportedPlatforms.includes(platform.toLowerCase())) {
    errors.push(`Platform must be one of: ${supportedPlatforms.join(", ")}`);
  }

  if (!config || typeof config !== "object") {
    errors.push("Config is required and must be an object");
  } else {
    if (!config.credentials || typeof config.credentials !== "object") {
      errors.push("Config.credentials is required and must be an object");
    }

    if (platform === "sharepoint" || platform === "onedrive") {
      const { clientId, clientSecret, tenantId } = config.credentials || {};
      if (!clientId) errors.push("Microsoft clientId is required");
      if (!clientSecret) errors.push("Microsoft clientSecret is required");
      if (!tenantId) errors.push("Microsoft tenantId is required");
      if (platform === "sharepoint" && !config.siteUrl) {
        errors.push("SharePoint siteUrl is required");
      }
    }

    if (platform === "googledrive") {
      const { clientId, clientSecret, refreshToken } = config.credentials || {};
      if (!clientId) errors.push("Google clientId is required");
      if (!clientSecret) errors.push("Google clientSecret is required");
      if (!refreshToken) errors.push("Google refreshToken is required");
    }

    if (config.destination) {
      if (typeof config.destination !== "string") {
        errors.push("Config.destination must be a string");
      } else {
        try {
          validateDestinationPath(config.destination);
        } catch (error) {
          errors.push(`Invalid destination: ${error.message}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
}

export function validateConversionJobData(req, res, next) {
  const { sourceId, fileName, filePath, fileSize } = req.body;

  const errors = [];

  if (!sourceId || typeof sourceId !== "string") {
    errors.push("sourceId is required and must be a string");
  }

  if (
    !fileName ||
    typeof fileName !== "string" ||
    fileName.trim().length === 0
  ) {
    errors.push("fileName is required and must be a non-empty string");
  } else {
    const supportedExtensions = [".docx", ".doc", ".pdf"];
    const extension = fileName
      .substring(fileName.lastIndexOf("."))
      .toLowerCase();
    if (!supportedExtensions.includes(extension)) {
      errors.push(
        `Unsupported file extension: ${extension}. Supported: ${supportedExtensions.join(", ")}`,
      );
    }
  }

  if (
    !filePath ||
    typeof filePath !== "string" ||
    filePath.trim().length === 0
  ) {
    errors.push("filePath is required and must be a non-empty string");
  }

  if (
    fileSize !== undefined &&
    (typeof fileSize !== "number" || fileSize < 0)
  ) {
    errors.push("fileSize must be a positive number if provided");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
}

export function validatePagination(req, res, next) {
  const { page, limit } = req.query;

  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid page parameter. Must be a positive integer.",
      });
    }
    req.query.page = pageNum;
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid limit parameter. Must be between 1 and 100.",
      });
    }
    req.query.limit = limitNum;
  }

  next();
}

export function validateId(paramName = "id") {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!id) {
      return res.status(400).json({
        success: false,
        message: `${paramName} parameter is required`,
      });
    }

    // Basic CUID format validation (starts with 'c' followed by alphanumeric chars)
    if (!/^c[a-z0-9]{10,}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
}

export function validateJobStatus(req, res, next) {
  const { status } = req.query;

  if (status !== undefined) {
    const validStatuses = ["pending", "processing", "completed", "failed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }
  }

  next();
}

export function sanitizeInput(req, res, next) {
  function sanitize(obj) {
    if (typeof obj === "string") {
      return obj.trim().replace(/[<>]/g, "");
    } else if (typeof obj === "object" && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  }

  if (req.body) {
    req.body = sanitize(req.body);
  }

  if (req.query) {
    req.query = sanitize(req.query);
  }

  next();
}

export function validateRequestSize(maxSizeMB = 10) {
  return (req, res, next) => {
    const contentLength = parseInt(req.get("content-length"));
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        success: false,
        message: "Request too large",
        error: `Request size (${Math.round(contentLength / 1024 / 1024)}MB) exceeds limit (${maxSizeMB}MB)`,
      });
    }

    next();
  };
}

export function validateContentType(req, res, next) {
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.get("content-type");

    if (!contentType || !contentType.includes("application/json")) {
      return res.status(400).json({
        success: false,
        message: "Invalid Content-Type",
        error: "Expected application/json",
      });
    }
  }

  next();
}
