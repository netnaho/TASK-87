import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Users API', () => {
  let adminToken: string;
  let managerToken: string;
  let guestToken: string;

  let targetUserId: number;

  beforeAll(async () => {
    [adminToken, managerToken, guestToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
    ]);

    // Get the guest user's ID to use as a role-update target
    const meRes = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    targetUserId = meRes.body.data.id;
  });

  // ─── GET /api/users ───────────────────────────────────────────

  describe('GET /api/users', () => {
    it('ADMIN can list all users with pagination', async () => {
      const res = await api
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('pageSize');
      expect(res.body.data).toHaveProperty('totalPages');

      const user = res.body.data.items[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('isActive');
    });

    it('ADMIN can paginate users', async () => {
      const res = await api
        .get('/api/users?page=1&pageSize=3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(3);
      expect(res.body.data.items.length).toBeLessThanOrEqual(3);
    });

    it('MANAGER cannot list users (403)', async () => {
      await api
        .get('/api/users')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('GUEST cannot list users (403)', async () => {
      await api
        .get('/api/users')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await api.get('/api/users').expect(401);
    });
  });

  // ─── PATCH /api/users/:id/role ────────────────────────────────

  describe('PATCH /api/users/:id/role', () => {
    it('ADMIN can update a user role', async () => {
      const res = await api
        .patch(`/api/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'FRONT_DESK' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(targetUserId);
      expect(res.body.data.role).toBe('FRONT_DESK');
    });

    it('ADMIN can restore original role', async () => {
      // Restore to GUEST to avoid disrupting other tests
      const res = await api
        .patch(`/api/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'GUEST' })
        .expect(200);

      expect(res.body.data.role).toBe('GUEST');
    });

    it('MANAGER cannot update a user role (403)', async () => {
      await api
        .patch(`/api/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ role: 'HOST' })
        .expect(403);
    });

    it('GUEST cannot update a user role (403)', async () => {
      await api
        .patch(`/api/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ role: 'HOST' })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await api
        .patch(`/api/users/${targetUserId}/role`)
        .send({ role: 'HOST' })
        .expect(401);
    });

    it('returns 400 for an invalid role value', async () => {
      const res = await api
        .patch(`/api/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'SUPERUSER' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
