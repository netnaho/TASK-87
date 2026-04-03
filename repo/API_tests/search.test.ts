import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Search API', () => {
  let guestToken: string;
  let clerkToken: string;
  let managerToken: string;

  beforeAll(async () => {
    [guestToken, clerkToken, managerToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
    ]);
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

  // ─── Authentication ───────────────────────────────────────────

  describe('Authentication', () => {
    it('GET /api/search/products requires authentication (401)', async () => {
      await api
        .get('/api/search/products?q=towel')
        .expect(401);
    });
  });
});
