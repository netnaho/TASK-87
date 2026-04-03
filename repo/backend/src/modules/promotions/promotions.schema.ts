import { z } from 'zod';

export const createPromotionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.number().positive(),
  effectiveStart: z.string().datetime(),
  effectiveEnd: z.string().datetime(),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  conditions: z.record(z.unknown()).optional(),
  itemIds: z.array(z.number().int().positive()).optional(),
  exclusions: z.array(z.number().int().positive()).optional(),
}).refine(
  (data) => new Date(data.effectiveStart) < new Date(data.effectiveEnd),
  { message: 'effectiveStart must be before effectiveEnd', path: ['effectiveEnd'] }
).refine(
  (data) => !(data.discountType === 'PERCENTAGE' && data.discountValue > 100),
  { message: 'Percentage discount cannot exceed 100', path: ['discountValue'] }
);
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  discountValue: z.number().positive().optional(),
  effectiveStart: z.string().datetime().optional(),
  effectiveEnd: z.string().datetime().optional(),
  priority: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const promotionsQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
