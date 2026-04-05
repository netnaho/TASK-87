import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock Prisma before importing the service (vi.mock is hoisted automatically)
vi.mock('@/lib/prisma', () => ({
  default: {
    promotion: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    appliedPromotion: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import prisma from '@/lib/prisma';
import { promotionsService } from '@/modules/promotions/promotions.service';
import { createPromotionSchema } from '@/modules/promotions/promotions.schema';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Build a minimal promotion stub matching the shape `checkout()` expects. */
function makePromo(overrides: {
  id: number;
  priority?: number;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  name?: string;
  itemIds?: number[];   // empty = applies to all items
  excludes?: number[];  // ids this promo explicitly excludes
}): object {
  return {
    id: overrides.id,
    name: overrides.name ?? `Promo ${overrides.id}`,
    priority: overrides.priority ?? 1,
    discountType: overrides.discountType,
    discountValue: overrides.discountValue,
    items: (overrides.itemIds ?? []).map((iid) => ({ itemId: iid })),
    exclusionsFrom: (overrides.excludes ?? []).map((eid) => ({ excludedPromotionId: eid })),
  };
}

/** Build a minimal item stub. */
function makeItem(id: number, unitPrice: number): object {
  return { id, name: `Item ${id}`, unitPrice };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: create succeeds silently
  vi.mocked(prisma.appliedPromotion.create).mockResolvedValue({} as any);
});

// ─── Discount calculation via checkout() ─────────────────────────────────────

describe('Promotions - Discount Calculation', () => {
  it('calculates percentage discount correctly', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'PERCENTAGE', discountValue: 10 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 2 }] });
    // 10% of $200
    expect(result.lines[0].discountAmount).toBe(20);
    expect(result.lines[0].finalTotal).toBe(180);
  });

  it('calculates fixed amount discount correctly', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'FIXED_AMOUNT', discountValue: 25 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 50)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 3 }] });
    expect(result.lines[0].discountAmount).toBe(25);
    expect(result.lines[0].finalTotal).toBe(125);
  });

  it('caps fixed amount discount at line total', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'FIXED_AMOUNT', discountValue: 50 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 10)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 2 }] });
    // Line total is $20; discount capped at $20 not $50
    expect(result.lines[0].discountAmount).toBe(20);
    expect(result.lines[0].finalTotal).toBe(0);
  });

  it('handles 100% percentage discount', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'PERCENTAGE', discountValue: 100 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 50)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].discountAmount).toBe(50);
    expect(result.lines[0].finalTotal).toBe(0);
  });

  it('handles 0% discount', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'PERCENTAGE', discountValue: 0 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 50)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].discountAmount).toBe(0);
    expect(result.lines[0].finalTotal).toBe(50);
  });

  it('rounds percentage result to 2 decimal places', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'PERCENTAGE', discountValue: 33.33 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 10)] as any);

    // 33.33% of $10 = $3.333 → rounds to $3.33
    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].discountAmount).toBe(3.33);
  });

  it('applies no discount when no promotions are active', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 49.99)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 3 }] });
    expect(result.lines[0].discountAmount).toBe(0);
    expect(result.totalDiscount).toBe(0);
    expect(result.lines[0].finalTotal).toBeCloseTo(149.97, 2);
  });
});

// ─── Conflict resolution via checkout() ──────────────────────────────────────

describe('Promotions - Conflict Resolution', () => {
  it('picks highest priority promotion', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 1, discountType: 'PERCENTAGE', discountValue: 10 }),
      makePromo({ id: 2, priority: 5, discountType: 'PERCENTAGE', discountValue: 5 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].promotionId).toBe(2);
  });

  it('uses max savings as tiebreaker on equal priority', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 3, discountType: 'PERCENTAGE', discountValue: 10 }),
      makePromo({ id: 2, priority: 3, discountType: 'PERCENTAGE', discountValue: 20 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].promotionId).toBe(2);
  });

  it('blocks promotion that excludes an already-applied promotion', async () => {
    // Promo 1 (priority 5) is applied first; promo 2 (priority 3) explicitly excludes promo 1 → blocked
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 5, discountType: 'PERCENTAGE', discountValue: 10 }),
      makePromo({ id: 2, priority: 3, discountType: 'PERCENTAGE', discountValue: 20, excludes: [1] }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100), makeItem(2, 100)] as any);

    // Line 1 gets promo 1; line 2: promo 2 is blocked by its own exclusion of promo 1, promo 1 can re-apply
    const result = await promotionsService.checkout({
      items: [{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }],
    });
    expect(result.lines[0].promotionId).toBe(1);
    expect(result.lines[1].promotionId).toBe(1); // promo 1 re-applies; promo 2 blocked
  });

  it('blocks promotion when a previously applied promo explicitly excludes it', async () => {
    // Promo 1 (higher priority, excludes promo 2) gets applied to line 1
    // Line 2: promo 2 is blocked because promo 1 (applied) excludes promo 2
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 10, discountType: 'FIXED_AMOUNT', discountValue: 50, excludes: [2] }),
      makePromo({ id: 2, priority: 5, discountType: 'PERCENTAGE', discountValue: 30 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100), makeItem(2, 100)] as any);

    const result = await promotionsService.checkout({
      items: [{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }],
    });
    expect(result.lines[0].promotionId).toBe(1);
    // Promo 2 blocked on line 2; promo 1 can re-apply (no self-exclusion)
    expect(result.lines[1].promotionId).toBe(1);
  });

  it('allows the same promotion to apply to multiple independent lines', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 5, discountType: 'PERCENTAGE', discountValue: 10 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100), makeItem(2, 100)] as any);

    const result = await promotionsService.checkout({
      items: [{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }],
    });
    expect(result.lines[0].promotionId).toBe(1);
    expect(result.lines[1].promotionId).toBe(1);
  });

  it('returns null promotionId when no promotions are available', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].promotionId).toBeNull();
    expect(result.lines[0].discountExplanation).toBeNull();
  });

  it('restricts promotion to its target items (does not apply to other items)', async () => {
    // Promo 1 targets only itemId 99 — should not apply to itemId 1
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 5, discountType: 'PERCENTAGE', discountValue: 10, itemIds: [99] }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].promotionId).toBeNull();
  });

  it('promotion with empty itemIds list applies to all items', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, priority: 5, discountType: 'PERCENTAGE', discountValue: 10, itemIds: [] }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].promotionId).toBe(1);
  });
});

// ─── Checkout totals ──────────────────────────────────────────────────────────

describe('Promotions - Checkout Totals', () => {
  it('computes correct order-level totals', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'PERCENTAGE', discountValue: 15 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 2 }] });
    expect(result.totalDiscount).toBe(30);   // 15% of $200
    expect(result.orderTotal).toBe(170);
    expect(result.originalOrderTotal).toBe(200);
  });

  it('aggregates across multiple lines with same promotion', async () => {
    // promo 1 = 10%
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, discountType: 'PERCENTAGE', discountValue: 10 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([
      makeItem(1, 100), makeItem(2, 50),
    ] as any);

    // Line 1: 10% of $200 = $20 off; line 2: 10% of $150 = $15 off
    const result = await promotionsService.checkout({
      items: [{ itemId: 1, quantity: 2 }, { itemId: 2, quantity: 3 }],
    });
    expect(result.lines[0].discountAmount).toBe(20);
    expect(result.lines[1].discountAmount).toBe(15);
    expect(result.totalDiscount).toBe(35);
    expect(result.orderTotal).toBe(315);
  });
});

// ─── Discount explanation format ──────────────────────────────────────────────

describe('Promotions - Discount Explanation', () => {
  it('formats percentage explanation correctly', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, name: 'Summer Sale', discountType: 'PERCENTAGE', discountValue: 20 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].discountExplanation).toBe('Summer Sale: 20% off');
  });

  it('formats fixed amount explanation correctly', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([
      makePromo({ id: 1, name: 'Welcome Discount', discountType: 'FIXED_AMOUNT', discountValue: 15 }),
    ] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([makeItem(1, 100)] as any);

    const result = await promotionsService.checkout({ items: [{ itemId: 1, quantity: 1 }] });
    expect(result.lines[0].discountExplanation).toBe('Welcome Discount: $15.00 off');
  });
});

// ─── Schema validation ────────────────────────────────────────────────────────

describe('Promotions - Schema Validation', () => {
  it('rejects effectiveStart after effectiveEnd', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Bad Range',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      effectiveStart: '2025-12-31T00:00:00.000Z',
      effectiveEnd: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects percentage discount value over 100', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Too Much',
      discountType: 'PERCENTAGE',
      discountValue: 150,
      effectiveStart: '2025-01-01T00:00:00.000Z',
      effectiveEnd: '2025-12-31T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid FIXED_AMOUNT value over 100 (not a percentage)', () => {
    const result = createPromotionSchema.safeParse({
      name: 'Big Discount',
      discountType: 'FIXED_AMOUNT',
      discountValue: 150,
      effectiveStart: '2025-01-01T00:00:00.000Z',
      effectiveEnd: '2025-12-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
