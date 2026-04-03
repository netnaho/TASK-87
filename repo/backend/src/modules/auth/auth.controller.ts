import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { registerSchema, loginSchema } from './auth.schema';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = registerSchema.parse(req.body);
      const result = await authService.register(input);
      res.status(201).json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(input);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }

  async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const user = await authService.getCurrentUser(req.user!.userId);
      res.json(successResponse(user));
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json(errorResponse(err.code, err.message));
        return;
      }
      next(err);
    }
  }
}

export const authController = new AuthController();
