import { EventEmitter } from 'node:events';

export type AppEvent =
  | { type: 'sync.started'; sourceId: string }
  | { type: 'sync.completed'; sourceId: string; fileCount: number }
  | { type: 'sync.failed'; sourceId: string; error: string }
  | { type: 'source.created'; sourceId: string }
  | { type: 'source.updated'; sourceId: string }
  | { type: 'source.deleted'; sourceId: string };

const CHANNEL = 'event';

class EventBus extends EventEmitter {
  emitEvent(event: AppEvent): void {
    this.emit(CHANNEL, event);
  }

  onEvent(listener: (event: AppEvent) => void): () => void {
    this.on(CHANNEL, listener);
    return () => {
      this.off(CHANNEL, listener);
    };
  }
}

const eventBus = new EventBus();
// Each SSE client adds one listener; raise the cap to accommodate multiple tabs.
eventBus.setMaxListeners(100);

export default eventBus;
