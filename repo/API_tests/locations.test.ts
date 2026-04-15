import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Locations API', () => {
  let adminToken: string;
  let managerToken: string;
  let clerkToken: string;
  let guestToken: string;

  let createdLocationId: number;

  beforeAll(async () => {
    [adminToken, managerToken, clerkToken, guestToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
    ]);
  });

  // ─── GET /api/locations ───────────────────────────────────────

  describe('GET /api/locations', () => {
    it('returns list of active locations for authenticated user', async () => {
      const res = await api
        .get('/api/locations')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('name');
    });

    it('returns 401 without authentication', async () => {
      await api.get('/api/locations').expect(401);
    });

    it('returns locations for guest user', async () => {
      const res = await api
        .get('/api/locations')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── POST /api/locations ──────────────────────────────────────

  describe('POST /api/locations', () => {
    it('ADMIN can create a location', async () => {
      const name = `Test Location ${Date.now()}`;
      const res = await api
        .post('/api/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, address: '123 Test Street' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe(name);
      expect(res.body.data.address).toBe('123 Test Street');
      createdLocationId = res.body.data.id;
    });

    it('MANAGER can create a location', async () => {
      const name = `Manager Location ${Date.now()}`;
      const res = await api
        .post('/api/locations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(name);
    });

    it('INVENTORY_CLERK cannot create a location (403)', async () => {
      await api
        .post('/api/locations')
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ name: 'Clerk Location' })
        .expect(403);
    });

    it('GUEST cannot create a location (403)', async () => {
      await api
        .post('/api/locations')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'Guest Location' })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await api
        .post('/api/locations')
        .send({ name: 'Unauthenticated Location' })
        .expect(401);
    });

    it('returns 400 for missing name', async () => {
      const res = await api
        .post('/api/locations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ address: 'No name given' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ─── PATCH /api/locations/:id ─────────────────────────────────

  describe('PATCH /api/locations/:id', () => {
    it('ADMIN can update a location name', async () => {
      const updatedName = `Updated Location ${Date.now()}`;
      const res = await api
        .patch(`/api/locations/${createdLocationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: updatedName })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdLocationId);
      expect(res.body.data.name).toBe(updatedName);
    });

    it('MANAGER can update a location address', async () => {
      const res = await api
        .patch(`/api/locations/${createdLocationId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ address: '456 Updated Ave' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.address).toBe('456 Updated Ave');
    });

    it('INVENTORY_CLERK cannot update a location (403)', async () => {
      await api
        .patch(`/api/locations/${createdLocationId}`)
        .set('Authorization', `Bearer ${clerkToken}`)
        .send({ name: 'Clerk Attempt' })
        .expect(403);
    });

    it('GUEST cannot update a location (403)', async () => {
      await api
        .patch(`/api/locations/${createdLocationId}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'Guest Attempt' })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await api
        .patch(`/api/locations/${createdLocationId}`)
        .send({ name: 'No Auth' })
        .expect(401);
    });
  });
});
