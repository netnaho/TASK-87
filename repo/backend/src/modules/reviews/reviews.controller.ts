import path from 'path';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';
import { reviewsService } from './reviews.service';
import { config } from '../../config';
import {
  createReviewSchema,
  createFollowUpSchema,
  createHostReplySchema,
  reviewsQuerySchema,
} from './reviews.schema';

export class ReviewsController {
  createReview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createReviewSchema.parse(req.body);
      const files = (req.files as Express.Multer.File[]) ?? [];
      const review = await reviewsService.createReview(input, req.user!.userId, files);
      res.status(201).json(successResponse(review));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getReview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const review = await reviewsService.getReview(id);
      res.json(successResponse(review));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  listReviews = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = reviewsQuerySchema.parse(req.query);
      const result = await reviewsService.listReviews(query);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  createFollowUp = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parentReviewId = parseInt(req.params.id as string, 10);
      const input = createFollowUpSchema.parse(req.body);
      const files = (req.files as Express.Multer.File[]) ?? [];
      const followUp = await reviewsService.createFollowUp(parentReviewId, input, req.user!.userId, files);
      res.status(201).json(successResponse(followUp));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  createHostReply = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reviewId = parseInt(req.params.id as string, 10);
      const input = createHostReplySchema.parse(req.body);
      const reply = await reviewsService.createHostReply(reviewId, input, req.user!.userId, req.user!.role);
      res.status(201).json(successResponse(reply));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getReviewImage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reviewId = parseInt(req.params.reviewId as string, 10);
      const imageId = parseInt(req.params.imageId as string, 10);
      const filename = await reviewsService.getImageFileByReviewAndId(
        reviewId,
        imageId,
        req.user!.userId,
        req.user!.role
      );
      const filePath = path.resolve(config.upload.dir, filename);
      res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json(errorResponse('NOT_FOUND', 'Image not found'));
        }
      });
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  listTags = async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tags = await reviewsService.listTags();
      res.json(successResponse(tags));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };
}

export const reviewsController = new ReviewsController();
