import { describe, it, expect } from 'bun:test';
import type { Request, Response } from 'express';
import { sanitizeInput } from './validation.js';

describe('sanitizeInput', () => {
  it('trims strings and strips angle brackets in body and query', () => {
    const req = {
      body: { name: '  <Alice> ', tag: '<script>x</script>' },
      query: { q: ' <hello> ' },
    } as unknown as Request;
    let nextCalled = false;
    sanitizeInput(req, {} as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.body).toEqual({ name: 'Alice', tag: 'scriptx/script' });
    expect(req.query).toEqual({ q: 'hello' });
  });

  it('recurses into nested objects', () => {
    const req = { body: { user: { name: ' <bob> ', meta: { role: ' <admin> ' } } } } as Request;
    sanitizeInput(req, {} as Response, () => undefined);
    expect(req.body).toEqual({ user: { name: 'bob', meta: { role: 'admin' } } });
  });

  it('leaves non-string scalars untouched', () => {
    const req = { body: { age: 30, active: true, score: null } } as Request;
    sanitizeInput(req, {} as Response, () => undefined);
    expect(req.body).toEqual({ age: 30, active: true, score: null });
  });

  it('is a no-op when body and query are absent', () => {
    const req = {} as Request;
    let nextCalled = false;
    sanitizeInput(req, {} as Response, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });
});
