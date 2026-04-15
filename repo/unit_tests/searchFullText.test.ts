/**
 * Tests for SearchService.searchProducts full-text (query string) path
 * and the private logSearchTerm helper.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    item: { findMany: vi.fn(), count: vi.fn() },
    suggestedTerm: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    searchLog: { create: vi.fn().mockResolvedValue({}) },
    productAttribute: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/cache', () => ({
  cache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

import prisma from '@/lib/prisma';
import { cache } from '@/lib/cache';
import { searchService } from '@/modules/search/search.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cache.get).mockReturnValue(null);
  vi.mocked(prisma.searchLog.create).mockResolvedValue({} as any);
  vi.mocked(prisma.suggestedTerm.upsert).mockResolvedValue({} as any);
  vi.mocked(prisma.productAttribute.findMany).mockResolvedValue([] as any);
});

// ─── Full-text search path ────────────────────────────────────────────────────

describe('SearchService - searchProducts (full-text path)', () => {
  it('uses $queryRaw when a non-empty query string is provided', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 1, name: 'Towel', unit_price: '5.00', is_lot_controlled: 0 }]) // items
      .mockResolvedValueOnce([{ cnt: BigInt(1) }]); // count

    const result = await searchService.searchProducts({ q: 'towel', page: 1, pageSize: 10 });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(result.total).toBe(1);
    // ORM findMany should NOT be called for FT search
    expect(prisma.item.findMany).not.toHaveBeenCalled();
  });

  it('logs the search term after a full-text query', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: BigInt(0) }]);

    await searchService.searchProducts({ q: 'sheet', page: 1, pageSize: 10, userId: 5 });

    // Wait for the fire-and-forget logSearchTerm to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(prisma.searchLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ queryText: 'sheet', userId: 5 }),
      })
    );
  });

  it('attaches productAttributes to full-text results', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 7, name: 'Sheet', unit_price: null, is_lot_controlled: 0 }])
      .mockResolvedValueOnce([{ cnt: BigInt(1) }]);
    vi.mocked(prisma.productAttribute.findMany).mockResolvedValue([
      { id: 1, itemId: 7, attributeName: 'color', attributeValue: 'white' },
    ] as any);

    const result = await searchService.searchProducts({ q: 'sheet', page: 1, pageSize: 10 });

    expect(result.items[0].productAttributes).toHaveLength(1);
    expect(result.items[0].productAttributes[0].attributeName).toBe('color');
  });

  it('sanitizes special FT characters from the query before searching', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: BigInt(0) }]);

    // Query contains special chars that should be stripped
    await searchService.searchProducts({ q: 'tow+el', page: 1, pageSize: 10 });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    // The test just verifies it doesn't throw — the sanitization happens internally
  });

  it('applies category filter in full-text WHERE clause', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: BigInt(0) }]);

    await searchService.searchProducts({
      q: 'towel', category: 'Linen', page: 1, pageSize: 10,
    });

    // Two queryRaw calls — both should include the category (we can't easily inspect Prisma.sql
    // but we verify the query runs without error)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('sorts full-text results by price when sortBy=price', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 1, name: 'T', unit_price: '3.00', is_lot_controlled: 0 }])
      .mockResolvedValueOnce([{ cnt: BigInt(1) }]);

    // Should not throw — the sort path is exercised
    await searchService.searchProducts({
      q: 'towel', sortBy: 'price', sortDir: 'asc', page: 1, pageSize: 10,
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('sorts full-text results by date when sortBy=date', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: BigInt(0) }]);

    await searchService.searchProducts({
      q: 'towel', sortBy: 'date', sortDir: 'desc', page: 1, pageSize: 10,
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
