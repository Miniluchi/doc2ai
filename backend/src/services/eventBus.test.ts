import { describe, it, expect } from 'bun:test';
import eventBus, { type AppEvent } from './eventBus.js';

describe('eventBus', () => {
  it('delivers a published event to a single subscriber', () => {
    const received: AppEvent[] = [];
    const unsubscribe = eventBus.onEvent((e) => received.push(e));

    eventBus.emitEvent({ type: 'sync.started', sourceId: 's-1' });

    expect(received).toEqual([{ type: 'sync.started', sourceId: 's-1' }]);
    unsubscribe();
  });

  it('delivers events to all active subscribers', () => {
    const a: AppEvent[] = [];
    const b: AppEvent[] = [];
    const unsubA = eventBus.onEvent((e) => a.push(e));
    const unsubB = eventBus.onEvent((e) => b.push(e));

    eventBus.emitEvent({ type: 'source.created', sourceId: 's-2' });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).toEqual({ type: 'source.created', sourceId: 's-2' });

    unsubA();
    unsubB();
  });

  it('stops delivering after unsubscribe', () => {
    const received: AppEvent[] = [];
    const unsubscribe = eventBus.onEvent((e) => received.push(e));
    unsubscribe();

    eventBus.emitEvent({ type: 'source.deleted', sourceId: 's-3' });

    expect(received).toEqual([]);
  });

  it('isolates subscribers from each other (unsubscribe one keeps the other)', () => {
    const a: AppEvent[] = [];
    const b: AppEvent[] = [];
    const unsubA = eventBus.onEvent((e) => a.push(e));
    const unsubB = eventBus.onEvent((e) => b.push(e));

    unsubA();
    eventBus.emitEvent({ type: 'sync.completed', sourceId: 's-4', fileCount: 2 });

    expect(a).toEqual([]);
    expect(b).toEqual([{ type: 'sync.completed', sourceId: 's-4', fileCount: 2 }]);
    unsubB();
  });
});
