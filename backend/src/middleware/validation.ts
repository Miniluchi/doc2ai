import type { Request, Response, NextFunction } from 'express';

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
