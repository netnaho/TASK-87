import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../../middleware/auth';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';
import prisma from '../../lib/prisma';
import { cache } from '../../lib/cache';
import { processScheduledReport } from './reports.processor';

const router = Router();

const scheduleReportSchema = z.object({
  reportType: z.enum(['KPI_SUMMARY', 'REVIEW_EFFICIENCY', 'INVENTORY_SNAPSHOT']),
  scheduledFor: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date'),
  format: z.enum(['csv', 'excel']).optional().default('csv'),
});

router.get(
  '/kpi/dashboard',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const cacheKey = 'kpi:dashboard';
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        res.json(successResponse(cached));
        return;
      }

      const kpis = await prisma.kpiDaily.findMany({
        orderBy: { date: 'desc' },
        take: 30,
      });

      cache.set(cacheKey, kpis);
      res.json(successResponse(kpis));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/review-efficiency',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reports = await prisma.reportReviewEfficiency.findMany({
        orderBy: { date: 'desc' },
        take: 30,
      });
      res.json(successResponse(reports));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/scheduled',
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const reports = await prisma.scheduledReport.findMany({
        where: { requestedBy: req.user!.userId },
        orderBy: { createdAt: 'desc' },
      });
      res.json(successResponse(reports));
    } catch (err) {
      next(err);
    }
  }
);

// POST /reports/schedule — create a scheduled report
router.post(
  '/schedule',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const input = scheduleReportSchema.parse(req.body);
      const report = await prisma.scheduledReport.create({
        data: {
          reportType: input.reportType,
          format: input.format,
          requestedBy: req.user!.userId,
          scheduledTime: new Date(input.scheduledFor),
          status: 'PENDING',
          filePath: null,
        },
      });
      res.status(201).json(successResponse(report));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }
);

// POST /reports/scheduled/:id/process — trigger immediate processing (for testing)
router.post(
  '/scheduled/:id/process',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const report = await prisma.scheduledReport.findUnique({ where: { id } });
      if (!report) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Scheduled report not found'));
        return;
      }
      if (report.requestedBy !== req.user!.userId && req.user!.role !== 'ADMIN' && req.user!.role !== 'MANAGER') {
        res.status(403).json(errorResponse('FORBIDDEN', 'Not authorized to process this report'));
        return;
      }
      if (report.status !== 'PENDING') {
        res.status(422).json(errorResponse('INVALID_STATE', `Report is already ${report.status}`));
        return;
      }

      const updated = await processScheduledReport(report.id);
      res.json(successResponse(updated));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }
);

// GET /reports/scheduled/:id/download — download a completed report file
router.get(
  '/scheduled/:id/download',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const report = await prisma.scheduledReport.findUnique({ where: { id } });
      if (!report) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Scheduled report not found'));
        return;
      }
      if (report.requestedBy !== req.user!.userId && req.user!.role !== 'ADMIN' && req.user!.role !== 'MANAGER') {
        res.status(403).json(errorResponse('FORBIDDEN', 'Not authorized to access this report'));
        return;
      }
      if (report.status !== 'READY' || !report.filePath) {
        res.status(422).json(errorResponse('NOT_READY', 'Report is not ready for download'));
        return;
      }

      const filePath = report.filePath;
      if (!fs.existsSync(filePath)) {
        res.status(404).json(errorResponse('FILE_NOT_FOUND', 'Report file not found on disk'));
        return;
      }

      const ext = path.extname(filePath);
      const filename = `${report.reportType}_${report.id}${ext}`;
      res.download(filePath, filename);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
