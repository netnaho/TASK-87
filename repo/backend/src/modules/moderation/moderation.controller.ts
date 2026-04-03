import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, successResponse, errorResponse, paginate } from '../../types';
import { moderationService } from './moderation.service';
import {
  fileReportSchema,
  takeActionSchema,
  fileAppealSchema,
  resolveAppealSchema,
  addSensitiveWordSchema,
  moderationQueueQuerySchema,
  appealsQuerySchema,
} from './moderation.schema';

export class ModerationController {
  fileReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = fileReportSchema.parse(req.body);
      const report = await moderationService.fileReport(input, req.user!.userId);
      res.status(201).json(successResponse(report));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getQueue = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = moderationQueueQuerySchema.parse(req.query);
      const { page, pageSize } = paginate(query.page, query.pageSize);
      const result = await moderationService.getQueue(query.status, page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  assignReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reportId = parseInt(req.params.id as string, 10);
      const result = await moderationService.assignReport(reportId, req.user!.userId);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  takeAction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reportId = parseInt(req.params.id as string, 10);
      const input = takeActionSchema.parse(req.body);
      const result = await moderationService.takeAction(reportId, input, req.user!.userId);
      res.status(201).json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getAudit = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, pageSize } = paginate(req.query.page as string, req.query.pageSize as string);
      const result = await moderationService.getAudit(page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  fileAppeal = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = fileAppealSchema.parse(req.body);
      const appeal = await moderationService.fileAppeal(input, req.user!.userId);
      res.status(201).json(successResponse(appeal));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  listAppeals = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = appealsQuerySchema.parse(req.query);
      const { page, pageSize } = paginate(query.page, query.pageSize);
      const result = await moderationService.listAppeals(query.status, page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  resolveAppeal = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appealId = parseInt(req.params.id as string, 10);
      const input = resolveAppealSchema.parse(req.body);
      const result = await moderationService.resolveAppeal(appealId, input);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  addSensitiveWord = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = addSensitiveWordSchema.parse(req.body);
      const word = await moderationService.addSensitiveWord(input);
      res.status(201).json(successResponse(word));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  listSensitiveWords = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, pageSize } = paginate(req.query.page as string, req.query.pageSize as string);
      const result = await moderationService.listSensitiveWords(page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  deleteSensitiveWord = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const result = await moderationService.deleteSensitiveWord(id);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };
}

export const moderationController = new ModerationController();
