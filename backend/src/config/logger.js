import pino from 'pino';
import config from './env.js';

const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? {
          target: 'pino/file',
          options: { destination: 1 },
        }
      : undefined,
});

export default logger;
