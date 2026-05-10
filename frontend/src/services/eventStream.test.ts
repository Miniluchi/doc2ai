import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

interface FakeEventSource {
  url: string;
  readyState: number;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
}

const created: FakeEventSource[] = [];

class MockEventSource {
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public readyState = 0;
  public close = vi.fn();
  public url: string;
  static readonly CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    created.push(this as unknown as FakeEventSource);
  }
}

beforeEach(async () => {
  created.length = 0;
  vi.stubGlobal('EventSource', MockEventSource);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eventStream.subscribeToEvents', () => {
  it('opens a single EventSource shared across listeners', async () => {
    const { subscribeToEvents } = await import('./eventStream');
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeToEvents(a);
    const unsubB = subscribeToEvents(b);

    expect(created).toHaveLength(1);

    created[0]!.onmessage?.({ data: JSON.stringify({ type: 'sync.started', sourceId: 's' }) });

    expect(a).toHaveBeenCalledWith({ type: 'sync.started', sourceId: 's' });
    expect(b).toHaveBeenCalledWith({ type: 'sync.started', sourceId: 's' });

    unsubA();
    unsubB();
  });

  it('closes the connection when the last subscriber unsubscribes', async () => {
    const { subscribeToEvents } = await import('./eventStream');
    const unsub = subscribeToEvents(() => undefined);
    expect(created[0]!.close).not.toHaveBeenCalled();

    unsub();

    expect(created[0]!.close).toHaveBeenCalled();
  });

  it('keeps the connection open while at least one subscriber remains', async () => {
    const { subscribeToEvents } = await import('./eventStream');
    const unsubA = subscribeToEvents(() => undefined);
    const unsubB = subscribeToEvents(() => undefined);

    unsubA();

    expect(created[0]!.close).not.toHaveBeenCalled();

    unsubB();
    expect(created[0]!.close).toHaveBeenCalled();
  });

  it('ignores malformed JSON payloads without throwing', async () => {
    const { subscribeToEvents } = await import('./eventStream');
    const handler = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const unsub = subscribeToEvents(handler);
    created[0]!.onmessage?.({ data: '{not-valid' });

    expect(handler).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();

    unsub();
    errSpy.mockRestore();
  });

  it('isolates listener errors from other listeners', async () => {
    const { subscribeToEvents } = await import('./eventStream');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const succeeding = vi.fn();

    const unsubA = subscribeToEvents(failing);
    const unsubB = subscribeToEvents(succeeding);

    created[0]!.onmessage?.({ data: JSON.stringify({ type: 'source.created', sourceId: 'x' }) });

    expect(failing).toHaveBeenCalled();
    expect(succeeding).toHaveBeenCalled();

    unsubA();
    unsubB();
    errSpy.mockRestore();
  });
});
