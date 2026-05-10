import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const sourcesApi = {
  getAll: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  testConnection: vi.fn(),
  sync: vi.fn(),
  getStats: vi.fn(),
};

class FakeApiError extends Error {
  status?: number;
  data?: unknown;
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

vi.mock('../services/api', () => ({
  sourcesApi,
  ApiError: FakeApiError,
  GOOGLE_TOKEN_EXPIRED_EVENT: 'google-auth-expired',
}));

const eventListeners = new Set<(e: { type: string; sourceId?: string }) => void>();
vi.mock('../services/eventStream', () => ({
  subscribeToEvents: (listener: (e: { type: string; sourceId?: string }) => void) => {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  },
}));

beforeEach(() => {
  Object.values(sourcesApi).forEach((m) => m.mockReset());
  eventListeners.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSources', () => {
  it('starts in loading and resolves with the fetched list', async () => {
    sourcesApi.getAll.mockResolvedValue([{ id: 's1', name: 'A' }]);
    const { useSources } = await import('./useSources');

    const { result } = renderHook(() => useSources());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sources).toEqual([{ id: 's1', name: 'A' }]);
    expect(result.current.error).toBeNull();
  });

  it('exposes an error message when the API rejects', async () => {
    sourcesApi.getAll.mockRejectedValue(new FakeApiError('boom', 500));
    const { useSources } = await import('./useSources');

    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('boom');
    expect(result.current.sources).toEqual([]);
  });

  it('refetches when a relevant SSE event arrives', async () => {
    sourcesApi.getAll.mockResolvedValue([]);
    const { useSources } = await import('./useSources');

    renderHook(() => useSources());
    await waitFor(() => expect(sourcesApi.getAll).toHaveBeenCalledTimes(1));

    await act(async () => {
      eventListeners.forEach((l) => l({ type: 'source.created', sourceId: 'x' }));
    });

    await waitFor(() => expect(sourcesApi.getAll).toHaveBeenCalledTimes(2));
  });

  it('ignores irrelevant SSE events', async () => {
    sourcesApi.getAll.mockResolvedValue([]);
    const { useSources } = await import('./useSources');

    renderHook(() => useSources());
    await waitFor(() => expect(sourcesApi.getAll).toHaveBeenCalledTimes(1));

    eventListeners.forEach((l) => l({ type: 'sync.started', sourceId: 'x' }));

    expect(sourcesApi.getAll).toHaveBeenCalledTimes(1);
  });
});

describe('useSourceActions', () => {
  it('wraps sourcesApi errors as Error instances', async () => {
    sourcesApi.delete.mockRejectedValue(new FakeApiError('nope', 403));
    const { useSourceActions } = await import('./useSources');

    const { result } = renderHook(() => useSourceActions());

    await expect(result.current.deleteSource('id')).rejects.toThrow('nope');
  });

  it('passes the response through on success', async () => {
    sourcesApi.testConnection.mockResolvedValue({ success: true, message: 'pong' });
    const { useSourceActions } = await import('./useSources');

    const { result } = renderHook(() => useSourceActions());
    expect(await result.current.testConnection('id')).toEqual({ success: true, message: 'pong' });
  });
});
