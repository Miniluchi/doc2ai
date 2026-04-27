import type { Request, Response, NextFunction } from 'express';
import { validateDestinationPath } from '../utils/configParser.js';

export function validateSourceData(req: Request, res: Response, next: NextFunction): void {
  const { name, platform, config } = req.body as {
    name: unknown;
    platform: unknown;
    config: {
      credentials?: Record<string, unknown>;
      siteUrl?: string;
      destination?: string;
    } | null;
  };

  const errors: string[] = [];

  if (!name || typeof name !== 'string' || (name as string).trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  } else if ((name as string).length > 100) {
    errors.push('Name must be less than 100 characters');
  }

  const supportedPlatforms = ['sharepoint', 'googledrive', 'onedrive'];
  if (!platform || !supportedPlatforms.includes((platform as string).toLowerCase())) {
    errors.push(`Platform must be one of: ${supportedPlatforms.join(', ')}`);
  }

  if (!config || typeof config !== 'object') {
    errors.push('Config is required and must be an object');
  } else {
    if (!config.credentials || typeof config.credentials !== 'object') {
      errors.push('Config.credentials is required and must be an object');
    }

    const p = typeof platform === 'string' ? platform : '';
    if (p === 'sharepoint' || p === 'onedrive') {
      const { clientId, clientSecret, tenantId } = (config.credentials as Record<string, unknown>) ?? {};
      if (!clientId) errors.push('Microsoft clientId is required');
      if (!clientSecret) errors.push('Microsoft clientSecret is required');
      if (!tenantId) errors.push('Microsoft tenantId is required');
      if (p === 'sharepoint' && !config.siteUrl) {
        errors.push('SharePoint siteUrl is required');
      }
    }

    if (p === 'googledrive') {
      const { clientId, clientSecret, refreshToken } = (config.credentials as Record<string, unknown>) ?? {};
      if (!clientId) errors.push('Google clientId is required');
      if (!clientSecret) errors.push('Google clientSecret is required');
      if (!refreshToken) errors.push('Google refreshToken is required');
    }

    if (config.destination) {
      if (typeof config.destination !== 'string') {
        errors.push('Config.destination must be a string');
      } else {
        try {
          validateDestinationPath(config.destination);
        } catch (error) {
          errors.push(`Invalid destination: ${(error as Error).message}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    res.status(400).json({ success: false, message: 'Validation failed', errors });
    return;
  }

  next();
}

export function validateConversionJobData(req: Request, res: Response, next: NextFunction): void {
  const { sourceId, fileName, filePath, fileSize } = req.body as {
    sourceId: unknown;
    fileName: unknown;
    filePath: unknown;
    fileSize: unknown;
  };

  const errors: string[] = [];

  if (!sourceId || typeof sourceId !== 'string') {
    errors.push('sourceId is required and must be a string');
  }

  if (!fileName || typeof fileName !== 'string' || (fileName as string).trim().length === 0) {
    errors.push('fileName is required and must be a non-empty string');
  } else {
    const supportedExtensions = ['.docx', '.doc', '.pdf'];
    const fn = fileName as string;
    const extension = fn.substring(fn.lastIndexOf('.')).toLowerCase();
    if (!supportedExtensions.includes(extension)) {
      errors.push(
        `Unsupported file extension: ${extension}. Supported: ${supportedExtensions.join(', ')}`,
      );
    }
  }

  if (!filePath || typeof filePath !== 'string' || (filePath as string).trim().length === 0) {
    errors.push('filePath is required and must be a non-empty string');
  }

  if (fileSize !== undefined && (typeof fileSize !== 'number' || (fileSize as number) < 0)) {
    errors.push('fileSize must be a positive number if provided');
  }

  if (errors.length > 0) {
    res.status(400).json({ success: false, message: 'Validation failed', errors });
    return;
  }

  next();
}

export function validatePagination(req: Request, res: Response, next: NextFunction): void {
  const { page, limit } = req.query as { page?: string; limit?: string };

  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      res.status(400).json({
        success: false,
        message: 'Invalid page parameter. Must be a positive integer.',
      });
      return;
    }
    (req.query as Record<string, unknown>)['page'] = pageNum;
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      res.status(400).json({
        success: false,
        message: 'Invalid limit parameter. Must be between 1 and 100.',
      });
      return;
    }
    (req.query as Record<string, unknown>)['limit'] = limitNum;
  }

  next();
}

export function validateId(paramName = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.params[paramName];

    if (!id) {
      res.status(400).json({ success: false, message: `${paramName} parameter is required` });
      return;
    }

    if (!/^c[a-z0-9]{10,}$/i.test(id)) {
      res.status(400).json({ success: false, message: `Invalid ${paramName} format` });
      return;
    }

    next();
  };
}

export function validateJobStatus(req: Request, res: Response, next: NextFunction): void {
  const { status } = req.query as { status?: string };

  if (status !== undefined) {
    const validStatuses = ['pending', 'processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
      return;
    }
  }

  next();
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  function sanitize(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return obj.trim().replace(/[<>]/g, '');
    } else if (typeof obj === 'object' && obj !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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
    req.query = sanitize(req.query) as typeof req.query;
  }

  next();
}

export function validateRequestSize(maxSizeMB = 10) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') ?? '0');
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (contentLength > maxSizeBytes) {
      res.status(413).json({
        success: false,
        message: 'Request too large',
        error: `Request size (${Math.round(contentLength / 1024 / 1024)}MB) exceeds limit (${maxSizeMB}MB)`,
      });
      return;
    }

    next();
  };
}

export function validateContentType(req: Request, res: Response, next: NextFunction): void {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {
      res.status(400).json({
        success: false,
        message: 'Invalid Content-Type',
        error: 'Expected application/json',
      });
      return;
    }
  }

  next();
}
