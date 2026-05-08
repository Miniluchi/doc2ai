import { describe, it, expect, mock } from 'bun:test';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { extractUserInfo } from './auth.js';
import config from '../config/env.js';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeNext(): { next: NextFunction; called: boolean } {
  const state = { called: false } as { called: boolean; next: NextFunction };
  state.next = () => {
    state.called = true;
  };
  return state;
}

describe('extractUserInfo', () => {
  it('marks request unauthenticated when no token is present', () => {
    const req = makeReq();
    const { next, } = makeNext();
    extractUserInfo(req, {} as Response, next);

    expect(req.userInfo).toEqual({ isAuthenticated: false, userId: null, role: null });
  });

  it('decodes a valid JWT and merges its claims', () => {
    const token = jwt.sign({ userId: 'u1', role: 'admin' }, config.jwtSecret);
    const req = makeReq({ authorization: `Bearer ${token}` });
    const { next } = makeNext();
    extractUserInfo(req, {} as Response, next);

    expect(req.userInfo?.isAuthenticated).toBe(true);
    expect(req.userInfo?.userId).toBe('u1');
    expect(req.userInfo?.role).toBe('admin');
  });

  it('falls through unauthenticated on an invalid token', () => {
    const req = makeReq({ authorization: 'Bearer not-a-real-token' });
    const { next } = makeNext();
    extractUserInfo(req, {} as Response, next);

    expect(req.userInfo).toEqual({ isAuthenticated: false, userId: null, role: null });
  });

  it('falls through unauthenticated on an expired token', () => {
    const token = jwt.sign({ userId: 'u1' }, config.jwtSecret, { expiresIn: '-1s' });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const { next } = makeNext();
    extractUserInfo(req, {} as Response, next);

    expect(req.userInfo?.isAuthenticated).toBe(false);
  });

  it('always calls next()', () => {
    const req = makeReq();
    const state = makeNext();
    extractUserInfo(req, {} as Response, state.next);
    expect(state.called).toBe(true);
  });
});

// Avoid unused-import warnings on `mock`
void mock;
