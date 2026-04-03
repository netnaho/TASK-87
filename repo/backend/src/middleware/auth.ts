import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticatedRequest, JwtPayload, errorResponse } from '../types';
import { Role } from '@prisma/client';

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Missing or invalid authorization header'));
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json(errorResponse('TOKEN_INVALID', 'Invalid or expired token'));
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      res.status(403).json(errorResponse('FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    next();
  };
}
