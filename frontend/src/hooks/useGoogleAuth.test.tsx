import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/api', () => ({
  GOOGLE_TOKEN_EXPIRED_EVENT: 'google-auth-expired',
}));

const tokenStorageStub = {
  saveCredentials: vi.fn(),
  getCredentials: vi.fn(),
  clearCredentials: vi.fn(),
  hasValidCredentials: vi.fn(),
  updateCredentials: vi.fn(),
};

vi.mock('../services/tokenStorage', () => ({ TokenStorage: tokenStorageStub }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  Object.values(tokenStorageStub).forEach((m) => m.mockReset());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  localStorage.clear();
  // Reset URL between tests
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGoogleAuth', () => {
  it('hydrates the user from TokenStorage on mount', async () => {
    tokenStorageStub.getCredentials.mockReturnValue({
      refreshToken: 'r',
      email: 'a@b.c',
      name: 'Alice',
    });
    const { useGoogleAuth } = await import('./useGoogleAuth');

    const { result } = renderHook(() => useGoogleAuth());

    await waitFor(() => expect(result.current.user?.email).toBe('a@b.c'));
  });

  it('promotes a transient google_auth_data blob into TokenStorage', async () => {
    tokenStorageStub.getCredentials.mockReturnValue(null);
    localStorage.setItem(
      'google_auth_data',
      JSON.stringify({
        user: { email: 'b@b.c', name: 'Bob' },
        refresh_token: 'rr',
      }),
    );
    const { useGoogleAuth } = await import('./useGoogleAuth');

    const { result } = renderHook(() => useGoogleAuth());

    await waitFor(() => expect(result.current.user?.refreshToken).toBe('rr'));
    expect(tokenStorageStub.saveCredentials).toHaveBeenCalled();
    expect(localStorage.getItem('google_auth_data')).toBeNull();
  });

  it('reads ?auth_error and strips it from the URL', async () => {
    tokenStorageStub.getCredentials.mockReturnValue(null);
    window.history.replaceState({}, '', '/?auth_error=denied');
    const { useGoogleAuth } = await import('./useGoogleAuth');

    const { result } = renderHook(() => useGoogleAuth());

    await waitFor(() => expect(result.current.error).toBe('denied'));
    expect(window.location.search).not.toContain('auth_error');
  });

  it('disconnect clears state and storage', async () => {
    tokenStorageStub.getCredentials.mockReturnValue({
      refreshToken: 'r',
      email: 'a@b.c',
      name: 'A',
    });
    const { useGoogleAuth } = await import('./useGoogleAuth');

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => result.current.disconnect());

    expect(result.current.user).toBeNull();
    expect(tokenStorageStub.clearCredentials).toHaveBeenCalled();
  });

  it('disconnects when a token-expired event fires', async () => {
    tokenStorageStub.getCredentials.mockReturnValue({
      refreshToken: 'r',
      email: 'a@b.c',
      name: 'A',
    });
    const { useGoogleAuth } = await import('./useGoogleAuth');

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      window.dispatchEvent(new CustomEvent('google-auth-expired'));
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toMatch(/expired/i);
  });

  it('sets error on connect when fetch fails', async () => {
    tokenStorageStub.getCredentials.mockReturnValue(null);
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: false, message: 'no auth' }),
    } as unknown as Response);
    const { useGoogleAuth } = await import('./useGoogleAuth');

    const { result } = renderHook(() => useGoogleAuth());
    await waitFor(() => expect(result.current.user).toBeNull());

    await act(async () => result.current.connect());

    expect(result.current.error).toBe('no auth');
    expect(result.current.isConnecting).toBe(false);
  });
});
