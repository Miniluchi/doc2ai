const API_BASE_URL = import.meta.env.VITE_API_URL;

export type AppEvent =
  | { type: 'sync.started'; sourceId: string }
  | { type: 'sync.completed'; sourceId: string; fileCount: number }
  | { type: 'sync.failed'; sourceId: string; error: string }
  | { type: 'source.created'; sourceId: string }
  | { type: 'source.updated'; sourceId: string }
  | { type: 'source.deleted'; sourceId: string };

type Listener = (event: AppEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;

function openConnection(): void {
  if (source) return;

  source = new EventSource(`${API_BASE_URL}/events`);

  source.onmessage = (e) => {
    let event: AppEvent;
    try {
      event = JSON.parse(e.data) as AppEvent;
    } catch (err) {
      console.error('Failed to parse SSE event', err, e.data);
      return;
    }
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('SSE listener threw', err);
      }
    }
  };

  source.onerror = () => {
    if (source?.readyState === EventSource.CLOSED) {
      console.warn('SSE connection closed permanently');
    }
  };
}

function closeConnection(): void {
  if (listeners.size > 0 || !source) return;
  source.close();
  source = null;
}

/**
 * Subscribe to server-sent events from the backend.
 *
 * A single EventSource is shared across the whole app — opening one connection
 * per hook would saturate the browser's per-origin HTTP/1.1 connection limit
 * (~6) and stall regular fetch requests.
 */
export function subscribeToEvents(listener: Listener): () => void {
  listeners.add(listener);
  openConnection();
  return () => {
    listeners.delete(listener);
    closeConnection();
  };
}
