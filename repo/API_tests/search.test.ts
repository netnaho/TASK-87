import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, loginAs, demoUsers, createProductAttribute, deleteProductAttribute } from './helpers';

describe('Search API', () => {
  let guestToken: string;
  let clerkToken: string;
  let managerToken: string;
  let adminToken: string;

  // Attribute created for filter tests; cleaned up in afterAll
  let testAttrId: number;

  beforeAll(async () => {
    [guestToken, clerkToken, managerToken, adminToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
    ]);

    // Attach a known attribute to "Bath Towels - White" so attribute-filter tests have real data
    testAttrId = await createProductAttribute('Bath Towels - White', 'material', 'cotton');
  });

  afterAll(async () => {
    await deleteProductAttribute(testAttrId);
  });

  // ─── Product search ───────────────────────────────────────────

  describe('Product search', () => {
    it('GET /api/search/products?q=towel returns matching results', async () => {
      const res = await api
        .get('/api/search/products?q=towel')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('GET /api/search/products?q=nonexistent returns empty results', async () => {
      const res = await api
        .get('/api/search/products?q=nonexistent')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(0);
    });

    it('GET /api/search/products without q returns 400', async () => {
      const res = await api
        .get('/api/search/products')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/search/products?q=t&category=Linens filters by category', async () => {
      const res = await api
        .get('/api/search/products?q=t&category=Linens')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      for (const item of res.body.data.items) {
        expect(item.category).toBe('Linens');
      }
    });
  });

  // ─── Suggestions and trending ─────────────────────────────────

  describe('Suggestions and trending', () => {
    it('GET /api/search/suggestions returns suggested terms', async () => {
      const res = await api
        .get('/api/search/suggestions')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/search/trending returns trending terms', async () => {
      const res = await api
        .get('/api/search/trending')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/search/categories returns category list', async () => {
      const res = await api
        .get('/api/search/categories')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Attribute filter with full-text q ───────────────────────

  describe('q + attributeName + attributeValue filtering', () => {
    it('returns items matching both q and attribute filter', async () => {
      // 'Bath Towels - White' has material=cotton (set in beforeAll)
      const res = await api
        .get('/api/search/products?q=towel&attributeName=material&attributeValue=cotton')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      // Every result must carry the requested attribute
      for (const item of res.body.data.items) {
        const match = item.productAttributes.some(
          (a: any) => a.attributeName === 'material' && a.attributeValue === 'cotton'
        );
        expect(match).toBe(true);
      }
    });

    it('returns empty results when attribute value does not match any item', async () => {
      const res = await api
        .get('/api/search/products?q=towel&attributeName=material&attributeValue=polyester')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(0);
      expect(res.body.data.total).toBe(0);
    });

    it('attribute filter does not cross-contaminate results across different q values', async () => {
      // Searching for 'sheets' with material=cotton should return nothing (only towel has cotton)
      const res = await api
        .get('/api/search/products?q=sheets&attributeName=material&attributeValue=cotton')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.data.items.length).toBe(0);
    });
  });

  // ─── sortBy / sortDir with full-text q ───────────────────────

  describe('q + sortBy + sortDir', () => {
    // q=s matches 6 items (Shampoo Bottles 1.25, Hand Soap 2.5, Bed Sheets 15,
    // Bath Towels 8.5, Pillow Cases 3.75, Light Bulbs 3.25)

    it('q + sortBy=price + sortDir=asc returns items cheapest first', async () => {
      const res = await api
        .get('/api/search/products?q=s&sortBy=price&sortDir=asc')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThan(1);
      // Prices must be non-decreasing
      for (let i = 1; i < items.length; i++) {
        expect(Number(items[i].unitPrice)).toBeGreaterThanOrEqual(Number(items[i - 1].unitPrice));
      }
    });

    it('q + sortBy=price + sortDir=desc returns items most expensive first', async () => {
      const res = await api
        .get('/api/search/products?q=s&sortBy=price&sortDir=desc')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThan(1);
      // Prices must be non-increasing
      for (let i = 1; i < items.length; i++) {
        expect(Number(items[i].unitPrice)).toBeLessThanOrEqual(Number(items[i - 1].unitPrice));
      }
    });

    it('q + sortBy=name + sortDir=asc returns items alphabetically', async () => {
      const res = await api
        .get('/api/search/products?q=s&sortBy=name&sortDir=asc')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const items = res.body.data.items;
      expect(items.length).toBeGreaterThan(1);
      for (let i = 1; i < items.length; i++) {
        expect(items[i].name.localeCompare(items[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });

    it('q without sortBy defaults to relevance order (no crash, valid shape)', async () => {
      const res = await api
        .get('/api/search/products?q=towel')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('pageSize');
      expect(res.body.data).toHaveProperty('totalPages');
    });
  });

  // ─── Authentication ───────────────────────────────────────────

  describe('Authentication', () => {
    it('GET /api/search/products requires authentication (401)', async () => {
      await api
        .get('/api/search/products?q=towel')
        .expect(401);
    });
  });

  // ─── Trending admin toggle — RBAC ────────────────────────────

  describe('Trending admin toggle auth checks', () => {
    it('GET /api/search/trending returns 403 for GUEST (requires MANAGER or ADMIN)', async () => {
      await api
        .get('/api/search/trending')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('GET /api/search/trending returns 403 for INVENTORY_CLERK', async () => {
      await api
        .get('/api/search/trending')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(403);
    });

    it('GET /api/search/trending succeeds for MANAGER', async () => {
      const res = await api
        .get('/api/search/trending')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/search/trending succeeds for ADMIN', async () => {
      const res = await api
        .get('/api/search/trending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('PATCH /api/search/trending/:term returns 403 for MANAGER (requires ADMIN)', async () => {
      await api
        .patch('/api/search/trending/towel')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ isTrending: true })
        .expect(403);
    });

    it('PATCH /api/search/trending/:term returns 403 for GUEST', async () => {
      await api
        .patch('/api/search/trending/towel')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ isTrending: true })
        .expect(403);
    });

    it('PATCH /api/search/trending/:term returns 401 without auth', async () => {
      await api
        .patch('/api/search/trending/towel')
        .send({ isTrending: true })
        .expect(401);
    });

    it('PATCH /api/search/trending/:term succeeds for ADMIN and reflects toggle', async () => {
      const res = await api
        .patch('/api/search/trending/towel')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isTrending: true })
        .expect(200);
      expect(res.body.success).toBe(true);

      // Toggle back off to leave state clean
      await api
        .patch('/api/search/trending/towel')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isTrending: false })
        .expect(200);
    });
  });
});
