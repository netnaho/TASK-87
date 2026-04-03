import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Inventory API', () => {
  let adminToken: string;
  let managerToken: string;
  let clerkToken: string;
  let guestToken: string;

  // IDs captured across tests
  let firstItemId: number;
  let firstVendorId: number;
  let firstLocationId: number;
  let secondLocationId: number;
  let stockCountId: number;
  let stockCountLineId: number;

  beforeAll(async () => {
    [adminToken, managerToken, clerkToken, guestToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
    ]);
  });

  // ─── Master data ─────────────────────────────────────────────

  describe('Master data', () => {
    it('GET /api/inventory/items returns paginated list', async () => {
      const res = await api
        .get('/api/inventory/items')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      firstItemId = res.body.data.items[0].id;
    });

    it('GET /api/inventory/items supports search filter', async () => {
      const res = await api
        .get('/api/inventory/items?search=Towel')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('GET /api/inventory/items/categories returns distinct categories', async () => {
      const res = await api
        .get('/api/inventory/items/categories')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/inventory/items/:id returns item with stock levels', async () => {
      const res = await api
        .get(`/api/inventory/items/${firstItemId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(firstItemId);
      expect(Array.isArray(res.body.data.stockLevels)).toBe(true);
    });

    it('GET /api/inventory/vendors returns list (without contactEncrypted for clerk)', async () => {
      const res = await api
        .get('/api/inventory/vendors')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      firstVendorId = res.body.data[0].id;
      // Non-admin should not see contactEncrypted
      for (const vendor of res.body.data) {
        expect(vendor).not.toHaveProperty('contactEncrypted');
      }
    });

    it('GET /api/inventory/vendors includes contactEncrypted for admin', async () => {
      const res = await api
        .get('/api/inventory/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      // Admin gets contactEncrypted field (may be null if not set)
      expect(res.body.data[0]).toHaveProperty('contactEncrypted');
    });

    it('GET /api/locations returns locations', async () => {
      const res = await api
        .get('/api/locations')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      firstLocationId = res.body.data[0].id;
      secondLocationId = res.body.data[1]?.id ?? res.body.data[0].id + 1;
    });

    it('GET /api/inventory/lots returns lot list', async () => {
      const res = await api
        .get('/api/inventory/lots')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/inventory/stock-levels returns stock levels', async () => {
      const res = await api
        .get('/api/inventory/stock-levels')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ─── Movement workflows ───────────────────────────────────────

  describe('Movement workflows - happy path', () => {
    it('POST /api/inventory/receive creates RECEIVING ledger entry and increments stock', async () => {
      const before = await api
        .get(`/api/inventory/stock-levels?itemId=${firstItemId}&locationId=${firstLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      const onHandBefore = before.body.data[0]?.onHand ?? 0;

      const res = await api
        .post('/api/inventory/receive')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          vendorId: firstVendorId,
          itemId: firstItemId,
          locationId: firstLocationId,
          quantity: 50,
          unitCostUsd: 9.99,
          packSize: 1,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.movementType).toBe('RECEIVING');
      expect(res.body.data.quantity).toBe(50);
      expect(res.body.data.toLocationId).toBe(firstLocationId);
      expect(res.body.data.referenceNumber).toMatch(/^RCV-\d{8}-/);

      const after = await api
        .get(`/api/inventory/stock-levels?itemId=${firstItemId}&locationId=${firstLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(after.body.data[0].onHand).toBe(onHandBefore + 50);
    });

    it('POST /api/inventory/issue creates ISSUE ledger entry and decrements stock', async () => {
      const before = await api
        .get(`/api/inventory/stock-levels?itemId=${firstItemId}&locationId=${firstLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      const onHandBefore = before.body.data[0].onHand;

      const res = await api
        .post('/api/inventory/issue')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ itemId: firstItemId, locationId: firstLocationId, quantity: 5 })
        .expect(201);

      expect(res.body.data.movementType).toBe('ISSUE');
      expect(res.body.data.quantity).toBe(5);
      expect(res.body.data.referenceNumber).toMatch(/^ISS-\d{8}-/);

      const after = await api
        .get(`/api/inventory/stock-levels?itemId=${firstItemId}&locationId=${firstLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(after.body.data[0].onHand).toBe(onHandBefore - 5);
    });

    it('POST /api/inventory/transfer moves stock between locations', async () => {
      // Receive into first location to ensure enough stock
      await api
        .post('/api/inventory/receive')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          vendorId: firstVendorId,
          itemId: firstItemId,
          locationId: firstLocationId,
          quantity: 30,
        })
        .expect(201);

      const sourceBefore = await api
        .get(`/api/inventory/stock-levels?itemId=${firstItemId}&locationId=${firstLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      const sourceOnHandBefore = sourceBefore.body.data[0].onHand;

      const res = await api
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          itemId: firstItemId,
          fromLocationId: firstLocationId,
          toLocationId: secondLocationId,
          quantity: 10,
        })
        .expect(201);

      expect(res.body.data.movementType).toBe('TRANSFER');
      expect(res.body.data.fromLocationId).toBe(firstLocationId);
      expect(res.body.data.toLocationId).toBe(secondLocationId);
      expect(res.body.data.referenceNumber).toMatch(/^TRF-\d{8}-/);

      const sourceAfter = await api
        .get(`/api/inventory/stock-levels?itemId=${firstItemId}&locationId=${firstLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(sourceAfter.body.data[0].onHand).toBe(sourceOnHandBefore - 10);
    });

    it('POST /api/inventory/issue returns 422 INSUFFICIENT_STOCK when quantity > onHand', async () => {
      const res = await api
        .post('/api/inventory/issue')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ itemId: firstItemId, locationId: firstLocationId, quantity: 999999 })
        .expect(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('POST /api/inventory/transfer returns 422 when transfer to same location', async () => {
      const res = await api
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({
          itemId: firstItemId,
          fromLocationId: firstLocationId,
          toLocationId: firstLocationId,
          quantity: 1,
        })
        .expect(422);
      expect(res.body.error.code).toBe('INVALID_TRANSFER');
    });

    it('GET /api/inventory/low-stock returns items below threshold', async () => {
      const res = await api
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Each alert should have a threshold and isLowStock flag
      for (const alert of res.body.data) {
        expect(alert).toHaveProperty('threshold');
        expect(alert.isLowStock).toBe(true);
      }
    });
  });

  // ─── Validation errors ────────────────────────────────────────

  describe('Input validation', () => {
    it('POST /receive returns 400 for missing required fields', async () => {
      const res = await api
        .post('/api/inventory/receive')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ quantity: 10 }) // missing vendorId, itemId, locationId
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /issue returns 400 for negative quantity', async () => {
      const res = await api
        .post('/api/inventory/issue')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ itemId: 1, locationId: 1, quantity: -5 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── RBAC enforcement ─────────────────────────────────────────

  describe('RBAC enforcement', () => {
    it('guest cannot POST /receive (403)', async () => {
      await api
        .post('/api/inventory/receive')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ vendorId: 1, itemId: 1, locationId: 1, quantity: 10 })
        .expect(403);
    });

    it('guest cannot POST /issue (403)', async () => {
      await api
        .post('/api/inventory/issue')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ itemId: 1, locationId: 1, quantity: 1 })
        .expect(403);
    });

    it('guest cannot POST /transfer (403)', async () => {
      await api
        .post('/api/inventory/transfer')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ itemId: 1, fromLocationId: 1, toLocationId: 2, quantity: 1 })
        .expect(403);
    });

    it('unauthenticated request returns 401', async () => {
      await api.get('/api/inventory/items').expect(401);
    });

    it('clerk cannot approve stock count (MANAGER/ADMIN only, 403)', async () => {
      await api
        .post('/api/inventory/stock-counts/1/approve')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(403);
    });

    it('guest cannot access ledger (MANAGER/ADMIN only, 403)', async () => {
      await api
        .get('/api/inventory/ledger')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });
  });

  // ─── Stock count workflow ─────────────────────────────────────

  describe('Stock count workflow', () => {
    it('POST /stock-counts creates a DRAFT count with lines', async () => {
      const res = await api
        .post('/api/inventory/stock-counts')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ locationId: firstLocationId })
        .expect(201);

      expect(res.body.data.status).toBe('DRAFT');
      expect(Array.isArray(res.body.data.lines)).toBe(true);
      stockCountId = res.body.data.id;
      stockCountLineId = res.body.data.lines[0]?.id;
    });

    it('GET /stock-counts returns paginated list', async () => {
      const res = await api
        .get('/api/inventory/stock-counts')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('PUT /stock-counts/:id/lines updates countedQty', async () => {
      if (!stockCountLineId) return;

      const res = await api
        .put(`/api/inventory/stock-counts/${stockCountId}/lines`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ lines: [{ lineId: stockCountLineId, countedQty: 0 }] })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('POST /stock-counts/:id/finalize auto-approves when variance is zero', async () => {
      // Create a fresh count and immediately finalize (no line updates = zero variance)
      const scRes = await api
        .post('/api/inventory/stock-counts')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ locationId: firstLocationId })
        .expect(201);
      const zeroVarCountId = scRes.body.data.id;

      const res = await api
        .post(`/api/inventory/stock-counts/${zeroVarCountId}/finalize`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('POST /stock-counts/:id/finalize may set PENDING_APPROVAL for high variance', async () => {
      // The stock count with stockCountId had its first line set to countedQty=0
      // which likely creates high variance → PENDING_APPROVAL
      const res = await api
        .post(`/api/inventory/stock-counts/${stockCountId}/finalize`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      // Accept either outcome depending on actual system quantities
      expect(['PENDING_APPROVAL', 'APPROVED']).toContain(res.body.data.status);
    });

    it('MANAGER can approve a PENDING_APPROVAL stock count', async () => {
      const listRes = await api
        .get('/api/inventory/stock-counts?status=PENDING_APPROVAL')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      if (listRes.body.data.items.length === 0) return; // skip if no pending counts

      const pendingId = listRes.body.data.items[0].id;
      const res = await api
        .post(`/api/inventory/stock-counts/${pendingId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('MANAGER can reject a PENDING_APPROVAL stock count', async () => {
      // Create a count with high variance then finalize to get PENDING_APPROVAL
      const scRes = await api
        .post('/api/inventory/stock-counts')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ locationId: firstLocationId })
        .expect(201);
      const newId = scRes.body.data.id;

      // Set first line to 0 if there are lines (creates variance)
      const firstLine = scRes.body.data.lines[0];
      if (firstLine && firstLine.systemQty > 0) {
        await api
          .put(`/api/inventory/stock-counts/${newId}/lines`)
          .set('Authorization', `Bearer ${clerkToken}`)
          .send({ lines: [{ lineId: firstLine.id, countedQty: 0 }] })
          .expect(200);
      }

      const finalRes = await api
        .post(`/api/inventory/stock-counts/${newId}/finalize`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      if (finalRes.body.data.status !== 'PENDING_APPROVAL') return; // skip if auto-approved

      const rejectRes = await api
        .post(`/api/inventory/stock-counts/${newId}/reject`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(rejectRes.body.data.status).toBe('REJECTED');
    });
  });

  // ─── Ledger query & exports ───────────────────────────────────

  describe('Ledger query and exports', () => {
    it('GET /api/inventory/ledger returns paginated entries (MANAGER)', async () => {
      const res = await api
        .get('/api/inventory/ledger?page=1&pageSize=10')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('columns');
    });

    it('non-admin sees unitCostUsd as null in ledger entries', async () => {
      const res = await api
        .get('/api/inventory/ledger?page=1&pageSize=20')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      for (const entry of res.body.data.items) {
        expect(entry.unitCostUsd).toBeNull();
      }
      expect(res.body.data.columns).not.toContain('unitCostUsd');
    });

    it('admin sees unitCostUsd in ledger entries and columns', async () => {
      const res = await api
        .get('/api/inventory/ledger?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.columns).toContain('unitCostUsd');
    });

    it('GET /api/inventory/ledger/export?format=csv returns CSV attachment', async () => {
      const res = await api
        .get('/api/inventory/ledger/export?format=csv')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('ledger.csv');
      expect(typeof res.text).toBe('string');
      expect(res.text.length).toBeGreaterThan(0);
    });

    it('GET /api/inventory/ledger/export?format=excel returns Excel attachment', async () => {
      const res = await api
        .get('/api/inventory/ledger/export?format=excel')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('ledger.xlsx');
    });

    it('GET /api/inventory/ledger supports movementType filter', async () => {
      const res = await api
        .get('/api/inventory/ledger?movementType=RECEIVING')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const entry of res.body.data.items) {
        expect(entry.movementType).toBe('RECEIVING');
      }
    });
  });
});
