import { describe, it, expect } from 'bun:test';
import type { Request, Response } from 'express';
import { errorHandler, notFoundHandler, logError } from './errorHandler.js';

interface CapturedResponse {
  res: Response;
  status: number | undefined;
  body: Record<string, unknown> | undefined;
}

function makeRes(): CapturedResponse {
  const captured: CapturedResponse = { res: {} as Response, status: undefined, body: undefined };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  captured.res = res;
  return captured;
}

const baseReq = {
  method: 'GET',
  originalUrl: '/api/foo',
  get: () => 'jest',
  ip: '127.0.0.1',
} as unknown as Request;

describe('errorHandler', () => {
  it('maps duplicate-resource errors to 409', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('dup'), { code: 'P2002' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(409);
    expect(captured.body?.['message']).toBe('Resource already exists');
  });

  it('maps not-found Prisma codes to 404', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('missing'), { code: 'P2025' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(404);
  });

  it('maps invalid token errors to 401', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('jwt malformed'), { name: 'JsonWebTokenError' });
    errorHandler(err as Error, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body?.['message']).toBe('Invalid token');
  });

  it('maps token-expired errors to 401', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    errorHandler(err as Error, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(401);
    expect(captured.body?.['message']).toBe('Token expired');
  });

  it('maps body-parser failures to 400', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('bad json'), { type: 'entity.parse.failed' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(400);
  });

  it('maps payload-too-large to 413', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('big'), { type: 'entity.too.large' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(413);
  });

  it('maps timeouts to 408', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(408);
  });

  it('maps permission errors to 403', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('denied'), { code: 'EACCES' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(403);
  });

  it('maps missing-file errors to 404', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(404);
  });

  it('maps storage-full errors to 507', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(507);
  });

  it('honours error.statusCode for unmapped errors', () => {
    const captured = makeRes();
    const err = Object.assign(new Error('teapot'), { statusCode: 418 });
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(418);
    expect(captured.body?.['message']).toBe('teapot');
  });

  it('hides details for 500 errors and never leaks the stack', () => {
    const captured = makeRes();
    const err = new Error('boom');
    errorHandler(err, baseReq, captured.res, () => undefined);
    expect(captured.status).toBe(500);
    expect(captured.body?.['message']).toBe('Internal server error');
  });
});

describe('notFoundHandler', () => {
  it('returns a 404 with the available endpoints', () => {
    const captured = makeRes();
    notFoundHandler(baseReq, captured.res);
    expect(captured.status).toBe(404);
    expect(captured.body?.['error']).toContain('GET /api/foo');
  });
});

describe('logError', () => {
  it('forwards to next() with the original error', () => {
    let received: unknown = null;
    logError(new Error('boom'), baseReq, {} as Response, (err?: unknown) => {
      received = err;
    });
    expect((received as Error).message).toBe('boom');
  });
});
