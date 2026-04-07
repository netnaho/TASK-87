import { z } from 'zod';

// ─── MASTER DATA ────────────────────────────────────────────────

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  barcode: z.string().min(1).max(100).optional(),
  category: z.string().min(1).max(100),
  description: z.string().optional(),
  isLotControlled: z.boolean().default(false),
  requiresExpiration: z.boolean().default(false),
  unitOfMeasure: z.string().default('EA'),
  unitPrice: z.number().positive().optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  contact: z.string().optional(), // plaintext; service encrypts it
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = createVendorSchema.partial();
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

export const updateThresholdSchema = z.object({
  safetyThreshold: z.number().int().min(0),
});
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

// ─── MOVEMENTS ──────────────────────────────────────────────────

export const receiveSchema = z.object({
  vendorId: z.number().int().positive(),
  itemId: z.number().int().positive().optional(),
  barcode: z.string().min(1).max(100).optional(),
  locationId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unitCostUsd: z.number().positive().optional(),
  packSize: z.number().int().positive().optional(),
  deliveryDatetime: z.string().datetime().optional(),
  lotNumber: z.string().min(1).max(100).optional(),
  expirationDate: z.string().refine(
    (s) => !isNaN(Date.parse(s)),
    { message: 'Invalid date format for expirationDate — use ISO datetime or YYYY-MM-DD' }
  ).optional(),
  notes: z.string().optional(),
}).refine((d) => d.itemId || d.barcode, { message: 'Either itemId or barcode is required' });
export type ReceiveInput = z.infer<typeof receiveSchema>;

export const issueSchema = z.object({
  itemId: z.number().int().positive().optional(),
  barcode: z.string().min(1).max(100).optional(),
  locationId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  lotId: z.number().int().positive().optional(),
  notes: z.string().optional(),
}).refine((d) => d.itemId || d.barcode, { message: 'Either itemId or barcode is required' });
export type IssueInput = z.infer<typeof issueSchema>;

export const transferSchema = z.object({
  itemId: z.number().int().positive().optional(),
  barcode: z.string().min(1).max(100).optional(),
  fromLocationId: z.number().int().positive(),
  toLocationId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  lotId: z.number().int().positive().optional(),
  notes: z.string().optional(),
}).refine((d) => d.itemId || d.barcode, { message: 'Either itemId or barcode is required' });
export type TransferInput = z.infer<typeof transferSchema>;

// ─── STOCK COUNTS ───────────────────────────────────────────────

export const createStockCountSchema = z.object({
  locationId: z.number().int().positive(),
});
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

export const updateLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.number().int().positive(),
        countedQty: z.number().int().min(0),
      })
    )
    .min(1),
});
export type UpdateLinesInput = z.infer<typeof updateLinesSchema>;

// ─── QUERY PARAMS ───────────────────────────────────────────────

export const itemsQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
export type ItemsQuery = z.infer<typeof itemsQuerySchema>;

export const stockCountQuerySchema = z.object({
  locationId: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});
export type StockCountQuery = z.infer<typeof stockCountQuerySchema>;

export const ledgerQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  itemId: z.string().optional(),
  locationId: z.string().optional(),
  vendorId: z.string().optional(),
  lotId: z.string().optional(),
  movementType: z
    .enum(['RECEIVING', 'ISSUE', 'TRANSFER', 'STOCK_COUNT', 'ADJUSTMENT'])
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortField: z.enum(['createdAt', 'quantity', 'movementType']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  format: z.enum(['csv', 'excel']).optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
