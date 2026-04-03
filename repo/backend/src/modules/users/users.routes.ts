import { Router, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { AuthenticatedRequest, successResponse, errorResponse, paginate } from '../../types';
import { z } from 'zod';
import { Role } from '@prisma/client';

const router = Router();

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip, take } = paginate(req.query.page as string, req.query.pageSize as string);
      const [items, total] = await Promise.all([
        prisma.user.findMany({
          skip,
          take,
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
            phoneMasked: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count(),
      ]);
      res.json(successResponse({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/role',
  authenticate,
  authorize('ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { role } = z.object({ role: z.nativeEnum(Role) }).parse(req.body);
      const user = await prisma.user.update({
        where: { id },
        data: { role },
        select: { id: true, username: true, displayName: true, role: true },
      });
      res.json(successResponse(user));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
