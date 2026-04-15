import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    promotion: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    promotionItem: { createMany: vi.fn() },
    promotionExclusion: { createMany: vi.fn(), deleteMany: vi.fn() },
    item: { findMany: vi.fn() },
    appliedPromotion: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/prisma';
import { promotionsService } from '@/modules/promotions/promotions.service';

const txMock = {
  promotion: { create: vi.fn(), update: vi.fn() },
  promotionItem: { createMany: vi.fn() },
  promotionExclusion: { createMany: vi.fn(), deleteMany: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMock));
  vi.mocked(prisma.appliedPromotion.create).mockResolvedValue({} as any);
  txMock.promotion.create.mockResolvedValue({ id: 10, name: 'Test Promo' });
  txMock.promotion.update.mockResolvedValue({ id: 10 });
  txMock.promotionItem.createMany.mockResolvedValue({ count: 0 });
  txMock.promotionExclusion.createMany.mockResolvedValue({ count: 0 });
  txMock.promotionExclusion.deleteMany.mockResolvedValue({ count: 0 });
});

// ─── listPromotions ───────────────────────────────────────────────────────────

describe('PromotionsService - listPromotions', () => {
  it('returns paginated list of all promotions', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.promotion.count).mockResolvedValue(1);

    const result = await promotionsService.listPromotions(undefined, 1, 10);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it('filters by isActive=true when query param is "true"', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.promotion.count).mockResolvedValue(0);

    await promotionsService.listPromotions('true', 1, 10);

    const call = vi.mocked(prisma.promotion.findMany).mock.calls[0][0] as any;
    expect(call.where.isActive).toBe(true);
  });

  it('filters by isActive=false when query param is "false"', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.promotion.count).mockResolvedValue(0);

    await promotionsService.listPromotions('false', 1, 10);

    const call = vi.mocked(prisma.promotion.findMany).mock.calls[0][0] as any;
    expect(call.where.isActive).toBe(false);
  });

  it('does not apply isActive filter when param is undefined', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.promotion.count).mockResolvedValue(0);

    await promotionsService.listPromotions(undefined, 1, 10);

    const call = vi.mocked(prisma.promotion.findMany).mock.calls[0][0] as any;
    expect(call.where.isActive).toBeUndefined();
  });
});

// ─── createPromotion ──────────────────────────────────────────────────────────

describe('PromotionsService - createPromotion', () => {
  const baseInput = {
    name: 'Summer Sale',
    discountType: 'PERCENTAGE' as const,
    discountValue: 10,
    effectiveStart: '2025-06-01T00:00:00.000Z',
    effectiveEnd: '2025-08-31T00:00:00.000Z',
  };

  it('creates a promotion via transaction and re-fetches with relations', async () => {
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 10, name: 'Summer Sale', items: [], exclusionsFrom: [],
    } as any);

    const result = await promotionsService.createPromotion(baseInput);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txMock.promotion.create).toHaveBeenCalledOnce();
    expect(result.id).toBe(10);
  });

  it('creates promotion items when itemIds are provided', async () => {
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 10, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.createPromotion({ ...baseInput, itemIds: [1, 2, 3] });

    expect(txMock.promotionItem.createMany).toHaveBeenCalledWith({
      data: [
        { promotionId: 10, itemId: 1 },
        { promotionId: 10, itemId: 2 },
        { promotionId: 10, itemId: 3 },
      ],
    });
  });

  it('creates promotion exclusions when exclusions are provided', async () => {
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 10, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.createPromotion({ ...baseInput, exclusions: [5, 6] });

    expect(txMock.promotionExclusion.createMany).toHaveBeenCalledWith({
      data: [
        { promotionId: 10, excludedPromotionId: 5 },
        { promotionId: 10, excludedPromotionId: 6 },
      ],
    });
  });

  it('does not create items when itemIds is empty', async () => {
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 10, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.createPromotion({ ...baseInput, itemIds: [] });
    expect(txMock.promotionItem.createMany).not.toHaveBeenCalled();
  });

  it('uses provided priority value', async () => {
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 10, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.createPromotion({ ...baseInput, priority: 7 });

    const createCall = txMock.promotion.create.mock.calls[0][0] as any;
    expect(createCall.data.priority).toBe(7);
  });
});

// ─── updatePromotion ──────────────────────────────────────────────────────────

describe('PromotionsService - updatePromotion', () => {
  it('throws NOT_FOUND when promotion does not exist', async () => {
    vi.mocked(prisma.promotion.findUnique).mockResolvedValue(null);

    await expect(promotionsService.updatePromotion(999, { name: 'New' })).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('updates name and re-fetches with relations', async () => {
    vi.mocked(prisma.promotion.findUnique).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 1, name: 'Updated', items: [], exclusionsFrom: [],
    } as any);

    const result = await promotionsService.updatePromotion(1, { name: 'Updated' });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(result.name).toBe('Updated');
  });

  it('replaces exclusions when exclusions array is provided', async () => {
    vi.mocked(prisma.promotion.findUnique).mockResolvedValue({ id: 3 } as any);
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 3, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.updatePromotion(3, { exclusions: [7, 8] });

    expect(txMock.promotionExclusion.deleteMany).toHaveBeenCalledWith({ where: { promotionId: 3 } });
    expect(txMock.promotionExclusion.createMany).toHaveBeenCalledWith({
      data: [
        { promotionId: 3, excludedPromotionId: 7 },
        { promotionId: 3, excludedPromotionId: 8 },
      ],
    });
  });

  it('clears all exclusions when exclusions is empty array', async () => {
    vi.mocked(prisma.promotion.findUnique).mockResolvedValue({ id: 4 } as any);
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 4, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.updatePromotion(4, { exclusions: [] });

    expect(txMock.promotionExclusion.deleteMany).toHaveBeenCalled();
    expect(txMock.promotionExclusion.createMany).not.toHaveBeenCalled();
  });

  it('leaves exclusions unchanged when exclusions is undefined', async () => {
    vi.mocked(prisma.promotion.findUnique).mockResolvedValue({ id: 5 } as any);
    vi.mocked(prisma.promotion.findUniqueOrThrow).mockResolvedValue({
      id: 5, items: [], exclusionsFrom: [],
    } as any);

    await promotionsService.updatePromotion(5, { name: 'Keep exclusions' });

    expect(txMock.promotionExclusion.deleteMany).not.toHaveBeenCalled();
  });
});

// ─── checkout - NOT_FOUND item ────────────────────────────────────────────────

describe('PromotionsService - checkout item validation', () => {
  it('throws NOT_FOUND when an item in the cart does not exist or is inactive', async () => {
    vi.mocked(prisma.promotion.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any); // item not found

    await expect(
      promotionsService.checkout({ items: [{ itemId: 999, quantity: 1 }] })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });
});
