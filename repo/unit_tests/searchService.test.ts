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

vi.mock('@/lib/cache', () => {
  const store = new Map<string, any>();
  return {
    cache: {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn((k: string, v: any) => store.set(k, v)),
      delete: vi.fn((k: string) => store.delete(k)),
    },
    _store: store,
  };
});

import prisma from '@/lib/prisma';
import { cache } from '@/lib/cache';
import { searchService } from '@/modules/search/search.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cache.get).mockReturnValue(null);
  vi.mocked(prisma.searchLog.create).mockResolvedValue({} as any);
  vi.mocked(prisma.suggestedTerm.upsert).mockResolvedValue({} as any);
});

// ─── searchProducts (ORM path, no query string) ───────────────────────────────

describe('SearchService - searchProducts (no query)', () => {
  it('returns paginated items without full-text search when q is empty', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([{ id: 1, name: 'Towel' }] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(1);

    const result = await searchService.searchProducts({ page: 1, pageSize: 10 });

    expect(prisma.item.findMany).toHaveBeenCalledOnce();
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  it('applies category filter when provided', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await searchService.searchProducts({ category: 'Linen', page: 1, pageSize: 10 });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.where.category).toBe('Linen');
  });

  it('applies attribute filter when attributeName and attributeValue are provided', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await searchService.searchProducts({
      attributeName: 'color', attributeValue: 'white',
      page: 1, pageSize: 10,
    });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.where.productAttributes).toBeDefined();
  });

  it('sorts by price when sortBy=price', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await searchService.searchProducts({ sortBy: 'price', sortDir: 'desc', page: 1, pageSize: 10 });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.orderBy).toHaveProperty('unitPrice');
  });

  it('sorts by date when sortBy=date', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await searchService.searchProducts({ sortBy: 'date', sortDir: 'asc', page: 1, pageSize: 10 });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.orderBy).toHaveProperty('createdAt');
  });

  it('returns cached result on second call with same params', async () => {
    const fakeResult = { items: [{ id: 1 }], total: 1, page: 1, pageSize: 10, totalPages: 1 };
    vi.mocked(cache.get).mockReturnValue(fakeResult);

    const result = await searchService.searchProducts({ page: 1, pageSize: 10 });

    expect(prisma.item.findMany).not.toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('stores result in cache after DB fetch', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(1);

    await searchService.searchProducts({ page: 1, pageSize: 5 });

    expect(cache.set).toHaveBeenCalledOnce();
  });

  it('does not log search term when q is empty', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await searchService.searchProducts({ page: 1, pageSize: 10 });

    expect(prisma.searchLog.create).not.toHaveBeenCalled();
  });
});

// ─── getSuggestions ───────────────────────────────────────────────────────────

describe('SearchService - getSuggestions', () => {
  it('returns terms from DB when cache is cold', async () => {
    vi.mocked(prisma.suggestedTerm.findMany).mockResolvedValue([
      { id: 1, term: 'towel', frequency: 5 },
    ] as any);

    const result = await searchService.getSuggestions();

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe('towel');
  });

  it('returns cached result when cache is warm', async () => {
    const cached = [{ id: 1, term: 'cached' }];
    vi.mocked(cache.get).mockReturnValue(cached);

    const result = await searchService.getSuggestions();

    expect(prisma.suggestedTerm.findMany).not.toHaveBeenCalled();
    expect(result).toBe(cached);
  });
});

// ─── getTrending ──────────────────────────────────────────────────────────────

describe('SearchService - getTrending', () => {
  it('returns trending terms from DB when cache is cold', async () => {
    vi.mocked(prisma.suggestedTerm.findMany).mockResolvedValue([
      { id: 2, term: 'towel', isTrending: true, frequency: 100 },
    ] as any);

    const result = await searchService.getTrending();

    expect(result).toHaveLength(1);
    const call = vi.mocked(prisma.suggestedTerm.findMany).mock.calls[0][0] as any;
    expect(call.where.isTrending).toBe(true);
  });

  it('returns cached result without DB hit', async () => {
    const cached = [{ term: 'trend', isTrending: true }];
    vi.mocked(cache.get).mockReturnValue(cached);

    await searchService.getTrending();
    expect(prisma.suggestedTerm.findMany).not.toHaveBeenCalled();
  });
});

// ─── getCategories ────────────────────────────────────────────────────────────

describe('SearchService - getCategories', () => {
  it('returns distinct category strings', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([
      { category: 'Linen' }, { category: 'Supplies' },
    ] as any);

    const result = await searchService.getCategories();

    expect(result).toEqual(['Linen', 'Supplies']);
  });

  it('returns cached categories without DB hit', async () => {
    vi.mocked(cache.get).mockReturnValue(['Cached']);

    const result = await searchService.getCategories();
    expect(prisma.item.findMany).not.toHaveBeenCalled();
    expect(result).toEqual(['Cached']);
  });
});

// ─── markTrending ─────────────────────────────────────────────────────────────

describe('SearchService - markTrending', () => {
  it('throws NOT_FOUND when term does not exist', async () => {
    vi.mocked(prisma.suggestedTerm.findUnique).mockResolvedValue(null);

    await expect(searchService.markTrending('ghost', true)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('updates isTrending and invalidates cache', async () => {
    vi.mocked(prisma.suggestedTerm.findUnique).mockResolvedValue(
      { id: 1, term: 'towel', isTrending: false } as any
    );
    vi.mocked(prisma.suggestedTerm.update).mockResolvedValue(
      { id: 1, term: 'towel', isTrending: true } as any
    );

    const result = await searchService.markTrending('towel', true);

    expect(prisma.suggestedTerm.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { term: 'towel' }, data: { isTrending: true } })
    );
    expect(cache.delete).toHaveBeenCalledWith('search:trending');
    expect(cache.delete).toHaveBeenCalledWith('search:suggestions');
    expect(result.isTrending).toBe(true);
  });

  it('can mark a term as not trending', async () => {
    vi.mocked(prisma.suggestedTerm.findUnique).mockResolvedValue(
      { id: 2, term: 'old', isTrending: true } as any
    );
    vi.mocked(prisma.suggestedTerm.update).mockResolvedValue(
      { id: 2, term: 'old', isTrending: false } as any
    );

    const result = await searchService.markTrending('old', false);
    expect(result.isTrending).toBe(false);
  });
});
