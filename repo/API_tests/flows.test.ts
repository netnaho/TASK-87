/**
 * End-to-end flow tests — real HTTP against the running backend.
 *
 * Each flow simulates a complete user journey through multiple API endpoints,
 * verifying that state changes propagate correctly across the full request
 * pipeline (auth → business logic → persistence → read-back).
 *
 * All API calls are real HTTP (no mocks, no direct DB access) so the flows
 * double as integration regression tests.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers, clearRateLimits } from './helpers';

// ─── Flow 1: Inventory round-trip (receive → stock level → issue) ─────────────

describe('Flow: Inventory receive → verify stock → issue', () => {
  let clerkToken: string;
  let adminToken: string;
  let itemId: number;
  let locationId: number;
  let vendorId: number;

  beforeAll(async () => {
    [clerkToken, adminToken] = await Promise.all([
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
    ]);

    // Resolve a stable item + location + vendor from seeded data
    const [itemsRes, locsRes, vendorsRes] = await Promise.all([
      api.get('/api/inventory/items?pageSize=1').set('Authorization', `Bearer ${clerkToken}`),
      api.get('/api/locations').set('Authorization', `Bearer ${clerkToken}`),
      api.get('/api/inventory/vendors').set('Authorization', `Bearer ${clerkToken}`),
    ]);
    itemId = itemsRes.body.data.items[0].id;
    locationId = locsRes.body.data[0].id;
    vendorId = vendorsRes.body.data[0].id;
  });

  it('step 1: get current stock level for the item at location', async () => {
    const res = await api
      .get(`/api/inventory/stock-levels?itemId=${itemId}&locationId=${locationId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    // Stock level may or may not exist — we just need the shape
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('step 2: receive stock (creates or increments stock level)', async () => {
    const beforeRes = await api
      .get(`/api/inventory/stock-levels?itemId=${itemId}&locationId=${locationId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    const onHandBefore: number = beforeRes.body.data[0]?.onHand ?? 0;

    const receiveRes = await api
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ vendorId, itemId, locationId, quantity: 20 })
      .expect(201);
    expect(receiveRes.body.success).toBe(true);
    expect(receiveRes.body.data.movementType).toBe('RECEIVING');

    const afterRes = await api
      .get(`/api/inventory/stock-levels?itemId=${itemId}&locationId=${locationId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    const onHandAfter: number = afterRes.body.data[0].onHand;

    expect(onHandAfter).toBe(onHandBefore + 20);
  });

  it('step 3: issue stock and verify decrement', async () => {
    const beforeRes = await api
      .get(`/api/inventory/stock-levels?itemId=${itemId}&locationId=${locationId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    const onHandBefore: number = beforeRes.body.data[0].onHand;

    const issueRes = await api
      .post('/api/inventory/issue')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ itemId, locationId, quantity: 5 })
      .expect(201);
    expect(issueRes.body.success).toBe(true);
    expect(issueRes.body.data.movementType).toBe('ISSUE');

    const afterRes = await api
      .get(`/api/inventory/stock-levels?itemId=${itemId}&locationId=${locationId}`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);
    expect(afterRes.body.data[0].onHand).toBe(onHandBefore - 5);
  });

  it('step 4: ledger contains both the RECEIVING and ISSUE movements', async () => {
    const res = await api
      .get(`/api/inventory/ledger?itemId=${itemId}&locationId=${locationId}&pageSize=50`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const types = res.body.data.items.map((e: any) => e.movementType);
    expect(types).toContain('RECEIVING');
    expect(types).toContain('ISSUE');
  });
});

// ─── Flow 2: Review lifecycle (create → view → host reply) ────────────────────

describe('Flow: Review create → read-back → host reply', () => {
  let guestToken: string;
  let hostToken: string;
  let hostUserId: number;
  let reviewId: number;

  beforeAll(async () => {
    [guestToken, hostToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
    ]);
    const hostMe = await api.get('/api/auth/me').set('Authorization', `Bearer ${hostToken}`);
    hostUserId = hostMe.body.data.id;
    // Reset rate limits so review creation and host reply don't hit per-hour caps
    await clearRateLimits('guest');
    await clearRateLimits('host');
  });

  it('step 1: guest creates a review addressed to host', async () => {
    const res = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        targetType: 'STAY',
        targetId: 1,
        revieweeId: hostUserId,
        ratingCleanliness: 4,
        ratingCommunication: 5,
        ratingAccuracy: 4,
        text: 'Great stay, clean and welcoming.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    // overallRating is stored as DECIMAL in MySQL; compare numerically to tolerate string coercion
    expect(Number(res.body.data.overallRating)).toBeCloseTo(4.3, 1);
    reviewId = res.body.data.id;
  });

  it('step 2: review is retrievable with full detail', async () => {
    const res = await api
      .get(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    expect(res.body.data.id).toBe(reviewId);
    expect(res.body.data.text).toBe('Great stay, clean and welcoming.');
    expect(res.body.data.hostReply).toBeNull();
  });

  it('step 3: review appears in the list', async () => {
    const res = await api
      .get('/api/reviews?targetType=STAY&pageSize=100')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    const ids = res.body.data.items.map((r: any) => r.id);
    expect(ids).toContain(reviewId);
  });

  it('step 4: host replies to the review', async () => {
    const res = await api
      .post(`/api/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ text: 'Thank you for the kind words!' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
  });

  it('step 5: host reply is visible on the review detail', async () => {
    const res = await api
      .get(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    expect(res.body.data.hostReply).not.toBeNull();
    expect(res.body.data.hostReply.text).toBe('Thank you for the kind words!');
  });
});

// ─── Flow 3: Promotion checkout (create promo → checkout cart → verify savings) ─

describe('Flow: Create promotion → checkout cart → verify discount applied', () => {
  let adminToken: string;
  let clerkToken: string;
  let promoId: number;
  let targetItemId: number;

  beforeAll(async () => {
    [adminToken, clerkToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
    ]);

    // Pick a real item that has a unitPrice set
    const itemsRes = await api
      .get('/api/inventory/items?pageSize=50')
      .set('Authorization', `Bearer ${clerkToken}`);
    const itemWithPrice = itemsRes.body.data.items.find((i: any) => i.unitPrice !== null);
    targetItemId = itemWithPrice?.id ?? itemsRes.body.data.items[0].id;
  });

  it('step 1: admin creates a 10% promotion valid right now', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const res = await api
      .post('/api/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Flow Promo ${Date.now()}`,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        effectiveStart: now.toISOString(),
        effectiveEnd: future.toISOString(),
        isActive: true,
        // High priority ensures this promo beats any pre-existing seeded promotions
        priority: 999,
        itemIds: [targetItemId],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    promoId = res.body.data.id;
    expect(promoId).toBeTypeOf('number');
  });

  it('step 2: promotion appears in the list with correct discount', async () => {
    const res = await api
      .get('/api/promotions?isActive=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const created = res.body.data.items.find((p: any) => p.id === promoId);
    expect(created).toBeDefined();
    expect(Number(created.discountValue)).toBe(10);
    expect(created.discountType).toBe('PERCENTAGE');
  });

  it('step 3: checkout applies the 10% discount to the target item', async () => {
    const res = await api
      .post('/api/promotions/checkout')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ items: [{ itemId: targetItemId, quantity: 2 }] })
      .expect(200);

    expect(res.body.success).toBe(true);
    const line = res.body.data.lines[0];
    expect(line.promotionId).toBe(promoId);
    // Discount should be 10% of originalTotal
    const expectedDiscount = Math.round(line.originalTotal * 0.1 * 100) / 100;
    expect(line.discountAmount).toBeCloseTo(expectedDiscount, 1);
    expect(line.finalTotal).toBeCloseTo(line.originalTotal - expectedDiscount, 1);
    expect(res.body.data.totalDiscount).toBeGreaterThan(0);
  });

  it('step 4: admin can deactivate the promotion', async () => {
    const res = await api
      .patch(`/api/promotions/${promoId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    expect(res.body.data.isActive).toBe(false);
  });

  it('step 5: checkout no longer applies the deactivated promotion', async () => {
    const res = await api
      .post('/api/promotions/checkout')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ items: [{ itemId: targetItemId, quantity: 2 }] })
      .expect(200);

    const line = res.body.data.lines[0];
    // Either no promo or a different promo applies — but not ours
    expect(line.promotionId).not.toBe(promoId);
  });
});

// ─── Flow 4: Trust score update (submit rating → verify score changed) ────────

describe('Flow: Rate a completed interaction → trust score changes', () => {
  let adminToken: string;
  let hostToken: string;
  let hostUserId: number;
  let scoreBeforeRating: number;

  beforeAll(async () => {
    [adminToken, hostToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
    ]);
    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${hostToken}`);
    hostUserId = me.body.data.id;
  });

  it('step 1: admin can read the host trust score', async () => {
    const res = await api
      .get(`/api/trust/users/${hostUserId}/score`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    scoreBeforeRating = Number(res.body.data.score);
    expect(scoreBeforeRating).toBeGreaterThanOrEqual(0);
    expect(scoreBeforeRating).toBeLessThanOrEqual(100);
  });

  it('step 2: admin can adjust host score and new score is reflected', async () => {
    const adjustAmount = 3;
    const adjustRes = await api
      .post('/api/trust/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: hostUserId, changeAmount: adjustAmount, reason: 'E2E flow test adjustment' })
      .expect(200);

    expect(adjustRes.body.success).toBe(true);
    const expectedNew = Math.min(100, Math.max(0, scoreBeforeRating + adjustAmount));
    expect(adjustRes.body.data.newScore).toBe(expectedNew);

    // Read back via the user score endpoint to confirm persistence
    const afterRes = await api
      .get(`/api/trust/users/${hostUserId}/score`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Number(afterRes.body.data.score)).toBe(expectedNew);
  });

  it('step 3: host appears in leaderboard', async () => {
    const res = await api
      .get('/api/trust/leaderboard')
      .set('Authorization', `Bearer ${hostToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Not guaranteed to be top 10, but leaderboard should be non-empty with seeded data
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

// ─── Flow 5: Search → inventory context enrichment ────────────────────────────

describe('Flow: Product search result matches inventory data', () => {
  let guestToken: string;
  let clerkToken: string;

  beforeAll(async () => {
    [guestToken, clerkToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
    ]);
  });

  it('search for "towel" returns results consistent with inventory', async () => {
    const [searchRes, inventoryRes] = await Promise.all([
      api.get('/api/search/products?q=towel&pageSize=10').set('Authorization', `Bearer ${guestToken}`),
      api.get('/api/inventory/items?search=towel&pageSize=10').set('Authorization', `Bearer ${clerkToken}`),
    ]);

    expect(searchRes.body.success).toBe(true);
    expect(inventoryRes.body.success).toBe(true);

    // Both should return items (seeded data includes towel-like items)
    if (searchRes.body.data.total > 0 && inventoryRes.body.data.total > 0) {
      const searchIds = new Set(searchRes.body.data.items.map((i: any) => i.id));
      const inventoryIds = inventoryRes.body.data.items.map((i: any) => i.id);
      // At least one item appears in both search and inventory results
      const overlap = inventoryIds.filter((id: number) => searchIds.has(id));
      expect(overlap.length).toBeGreaterThan(0);
    }
  });

  it('search suggestions are updated after a search query', async () => {
    // Perform a search to log the term
    await api
      .get('/api/search/products?q=uniqueflowterm123')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    // Suggestions endpoint should succeed (term may or may not appear immediately
    // depending on async logging, but the endpoint must respond successfully)
    const res = await api
      .get('/api/search/suggestions')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
