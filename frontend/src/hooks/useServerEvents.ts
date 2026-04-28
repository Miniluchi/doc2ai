import { useEffect, useRef } from 'react';
import { subscribeToEvents, type AppEvent } from '../services/eventStream';

export type { AppEvent } from '../services/eventStream';
export type AppEventType = AppEvent['type'];

/**
 * Subscribe to server-sent events from the backend.
 *
 * The handler is held in a ref so callers can pass inline closures without
 * re-subscribing on every render. All hook instances share a single underlying
 * EventSource — see `services/eventStream.ts`.
 */
export function useServerEvents(handler: (event: AppEvent) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribeToEvents((event) => handlerRef.current(event));
  }, []);
}
