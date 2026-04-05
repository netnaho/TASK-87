import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers, getInteractionId, clearTaskRatings } from './helpers';

describe('Trust / Credit API', () => {
  let adminToken: string;
  let guestToken: string;
  let hostToken: string;
  let clerkToken: string;

  let hostUserId: number;
  let clerkUserId: number;
  let completedInteractionId: number;
  let inProgressInteractionId: number;
  let nonParticipantInteractionId: number;

  beforeAll(async () => {
    // Clear task ratings so tests are idempotent across runs without Docker restart
    await clearTaskRatings();

    [adminToken, guestToken, hostToken, clerkToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
    ]);

    // Get user IDs for rating targets
    const [hostMe, clerkMe] = await Promise.all([
      api.get('/api/auth/me').set('Authorization', `Bearer ${hostToken}`),
      api.get('/api/auth/me').set('Authorization', `Bearer ${clerkToken}`),
    ]);
    hostUserId = hostMe.body.data.id;
    clerkUserId = clerkMe.body.data.id;

    // Get seeded interaction IDs
    [completedInteractionId, inProgressInteractionId, nonParticipantInteractionId] = await Promise.all([
      getInteractionId('guest', 'host', 'COMPLETED'),
      getInteractionId('guest', 'clerk', 'IN_PROGRESS'),
      getInteractionId('manager', 'host', 'COMPLETED'),
    ]);
  });

  // ─── Score retrieval ──────────────────────────────────────────

  describe('Score retrieval', () => {
    it('GET /api/trust/score returns score for authenticated user', async () => {
      const res = await api
        .get('/api/trust/score')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('score');
      expect(Number(res.body.data.score)).toBeGreaterThanOrEqual(0);
      expect(Number(res.body.data.score)).toBeLessThanOrEqual(100);
    });

    it('GET /api/trust/history returns credit history', async () => {
      const res = await api
        .get('/api/trust/history')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /api/trust/leaderboard returns top users', async () => {
      const res = await api
        .get('/api/trust/leaderboard')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Rating tasks ─────────────────────────────────────────────

  describe('Rating tasks', () => {
    it('POST /api/trust/rate requires authentication (401)', async () => {
      await api
        .post('/api/trust/rate')
        .send({ rateeId: 2, taskId: 1, rating: 5 })
        .expect(401);
    });

    it('POST /api/trust/rate rates a completed interaction successfully', async () => {
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: hostUserId, taskId: completedInteractionId, rating: 5 })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('delta');
    });

    it('POST /api/trust/rate prevents duplicate rating on same task (409)', async () => {
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: hostUserId, taskId: completedInteractionId, rating: 4 })
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/trust/rate rejects nonexistent interaction (404)', async () => {
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: hostUserId, taskId: 999999999, rating: 5 })
        .expect(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERACTION_NOT_FOUND');
    });

    it('POST /api/trust/rate rejects non-completed interaction (422)', async () => {
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: clerkUserId, taskId: inProgressInteractionId, rating: 4 })
        .expect(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERACTION_NOT_COMPLETED');
    });

    it('POST /api/trust/rate rejects when user is not a participant (403)', async () => {
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: hostUserId, taskId: nonParticipantInteractionId, rating: 5 })
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_PARTICIPANT');
    });
  });

  // ─── User history endpoint ────────────────────────────────────

  describe('GET /api/trust/users/:userId/history', () => {
    it('returns paginated history for admin', async () => {
      const res = await api
        .get(`/api/trust/users/${hostUserId}/history`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
      expect(res.body.data).toHaveProperty('pageSize');
    });

    it('returns paginated history for manager', async () => {
      const managerToken = await import('./helpers').then((h) =>
        h.loginAs(h.demoUsers.manager.username, h.demoUsers.manager.password)
      );
      const res = await api
        .get(`/api/trust/users/${hostUserId}/history`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('returns 403 for non-admin/manager (guest)', async () => {
      await api
        .get(`/api/trust/users/${hostUserId}/history`)
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('returns 401 without auth', async () => {
      await api
        .get(`/api/trust/users/${hostUserId}/history`)
        .expect(401);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await api
        .get('/api/trust/users/999999999/history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns valid empty result for user with no history', async () => {
      // clerkUserId has no task ratings seeded, so history may be empty
      const res = await api
        .get(`/api/trust/users/${clerkUserId}/history`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(0);
    });

    it('respects pagination params', async () => {
      const res = await api
        .get(`/api/trust/users/${hostUserId}/history?page=1&pageSize=5`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.pageSize).toBe(5);
      expect(res.body.data.page).toBe(1);
    });
  });

  // ─── Admin operations ─────────────────────────────────────────

  describe('Admin operations', () => {
    it('POST /api/trust/adjust allows admin to adjust score directly', async () => {
      const res = await api
        .post('/api/trust/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 2, changeAmount: 10, reason: 'Manual boost for testing' })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('newScore');
    });

    it('GET /api/trust/admin/scores returns all scores for admin', async () => {
      const res = await api
        .get('/api/trust/admin/scores')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/trust/adjust by non-admin returns 403', async () => {
      const res = await api
        .post('/api/trust/adjust')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ userId: 2, changeAmount: 10, reason: 'Unauthorized attempt' })
        .expect(403);
      expect(res.body.success).toBe(false);
    });
  });
});
