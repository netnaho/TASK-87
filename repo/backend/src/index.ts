import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { logger } from './lib/logger';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { startScheduler } from './lib/scheduler';
import { successResponse } from './types';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import locationsRoutes from './modules/locations/locations.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import reviewsRoutes from './modules/reviews/reviews.routes';
import trustRoutes from './modules/trust/trust.routes';
import moderationRoutes from './modules/moderation/moderation.routes';
import promotionsRoutes from './modules/promotions/promotions.routes';
import searchRoutes from './modules/search/search.routes';
import reportsRoutes from './modules/reports/reports.routes';

const app = express();

// Global middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Static file serving for uploads
app.use('/uploads', express.static(config.upload.dir));

// Health check
app.get('/api/health', (_req, res) => {
  res.json(successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
  }));
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(config.port, '0.0.0.0', () => {
  logger.info({ port: config.port, env: config.nodeEnv }, `HarborOps backend running on port ${config.port}`);
  startScheduler();
});

export default app;
