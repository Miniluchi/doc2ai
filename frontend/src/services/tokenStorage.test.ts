import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenStorage } from './tokenStorage';

describe('TokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves credentials with an expiry timestamp', () => {
    TokenStorage.saveCredentials({ refreshToken: 'r', email: 'a@b.c', name: 'A' });

    const raw = localStorage.getItem('doc2ai_google_credentials');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { expiresAt: number; refreshToken: string };
    expect(parsed.refreshToken).toBe('r');
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns null when nothing is stored', () => {
    expect(TokenStorage.getCredentials()).toBeNull();
  });

  it('returns saved credentials when not expired', () => {
    TokenStorage.saveCredentials({ refreshToken: 'r', email: 'a@b.c', name: 'A' });
    const got = TokenStorage.getCredentials();
    expect(got?.email).toBe('a@b.c');
  });

  it('clears and returns null when credentials have expired', () => {
    TokenStorage.saveCredentials({ refreshToken: 'r', email: 'a@b.c', name: 'A' });
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z')); // beyond 24h TTL
    expect(TokenStorage.getCredentials()).toBeNull();
    expect(localStorage.getItem('doc2ai_google_credentials')).toBeNull();
  });

  it('returns null and clears the slot when stored JSON is corrupt', () => {
    localStorage.setItem('doc2ai_google_credentials', '{not-json');
    expect(TokenStorage.getCredentials()).toBeNull();
    expect(localStorage.getItem('doc2ai_google_credentials')).toBeNull();
  });

  it('hasValidCredentials reflects presence of a refreshToken', () => {
    expect(TokenStorage.hasValidCredentials()).toBe(false);
    TokenStorage.saveCredentials({ refreshToken: 'r', email: 'a@b.c', name: 'A' });
    expect(TokenStorage.hasValidCredentials()).toBe(true);
  });

  it('updateCredentials merges with existing credentials', () => {
    TokenStorage.saveCredentials({ refreshToken: 'r', email: 'a@b.c', name: 'Old' });
    TokenStorage.updateCredentials({ name: 'New' });
    expect(TokenStorage.getCredentials()?.name).toBe('New');
    expect(TokenStorage.getCredentials()?.refreshToken).toBe('r');
  });

  it('updateCredentials is a no-op when nothing exists', () => {
    TokenStorage.updateCredentials({ name: 'New' });
    expect(TokenStorage.getCredentials()).toBeNull();
  });

  it('saveCredentials swallows storage errors', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      TokenStorage.saveCredentials({ refreshToken: 'r', email: 'a@b.c', name: 'A' }),
    ).not.toThrow();

    setItem.mockRestore();
    errSpy.mockRestore();
  });
});
