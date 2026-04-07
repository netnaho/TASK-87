import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { logger } from '../lib/logger';
import { errorResponse } from '../types';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  if (err instanceof ZodError) {
    res.status(400).json(
      errorResponse('VALIDATION_ERROR', 'Request validation failed', err.errors)
    );
    return;
  }

  // Multer upload errors — translate to 400/413 instead of generic 500.
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json(errorResponse(err.code, err.message));
    return;
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      res.status(409).json(errorResponse('CONFLICT', 'A record with this value already exists'));
      return;
    }
    if (prismaErr.code === 'P2025') {
      res.status(404).json(errorResponse('NOT_FOUND', 'Record not found'));
      return;
    }
  }

  res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
}
