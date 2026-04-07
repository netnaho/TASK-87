import { z } from 'zod';

// ─── REVIEWS ────────────────────────────────────────────────────

/**
 * Preprocessor for tagIds: handles multipart form data where repeated fields
 * arrive as strings or string arrays instead of numbers.
 *
 * Accepted shapes → normalised result:
 *   undefined / null          → undefined  (field not sent)
 *   "5"  (single string)      → [5]        (one tag, no [] suffix)
 *   ["5", "3"]  (string[])    → [5, 3]     (multiple tags, repeated field)
 *   [5, 3]      (number[])    → [5, 3]     (JSON body, unchanged)
 */
function coerceTagIds(val: unknown): unknown {
  if (val === undefined || val === null) return undefined;
  const arr = Array.isArray(val) ? val : [val];
  return arr.map((v) => (typeof v === 'string' ? Number(v) : v));
}

export const createReviewSchema = z.object({
  // z.coerce.number() accepts both JSON numbers and multipart string digits.
  revieweeId: z.coerce.number().int().positive().optional(),
  targetType: z.enum(['STAY', 'TASK']),
  targetId: z.coerce.number().int().positive(),
  ratingCleanliness: z.coerce.number().int().min(1).max(5),
  ratingCommunication: z.coerce.number().int().min(1).max(5),
  ratingAccuracy: z.coerce.number().int().min(1).max(5),
  text: z.string().max(5000).optional(),
  tagIds: z.preprocess(coerceTagIds, z.array(z.number().int().positive()).max(10).optional()),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const createFollowUpSchema = z.object({
  ratingCleanliness: z.coerce.number().int().min(1).max(5),
  ratingCommunication: z.coerce.number().int().min(1).max(5),
  ratingAccuracy: z.coerce.number().int().min(1).max(5),
  text: z.string().max(5000).optional(),
  tagIds: z.preprocess(coerceTagIds, z.array(z.number().int().positive()).max(10).optional()),
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
