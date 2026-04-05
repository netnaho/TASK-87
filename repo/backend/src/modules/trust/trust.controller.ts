import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, successResponse, errorResponse, paginate } from '../../types';
import { trustService } from './trust.service';
import { rateTaskSchema, adminAdjustSchema } from './trust.schema';

export class TrustController {
  getMyScore = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const score = await trustService.getScore(req.user!.userId);
      res.json(successResponse(score));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getUserScore = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      const score = await trustService.getScore(userId);
      res.json(successResponse(score));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getMyHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, pageSize } = paginate(req.query.page as string, req.query.pageSize as string);
      const result = await trustService.getHistory(req.user!.userId, page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getUserHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = parseInt(req.params.userId as string, 10);
      if (isNaN(userId)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid user ID'));
        return;
      }
      const { page, pageSize } = paginate(req.query.page as string, req.query.pageSize as string);
      const result = await trustService.getUserHistory(userId, page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  rateTask = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = rateTaskSchema.parse(req.body);
      const result = await trustService.rateTask(input, req.user!.userId);
      res.status(201).json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getLeaderboard = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)));
      const result = await trustService.getLeaderboard(limit);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getAllScores = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await trustService.getAllScores();
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  adminAdjust = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = adminAdjustSchema.parse(req.body);
      const result = await trustService.adminAdjust(input, req.user!.userId);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };
}

export const trustController = new TrustController();
