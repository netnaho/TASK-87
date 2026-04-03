import { z } from 'zod';

// ─── REVIEWS ────────────────────────────────────────────────────

export const createReviewSchema = z.object({
  revieweeId: z.number().int().positive().optional(),
  targetType: z.enum(['STAY', 'TASK']),
  targetId: z.number().int().positive(),
  ratingCleanliness: z.number().int().min(1).max(5),
  ratingCommunication: z.number().int().min(1).max(5),
  ratingAccuracy: z.number().int().min(1).max(5),
  text: z.string().max(5000).optional(),
  tagIds: z.array(z.number().int().positive()).max(10).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const createFollowUpSchema = z.object({
  ratingCleanliness: z.number().int().min(1).max(5),
  ratingCommunication: z.number().int().min(1).max(5),
  ratingAccuracy: z.number().int().min(1).max(5),
  text: z.string().max(5000).optional(),
  tagIds: z.array(z.number().int().positive()).max(10).optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const createHostReplySchema = z.object({
  text: z.string().min(1).max(2000),
});
export type CreateHostReplyInput = z.infer<typeof createHostReplySchema>;

export const reviewsQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  targetType: z.enum(['STAY', 'TASK']).optional(),
  status: z.enum(['ACTIVE', 'FLAGGED', 'HIDDEN', 'REMOVED']).optional(),
  revieweeId: z.string().optional(),
});
export type ReviewsQuery = z.infer<typeof reviewsQuerySchema>;
