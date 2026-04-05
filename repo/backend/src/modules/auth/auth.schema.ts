import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(100).regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(200),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
