import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const conversionsApi = {
  getAll: vi.fn(),
  getStats: vi.fn(),
  getProgress: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
};

class FakeApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

vi.mock('../services/api', () => ({ conversionsApi, ApiError: FakeApiError }));

const eventListeners = new Set<(e: { type: string }) => void>();
vi.mock('../services/eventStream', () => ({
  subscribeToEvents: (l: (e: { type: string }) => void) => {
    eventListeners.add(l);
    return () => eventListeners.delete(l);
  },
}));

beforeEach(() => {
  Object.values(conversionsApi).forEach((m) => m.mockReset());
  eventListeners.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useConversions', () => {
  it('exposes jobs and pagination from the response', async () => {
    conversionsApi.getAll.mockResolvedValue({
      data: [{ id: 'j1' }],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });
    const { useConversions } = await import('./useConversions');

    const { result } = renderHook(() => useConversions());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.jobs).toEqual([{ id: 'j1' }]);
    expect(result.current.pagination?.total).toBe(1);
  });

  it('refetches conversions after cancelJob succeeds', async () => {
    conversionsApi.getAll.mockResolvedValue({ data: [], pagination: null });
    conversionsApi.cancel.mockResolvedValue({ id: 'j1', status: 'failed' });
    const { useConversions } = await import('./useConversions');

    const { result } = renderHook(() => useConversions());
    await waitFor(() => expect(conversionsApi.getAll).toHaveBeenCalledTimes(1));

    await result.current.cancelJob('j1');
    await waitFor(() => expect(conversionsApi.getAll).toHaveBeenCalledTimes(2));
  });

  it('translates ApiError into Error in cancelJob', async () => {
    conversionsApi.getAll.mockResolvedValue({ data: [], pagination: null });
    conversionsApi.cancel.mockRejectedValue(new FakeApiError('cannot cancel'));
    const { useConversions } = await import('./useConversions');

    const { result } = renderHook(() => useConversions());
    await waitFor(() => expect(conversionsApi.getAll).toHaveBeenCalled());

    await expect(result.current.cancelJob('j1')).rejects.toThrow('cannot cancel');
  });
});

describe('useConversionStats', () => {
  it('refetches when sync.completed events fire', async () => {
    conversionsApi.getStats.mockResolvedValue({ byStatus: {}, recent: 0 });
    const { useConversionStats } = await import('./useConversions');

    renderHook(() => useConversionStats());
    await waitFor(() => expect(conversionsApi.getStats).toHaveBeenCalledTimes(1));

    eventListeners.forEach((l) => l({ type: 'sync.completed' }));
    await waitFor(() => expect(conversionsApi.getStats).toHaveBeenCalledTimes(2));
  });
});
