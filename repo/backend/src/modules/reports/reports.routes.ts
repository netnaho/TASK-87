import { Router, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { AuthenticatedRequest, successResponse } from '../../types';
import prisma from '../../lib/prisma';
import { cache } from '../../lib/cache';

const router = Router();

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

export default router;
