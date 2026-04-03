import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';
import { promotionsService } from './promotions.service';
import {
  createPromotionSchema,
  updatePromotionSchema,
  checkoutSchema,
  promotionsQuerySchema,
} from './promotions.schema';

export class PromotionsController {
  listPromotions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = promotionsQuerySchema.parse(req.query);
      const page = Math.max(1, parseInt(query.page ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));
      const result = await promotionsService.listPromotions(query.isActive, page, pageSize);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  createPromotion = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createPromotionSchema.parse(req.body);
      const promotion = await promotionsService.createPromotion(input);
      res.status(201).json(successResponse(promotion));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  updatePromotion = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const input = updatePromotionSchema.parse(req.body);
      const promotion = await promotionsService.updatePromotion(id, input);
      res.json(successResponse(promotion));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  checkout = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = checkoutSchema.parse(req.body);
      const result = await promotionsService.checkout(input);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };
}

export const promotionsController = new PromotionsController();
