import { z } from 'zod';

export const fileReportSchema = z.object({
  contentType: z.string().min(1).max(50),
  contentId: z.number().int().positive(),
  reviewId: z.number().int().positive().optional(),
  reason: z.string().min(10).max(2000),
});
export type FileReportInput = z.infer<typeof fileReportSchema>;

export const takeActionSchema = z.object({
  action: z.enum(['WARN', 'HIDE', 'REMOVE', 'RESTORE']),
  notes: z.string().max(2000).optional(),
});
export type TakeActionInput = z.infer<typeof takeActionSchema>;

export const fileAppealSchema = z.object({
  moderationActionId: z.number().int().positive(),
  userStatement: z.string().min(10).max(5000),
});
export type FileAppealInput = z.infer<typeof fileAppealSchema>;

export const resolveAppealSchema = z.object({
  status: z.enum(['IN_REVIEW', 'UPHELD', 'OVERTURNED']),
  arbitrationNotes: z.string().max(5000).optional(),
  outcome: z.string().max(2000).optional(),
});
export type ResolveAppealInput = z.infer<typeof resolveAppealSchema>;

export const addSensitiveWordSchema = z.object({
  word: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
});
export type AddSensitiveWordInput = z.infer<typeof addSensitiveWordSchema>;

export const moderationQueueQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  status: z.enum(['PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
});

export const appealsQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  status: z.enum(['PENDING', 'IN_REVIEW', 'UPHELD', 'OVERTURNED']).optional(),
});
