import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, errorResponse } from '../types';
import prisma from '../lib/prisma';
import { config } from '../config';

export function rateLimit(action: string, maxPerHour?: number) {
  const limit = maxPerHour ?? config.rateLimit.reviewsPerHour;

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required'));
      return;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await prisma.rateLimitLog.count({
      where: {
        userId: req.user.userId,
        action,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (count >= limit) {
      res.status(429).json(
        errorResponse('RATE_LIMITED', `Rate limit exceeded. Maximum ${limit} ${action} actions per hour.`)
      );
      return;
    }

    // Log the action
    await prisma.rateLimitLog.create({
      data: {
        userId: req.user.userId,
        action,
        createdAt: new Date(),
      },
    });

    next();
  };
}
