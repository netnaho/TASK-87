import { Role } from '@prisma/client';
import { Request } from 'express';

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface PaginationQuery {
  page?: string;
  pageSize?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function paginate(page?: string | number, pageSize?: string | number) {
  const p = Math.max(1, parseInt(String(page || '1'), 10));
  const ps = Math.min(100, Math.max(1, parseInt(String(pageSize || '20'), 10)));
  return { page: p, pageSize: ps, skip: (p - 1) * ps, take: ps };
}

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function errorResponse(code: string, message: string, details?: unknown): ApiResponse {
  return { success: false, error: { code, message, details } };
}
