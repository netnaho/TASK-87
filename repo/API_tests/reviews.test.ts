import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Reviews API', () => {
  let guestToken: string;
  let hostToken: string;
  let adminToken: string;
  let managerToken: string;

  let reviewId: number;
  let followUpId: number;

  beforeAll(async () => {
    [guestToken, hostToken, adminToken, managerToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
    ]);
  });

  // ─── Tags ────────────────────────────────────────────────────

  describe('Tags', () => {
    it('GET /api/reviews/tags returns tag list', async () => {
      const res = await api
        .get('/api/reviews/tags')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Create review ───────────────────────────────────────────

  describe('Create review', () => {
    it('POST /api/reviews creates a review successfully', async () => {
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 1,
          ratingCleanliness: 5,
          ratingCommunication: 4,
          ratingAccuracy: 4,
          text: 'Great stay, very clean room and friendly staff.',
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeTypeOf('number');
      expect(Number(res.body.data.overallRating)).toBeCloseTo(4.3, 0);
      reviewId = res.body.data.id;
    });

    it('POST /api/reviews without auth returns 401', async () => {
      await api
        .post('/api/reviews')
        .send({ targetType: 'STAY', targetId: 1, ratingCleanliness: 3, ratingCommunication: 3, ratingAccuracy: 3 })
        .expect(401);
    });

    it('POST /api/reviews with invalid ratings returns 400', async () => {
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ targetType: 'STAY', targetId: 1, ratingCleanliness: 6, ratingCommunication: 3, ratingAccuracy: 3 })
        .expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── List and get ─────────────────────────────────────────────

  describe('List and get reviews', () => {
    it('GET /api/reviews returns paginated list', async () => {
      const res = await api
        .get('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /api/reviews/:id returns single review', async () => {
      const res = await api
        .get(`/api/reviews/${reviewId}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(reviewId);
    });

    it('GET /api/reviews/:id with unknown id returns 404', async () => {
      const res = await api
        .get('/api/reviews/999999')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Follow-up ────────────────────────────────────────────────

  describe('Follow-up', () => {
    it('POST /api/reviews/:id/follow-up creates follow-up within 7-day window', async () => {
      const res = await api
        .post(`/api/reviews/${reviewId}/follow-up`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          ratingCleanliness: 5,
          ratingCommunication: 5,
          ratingAccuracy: 5,
          text: 'Actually it was even better than I thought.',
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      followUpId = res.body.data.id;
    });

    it('POST /api/reviews/:id/follow-up rejects duplicate follow-up', async () => {
      const res = await api
        .post(`/api/reviews/${reviewId}/follow-up`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4 })
        .expect(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE');
    });

    it('POST /api/reviews/:id/follow-up as different user returns 403', async () => {
      const res = await api
        .post(`/api/reviews/${reviewId}/follow-up`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ ratingCleanliness: 3, ratingCommunication: 3, ratingAccuracy: 3 })
        .expect(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Host reply ───────────────────────────────────────────────

  describe('Host reply', () => {
    it('POST /api/reviews/:id/reply by HOST creates reply', async () => {
      const res = await api
        .post(`/api/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ text: 'Thank you for your kind review! We hope to see you again.' })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.text).toContain('Thank you');
    });

    it('POST /api/reviews/:id/reply by GUEST returns 403', async () => {
      await api
        .post(`/api/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ text: 'Can guests reply?' })
        .expect(403);
    });

    it('POST /api/reviews/:id/reply rejects duplicate reply', async () => {
      const res = await api
        .post(`/api/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ text: 'Second reply attempt.' })
        .expect(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE');
    });
  });
});
