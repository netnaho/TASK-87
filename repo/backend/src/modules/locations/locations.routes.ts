import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { AuthenticatedRequest, successResponse, errorResponse, paginate } from '../../types';

const router = Router();

const createLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(successResponse(locations));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createLocationSchema.parse(req.body);
      const location = await prisma.location.create({ data: input });
      res.status(201).json(successResponse(location));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }
);

router.patch(
  '/:id',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const input = createLocationSchema.partial().parse(req.body);
      const location = await prisma.location.update({
        where: { id },
        data: input,
      });
      res.json(successResponse(location));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
