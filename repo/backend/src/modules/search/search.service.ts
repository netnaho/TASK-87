import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { cache } from '../../lib/cache';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class SearchService {
  async searchProducts(params: {
    q?: string;
    category?: string;
    attributeName?: string;
    attributeValue?: string;
    sortBy?: string;
    sortDir?: string;
    page: number;
    pageSize: number;
    userId?: number;
  }) {
    const { q, category, attributeName, attributeValue, sortBy = 'name', sortDir = 'asc', page, pageSize, userId } = params;
    const skip = (page - 1) * pageSize;

    const cacheKey = `search:${q ?? ''}:${category ?? ''}:${attributeName ?? ''}:${attributeValue ?? ''}:${sortBy}:${sortDir}:${page}:${pageSize}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (attributeName && attributeValue) {
      where.productAttributes = {
        some: { attributeName, attributeValue },
      };
    }

    let items: any[];
    let total: number;

    if (q && q.trim().length > 0) {
      // Full-text search with dynamic WHERE and ORDER BY using Prisma.sql fragments
      const sanitized = q.trim().replace(/[+\-><\(\)~*\"@]+/g, ' ').trim();
      const ftQuery = sanitized.split(/\s+/).filter(Boolean).map((w) => `+${w}*`).join(' ');

      // Build WHERE conditions — all values are safely parameterized
      const ftConditions: Prisma.Sql[] = [
        Prisma.sql`i.is_active = 1`,
        Prisma.sql`MATCH(i.name, i.description, i.sku) AGAINST(${ftQuery} IN BOOLEAN MODE)`,
      ];
      if (category) {
        ftConditions.push(Prisma.sql`i.category = ${category}`);
      }
      if (attributeName && attributeValue) {
        ftConditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM product_attributes pa
          WHERE pa.item_id = i.id
            AND pa.attribute_name = ${attributeName}
            AND pa.attribute_value = ${attributeValue}
        )`);
      }
      const ftWhere = Prisma.join(ftConditions, ' AND ');

      // ORDER BY: explicit sortBy overrides relevance default
      const safeDir = sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
      let ftOrder: Prisma.Sql;
      if (params.sortBy === 'price') {
        ftOrder = Prisma.sql`i.unit_price ${safeDir}`;
      } else if (params.sortBy === 'date') {
        ftOrder = Prisma.sql`i.created_at ${safeDir}`;
      } else if (params.sortBy === 'name') {
        ftOrder = Prisma.sql`i.name ${safeDir}`;
      } else {
        // Default for full-text: rank by relevance
        ftOrder = Prisma.sql`relevance_score DESC`;
      }

      const rawItems = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT i.id, i.name, i.sku, i.category, i.description,
               i.is_lot_controlled, i.unit_of_measure, i.unit_price,
               i.is_active, i.created_at, i.updated_at,
               MATCH(i.name, i.description, i.sku) AGAINST(${ftQuery} IN BOOLEAN MODE) AS relevance_score
        FROM items i
        WHERE ${ftWhere}
        ORDER BY ${ftOrder}
        LIMIT ${pageSize} OFFSET ${skip}
      `);

      const [countRow] = await prisma.$queryRaw<[{ cnt: bigint }]>(Prisma.sql`
        SELECT COUNT(*) as cnt FROM items i
        WHERE ${ftWhere}
      `);
      total = Number(countRow.cnt);

      // Attach productAttributes
      const ids = rawItems.map((r: any) => r.id);
      const attrs = ids.length > 0
        ? await prisma.productAttribute.findMany({ where: { itemId: { in: ids } } })
        : [];
      const attrMap = new Map<number, any[]>();
      for (const a of attrs) {
        if (!attrMap.has(a.itemId)) attrMap.set(a.itemId, []);
        attrMap.get(a.itemId)!.push(a);
      }
      items = rawItems.map((r: any) => ({
        ...r,
        unitPrice: r.unit_price,
        productAttributes: attrMap.get(r.id) ?? [],
      }));
    } else {
      // No full-text — use Prisma ORM query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderBy: any = {};
      if (sortBy === 'price') orderBy.unitPrice = sortDir;
      else if (sortBy === 'date') orderBy.createdAt = sortDir;
      else orderBy.name = sortDir === 'desc' ? 'desc' : 'asc';

      [items, total] = await Promise.all([
        prisma.item.findMany({
          where,
          skip,
          take: pageSize,
          include: { productAttributes: true },
          orderBy,
        }),
        prisma.item.count({ where }),
      ]);
    }

    // Log search term for suggestions
    if (q && q.trim().length > 0) {
      this.logSearchTerm(q.trim(), total, userId).catch(() => {});
    }

    const result = { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async logSearchTerm(term: string, resultsCount: number, userId?: number) {
    // Save to search log
    await prisma.searchLog.create({
      data: { userId: userId ?? null, queryText: term, resultsCount },
    }).catch(() => {});

    // Upsert suggested term
    await prisma.suggestedTerm.upsert({
      where: { term },
      create: { term, frequency: 1, isTrending: false },
      update: { frequency: { increment: 1 } },
    }).catch(() => {});
  }

  async getSuggestions() {
    const cacheKey = 'search:suggestions';
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;

    const terms = await prisma.suggestedTerm.findMany({
      orderBy: { frequency: 'desc' },
      take: 20,
    });

    cache.set(cacheKey, terms, CACHE_TTL_MS);
    return terms;
  }

  async getTrending() {
    const cacheKey = 'search:trending';
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;

    const terms = await prisma.suggestedTerm.findMany({
      where: { isTrending: true },
      orderBy: { frequency: 'desc' },
      take: 50,
    });

    cache.set(cacheKey, terms, CACHE_TTL_MS);
    return terms;
  }

  async getCategories() {
    const cacheKey = 'search:categories';
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;

    const categories = await prisma.item.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    const result = categories.map((c) => c.category);
    cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  async markTrending(term: string, isTrending: boolean) {
    const existing = await prisma.suggestedTerm.findUnique({ where: { term } });
    if (!existing) {
      throw Object.assign(new Error('Term not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    const updated = await prisma.suggestedTerm.update({
      where: { term },
      data: { isTrending },
    });
    cache.delete('search:trending');
    cache.delete('search:suggestions');
    logger.info({ term, isTrending }, 'Trending status updated');
    return updated;
  }
}

export const searchService = new SearchService();
