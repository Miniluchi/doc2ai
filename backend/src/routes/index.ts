import express from 'express';
import sourcesRouter from './sources.js';
import conversionsRouter from './conversions.js';
import monitoringRouter from './monitoring.js';
import authRouter from './auth.js';
import eventsRouter from './events.js';

const router = express.Router();

router.use('/sources', sourcesRouter);
router.use('/conversions', conversionsRouter);
router.use('/monitoring', monitoringRouter);
router.use('/auth', authRouter);
router.use('/events', eventsRouter);

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Doc2AI API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

router.get('/', (_req, res) => {
  res.json({
    name: 'Doc2AI Backend API',
    version: '1.0.0',
    description: 'API for converting documents to Markdown using AI',
    endpoints: {
      sources: '/api/sources',
      conversions: '/api/conversions',
      monitoring: '/api/monitoring',
      auth: '/api/auth',
      events: '/api/events',
    },
    documentation: 'https://github.com/yourusername/doc2ai',
  });
});

export default router;
