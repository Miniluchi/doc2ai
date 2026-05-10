import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const listeners = new Set<(e: { type: string; sourceId?: string }) => void>();
const unsubscribeMock = vi.fn();

vi.mock('../services/eventStream', () => ({
  subscribeToEvents: (l: (e: { type: string; sourceId?: string }) => void) => {
    listeners.add(l);
    return () => {
      unsubscribeMock();
      listeners.delete(l);
    };
  },
}));

beforeEach(() => {
  listeners.clear();
  unsubscribeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useServerEvents', () => {
  it('subscribes once on mount and unsubscribes on unmount', async () => {
    const { useServerEvents } = await import('./useServerEvents');
    const handler = vi.fn();
    const { unmount } = renderHook(() => useServerEvents(handler));

    expect(listeners.size).toBe(1);
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('always invokes the latest handler without re-subscribing', async () => {
    const { useServerEvents } = await import('./useServerEvents');
    const a = vi.fn();
    const b = vi.fn();

    const { rerender } = renderHook(({ h }) => useServerEvents(h), { initialProps: { h: a } });
    expect(listeners.size).toBe(1);

    rerender({ h: b });
    expect(listeners.size).toBe(1); // still single subscription

    listeners.forEach((l) => l({ type: 'source.created', sourceId: 'x' }));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith({ type: 'source.created', sourceId: 'x' });
  });
});
