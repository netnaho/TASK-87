import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Trust / Credit API', () => {
  let adminToken: string;
  let guestToken: string;
  let hostToken: string;
  let clerkToken: string;

  beforeAll(async () => {
    [adminToken, guestToken, hostToken, clerkToken] = await Promise.all([
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
      loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
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

  let uniqueTaskId: number;

  describe('Rating tasks', () => {
    it('POST /api/trust/rate requires authentication (401)', async () => {
      await api
        .post('/api/trust/rate')
        .send({ rateeId: 2, taskId: 1, rating: 5 })
        .expect(401);
    });

    it('POST /api/trust/rate rates a task successfully', async () => {
      // Use a unique task ID so this test is idempotent across DB-persisted runs
      uniqueTaskId = Math.floor(Math.random() * 2000000000) + 1000;
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: 2, taskId: uniqueTaskId, rating: 5 })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('delta');
    });

    it('POST /api/trust/rate prevents duplicate rating on same task (409)', async () => {
      const res = await api
        .post('/api/trust/rate')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ rateeId: 2, taskId: uniqueTaskId, rating: 4 })
        .expect(409);
      expect(res.body.success).toBe(false);
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
