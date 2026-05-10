import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const monitoringApi = {
  getStatus: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  getLogs: vi.fn(),
  healthCheck: vi.fn(),
};

class FakeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

vi.mock('../services/api', () => ({ monitoringApi, ApiError: FakeApiError }));

const eventListeners = new Set<(e: { type: string }) => void>();
vi.mock('../services/eventStream', () => ({
  subscribeToEvents: (l: (e: { type: string }) => void) => {
    eventListeners.add(l);
    return () => eventListeners.delete(l);
  },
}));

beforeEach(() => {
  Object.values(monitoringApi).forEach((m) => m.mockReset());
  eventListeners.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMonitoring', () => {
  it('loads the current status on mount', async () => {
    monitoringApi.getStatus.mockResolvedValue({ running: true, sources: 2 });
    const { useMonitoring } = await import('./useMonitoring');

    const { result } = renderHook(() => useMonitoring());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toEqual({ running: true, sources: 2 });
  });

  it('refreshes status after startMonitoring', async () => {
    monitoringApi.getStatus.mockResolvedValue({ running: false });
    monitoringApi.start.mockResolvedValue(undefined);
    const { useMonitoring } = await import('./useMonitoring');

    const { result } = renderHook(() => useMonitoring());
    await waitFor(() => expect(monitoringApi.getStatus).toHaveBeenCalledTimes(1));

    await result.current.startMonitoring();
    await waitFor(() => expect(monitoringApi.getStatus).toHaveBeenCalledTimes(2));
    expect(monitoringApi.start).toHaveBeenCalled();
  });

  it('rethrows mutation errors as Error', async () => {
    monitoringApi.getStatus.mockResolvedValue({ running: false });
    monitoringApi.stop.mockRejectedValue(new FakeApiError('cannot stop'));
    const { useMonitoring } = await import('./useMonitoring');

    const { result } = renderHook(() => useMonitoring());
    await waitFor(() => expect(monitoringApi.getStatus).toHaveBeenCalled());

    await expect(result.current.stopMonitoring()).rejects.toThrow('cannot stop');
  });

  it('refetches when source.created arrives via SSE', async () => {
    monitoringApi.getStatus.mockResolvedValue({ running: true });
    const { useMonitoring } = await import('./useMonitoring');

    renderHook(() => useMonitoring());
    await waitFor(() => expect(monitoringApi.getStatus).toHaveBeenCalledTimes(1));

    eventListeners.forEach((l) => l({ type: 'source.created' }));
    await waitFor(() => expect(monitoringApi.getStatus).toHaveBeenCalledTimes(2));
  });
});
