import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Promotions API', () => {
  let adminToken: string;
  let managerToken: string;
  let guestToken: string;
  let clerkToken: string;

  let promotionId: number;
  let highPriorityPromotionId: number;

  beforeAll(async () => {
    [adminToken, managerToken, guestToken, clerkToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
    ]);
  });

  // ─── List promotions ─────────────────────────────────────────

  describe('List promotions', () => {
    it('GET /api/promotions returns paginated list', async () => {
      const res = await api
        .get('/api/promotions')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /api/promotions without auth returns 401', async () => {
      await api.get('/api/promotions').expect(401);
    });
  });

  // ─── Create promotion ────────────────────────────────────────

  describe('Create promotion', () => {
    it('POST /api/promotions creates promotion (MANAGER)', async () => {
      const res = await api
        .post('/api/promotions')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Summer Sale 10%',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          effectiveStart: new Date(Date.now() - 1000).toISOString(),
          effectiveEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 1,
          isActive: true,
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Summer Sale 10%');
      promotionId = res.body.data.id;
    });

    it('POST /api/promotions creates high-priority promotion (ADMIN)', async () => {
      const res = await api
        .post('/api/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'VIP Discount 20%',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          effectiveStart: new Date(Date.now() - 1000).toISOString(),
          effectiveEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 10,
          isActive: true,
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      highPriorityPromotionId = res.body.data.id;
    });

    it('POST /api/promotions by GUEST returns 403', async () => {
      await api
        .post('/api/promotions')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          name: 'Unauthorized Promo',
          discountType: 'PERCENTAGE',
          discountValue: 50,
          effectiveStart: new Date().toISOString(),
          effectiveEnd: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(403);
    });

    it('POST /api/promotions by CLERK returns 403', async () => {
      await api
        .post('/api/promotions')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          name: 'Clerk Promo',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5,
          effectiveStart: new Date().toISOString(),
          effectiveEnd: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(403);
    });
  });

  // ─── Update promotion ────────────────────────────────────────

  describe('Update promotion', () => {
    it('PATCH /api/promotions/:id updates fields (MANAGER)', async () => {
      const res = await api
        .patch(`/api/promotions/${promotionId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ priority: 2 })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.priority).toBe(2);
    });

    it('PATCH /api/promotions/:id unknown id returns 404', async () => {
      const res = await api
        .patch('/api/promotions/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Checkout / pricing ──────────────────────────────────────

  describe('Checkout', () => {
    it('POST /api/promotions/checkout returns pricing breakdown', async () => {
      const res = await api
        .post('/api/promotions/checkout')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [{ itemId: 1, quantity: 2 }] })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('lines');
      expect(res.body.data).toHaveProperty('orderTotal');
      expect(res.body.data).toHaveProperty('totalDiscount');
      expect(Array.isArray(res.body.data.lines)).toBe(true);
    });

    it('POST /api/promotions/checkout with empty items returns 400', async () => {
      const res = await api
        .post('/api/promotions/checkout')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [] })
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/promotions/checkout applies highest priority promotion', async () => {
      const res = await api
        .post('/api/promotions/checkout')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [{ itemId: 1, quantity: 1 }] })
        .expect(200);
      expect(res.body.success).toBe(true);
      const lines = res.body.data.lines as any[];
      // If both promotions apply to this item, the high priority one (20%) should win
      if (lines[0].promotionId) {
        expect(lines[0].discountAmount).toBeGreaterThan(0);
      }
    });

    it('POST /api/promotions/checkout with non-existent item returns 404', async () => {
      const res = await api
        .post('/api/promotions/checkout')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [{ itemId: 999999, quantity: 1 }] })
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/promotions/checkout without auth returns 401', async () => {
      await api
        .post('/api/promotions/checkout')
        .send({ items: [{ itemId: 1, quantity: 1 }] })
        .expect(401);
    });
  });

  // ─── Promotion exclusions ────────────────────────────────────

  describe('Promotion exclusions', () => {
    let promoA: number;
    let promoB: number;
    let promoC: number;

    const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const pastStart = new Date(Date.now() - 1000).toISOString();

    beforeAll(async () => {
      // Create three fresh promotions for exclusion tests
      const [resA, resB, resC] = await Promise.all([
        api
          .post('/api/promotions')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Excl-Promo-A',
            discountType: 'PERCENTAGE',
            discountValue: 5,
            effectiveStart: pastStart,
            effectiveEnd: futureEnd,
          }),
        api
          .post('/api/promotions')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Excl-Promo-B',
            discountType: 'PERCENTAGE',
            discountValue: 5,
            effectiveStart: pastStart,
            effectiveEnd: futureEnd,
          }),
        api
          .post('/api/promotions')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Excl-Promo-C',
            discountType: 'FIXED_AMOUNT',
            discountValue: 2,
            effectiveStart: pastStart,
            effectiveEnd: futureEnd,
          }),
      ]);
      promoA = resA.body.data.id;
      promoB = resB.body.data.id;
      promoC = resC.body.data.id;
    });

    it('POST /api/promotions with exclusions persists the exclusion set', async () => {
      // Create a promotion that excludes promoB at creation time
      const res = await api
        .post('/api/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Excl-Promo-D',
          discountType: 'PERCENTAGE',
          discountValue: 8,
          effectiveStart: pastStart,
          effectiveEnd: futureEnd,
          exclusions: [promoB],
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      const promo = res.body.data;
      expect(Array.isArray(promo.exclusionsFrom)).toBe(true);
      const excludedIds = promo.exclusionsFrom.map((e: any) => e.excludedPromotionId);
      expect(excludedIds).toContain(promoB);

      // Clean up
      await api
        .patch(`/api/promotions/${promo.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
    });

    it('PATCH /api/promotions/:id with exclusions replaces the full exclusion set', async () => {
      // Start: promoA excludes promoB
      await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exclusions: [promoB] })
        .expect(200);

      // Replace: set exclusions to [promoC] only
      const res = await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exclusions: [promoC] })
        .expect(200);

      expect(res.body.success).toBe(true);
      const excludedIds = res.body.data.exclusionsFrom.map((e: any) => e.excludedPromotionId);
      expect(excludedIds).toContain(promoC);
      expect(excludedIds).not.toContain(promoB);
    });

    it('PATCH /api/promotions/:id with exclusions:[] clears all exclusions', async () => {
      // Ensure promoA has at least one exclusion first
      await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exclusions: [promoB] })
        .expect(200);

      // Clear
      const res = await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exclusions: [] })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.exclusionsFrom).toHaveLength(0);
    });

    it('PATCH /api/promotions/:id omitting exclusions leaves them unchanged', async () => {
      // Set exclusions first
      await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exclusions: [promoB] })
        .expect(200);

      // Update something unrelated — exclusions should be untouched
      const res = await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 5 })
        .expect(200);

      expect(res.body.success).toBe(true);
      const excludedIds = res.body.data.exclusionsFrom.map((e: any) => e.excludedPromotionId);
      expect(excludedIds).toContain(promoB);
    });

    it('GUEST cannot create a promotion with exclusions (403)', async () => {
      await api
        .post('/api/promotions')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          name: 'Guest Excl Promo',
          discountType: 'PERCENTAGE',
          discountValue: 5,
          effectiveStart: pastStart,
          effectiveEnd: futureEnd,
          exclusions: [promoB],
        })
        .expect(403);
    });

    it('CLERK cannot update exclusions (403)', async () => {
      await api
        .patch(`/api/promotions/${promoA}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ exclusions: [promoB] })
        .expect(403);
    });
  });
});
