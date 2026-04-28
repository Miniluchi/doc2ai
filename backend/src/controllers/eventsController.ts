import type { Request, Response } from 'express';
import eventBus from '../services/eventBus.js';
import logger from '../config/logger.js';

const HEARTBEAT_MS = 25_000;

class EventsController {
  stream(req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable response buffering on Nginx-like proxies so events flush immediately.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(': connected\n\n');

    const unsubscribe = eventBus.onEvent((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on('close', cleanup);
    req.on('error', (err: NodeJS.ErrnoException) => {
      // ECONNRESET / aborted is the normal way a client ends an SSE stream
      // (tab close, navigation, reload). Only surface unexpected errors.
      if (err.code !== 'ECONNRESET' && err.message !== 'aborted') {
        logger.warn({ err }, 'SSE connection error');
      }
      cleanup();
    });
  }
}

export default EventsController;
