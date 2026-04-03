import { z } from 'zod';

export const rateTaskSchema = z.object({
  rateeId: z.number().int().positive(),
  taskId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type RateTaskInput = z.infer<typeof rateTaskSchema>;

export const adminAdjustSchema = z.object({
  userId: z.number().int().positive(),
  changeAmount: z.number().min(-100).max(100).refine((v) => v !== 0, {
    message: 'changeAmount must be non-zero',
  }),
  reason: z.string().min(1).max(500),
});
export type AdminAdjustInput = z.infer<typeof adminAdjustSchema>;
