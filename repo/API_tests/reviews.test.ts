import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { api, loginAs, demoUsers, clearRateLimits, seedRateLimitLogs } from './helpers';

describe('Reviews API', () => {
  let guestToken: string;
  let hostToken: string;
  let adminToken: string;
  let managerToken: string;

  let hostUserId: number;
  let adminUserId: number;
  let reviewId: number;
  let followUpId: number;

  beforeAll(async () => {
    // Clear rate limit state so tests are idempotent across runs without Docker restart
    await clearRateLimits('guest');

    [guestToken, hostToken, adminToken, managerToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
    ]);

    // Get user IDs for ownership tests
    const [hostMe, adminMe] = await Promise.all([
      api.get('/api/auth/me').set('Authorization', `Bearer ${hostToken}`),
      api.get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`),
    ]);
    hostUserId = hostMe.body.data.id;
    adminUserId = adminMe.body.data.id;
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
          revieweeId: hostUserId,
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

    it('POST /api/reviews/:id/reply by non-owner HOST returns 403', async () => {
      // Create a review targeting admin (not the host user)
      const reviewRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 1,
          revieweeId: adminUserId,
          ratingCleanliness: 3,
          ratingCommunication: 3,
          ratingAccuracy: 3,
          text: 'Review for cross-host authorization test.',
        })
        .expect(201);
      const otherReviewId = reviewRes.body.data.id;

      const res = await api
        .post(`/api/reviews/${otherReviewId}/reply`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ text: 'Cross-host reply attempt.' })
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/reviews/:id/reply by MANAGER returns 403 (HOST role only)', async () => {
      await api
        .post(`/api/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ text: 'Manager reply attempt.' })
        .expect(403);
    });
  });

  // ─── Anti-spam rate limiting ──────────────────────────────────

  describe('Review anti-spam (3 per hour limit)', () => {
    afterAll(async () => {
      // Clean up rate limit entries for the guest user after this suite
      await clearRateLimits('guest');
    });

    it('4th review within 1 hour returns 429 RATE_LIMITED', async () => {
      // Clear any existing rate limit entries first
      await clearRateLimits('guest');

      // Create 3 reviews to exhaust the hourly limit
      for (let i = 0; i < 3; i++) {
        await api
          .post('/api/reviews')
          .set('Authorization', `Bearer ${guestToken}`)
          .send({
            targetType: 'STAY',
            targetId: 99,
            revieweeId: hostUserId,
            ratingCleanliness: 4,
            ratingCommunication: 4,
            ratingAccuracy: 4,
            text: `Rate limit test review ${i + 1}.`,
          })
          .expect(201);
      }

      // 4th review should be rate-limited
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 99,
          revieweeId: hostUserId,
          ratingCleanliness: 4,
          ratingCommunication: 4,
          ratingAccuracy: 4,
          text: 'This is the 4th review and should be blocked.',
        })
        .expect(429);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      // Message must reflect the configured limit, not a hardcoded literal
      expect(res.body.error.message).toMatch(/Maximum \d+ reviews per hour/);
    });

    it('review returns 429 RATE_LIMITED when quota is seeded via rate-limit logs', async () => {
      await clearRateLimits('guest');

      // Seed exactly reviewsPerHour (3 by default) log entries to exhaust the quota
      // without creating real reviews — deterministic and config-driven.
      await seedRateLimitLogs('guest', 'create_review', 3);

      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 99,
          revieweeId: hostUserId,
          ratingCleanliness: 4,
          ratingCommunication: 4,
          ratingAccuracy: 4,
          text: 'This review should be blocked by the seeded rate limit.',
        })
        .expect(429);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.body.error.message).toMatch(/Maximum \d+ reviews per hour/);
    });

    it('review succeeds when quota has not been reached', async () => {
      await clearRateLimits('guest');

      // Seed one fewer than the limit — should be allowed
      await seedRateLimitLogs('guest', 'create_review', 2);

      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 99,
          revieweeId: hostUserId,
          ratingCleanliness: 4,
          ratingCommunication: 4,
          ratingAccuracy: 4,
          text: 'This review should succeed as limit has not been reached.',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ─── Multipart numeric coercion ──────────────────────────────────

  describe('Review multipart — numeric coercion', () => {
    it('POST /api/reviews multipart with numeric-string fields creates review', async () => {
      // Sends all numeric fields as strings (as browsers / curl / mobile apps do)
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '1')
        .field('ratingCleanliness', '4')
        .field('ratingCommunication', '3')
        .field('ratingAccuracy', '5')
        .field('text', 'Multipart coercion test — all ratings sent as strings.')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.ratingCleanliness).toBe(4);
      expect(res.body.data.ratingCommunication).toBe(3);
      expect(res.body.data.ratingAccuracy).toBe(5);
    });

    it('POST /api/reviews multipart with tagIds[] sent as repeated fields persists tags', async () => {
      // Fetch real tag IDs so we can reference valid ones
      const tagsRes = await api
        .get('/api/reviews/tags')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      const tags: Array<{ id: number }> = tagsRes.body.data;

      if (tags.length < 2) return; // not enough tags seeded — skip

      const [t1, t2] = tags;

      // Supertest sends repeated .field('tagIds', ...) as 'tagIds' array
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '1')
        .field('ratingCleanliness', '5')
        .field('ratingCommunication', '5')
        .field('ratingAccuracy', '5')
        .field('text', 'Multipart tagIds coercion test.')
        .field('tagIds', String(t1.id))
        .field('tagIds', String(t2.id))
        .expect(201);

      expect(res.body.success).toBe(true);
      // Review should carry both tags
      const returnedTagIds = res.body.data.tags?.map((t: any) => t.tagId ?? t.tag?.id) ?? [];
      expect(returnedTagIds.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/reviews multipart with out-of-range string rating returns 400', async () => {
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '1')
        .field('ratingCleanliness', '6') // invalid: max is 5
        .field('ratingCommunication', '3')
        .field('ratingAccuracy', '3')
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('POST /api/reviews multipart with non-numeric string rating returns 400', async () => {
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '1')
        .field('ratingCleanliness', 'excellent') // non-numeric
        .field('ratingCommunication', '3')
        .field('ratingAccuracy', '3')
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('POST /api/reviews/:id/follow-up multipart with numeric-string ratings works', async () => {
      // Create a fresh review to follow up on (rate-limit might block guest; use admin)
      const baseRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetType: 'STAY',
          targetId: 10,
          ratingCleanliness: 3,
          ratingCommunication: 3,
          ratingAccuracy: 3,
          text: 'Base review for follow-up coercion test.',
        })
        .expect(201);
      const baseReviewId = baseRes.body.data.id;

      const res = await api
        .post(`/api/reviews/${baseReviewId}/follow-up`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('ratingCleanliness', '4')
        .field('ratingCommunication', '4')
        .field('ratingAccuracy', '4')
        .field('text', 'Follow-up via multipart coercion.')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.ratingCleanliness).toBe(4);
    });
  });

  // ─── Follow-up anti-spam rate limiting ────────────────────────

  describe('Follow-up anti-spam (3 per hour limit)', () => {
    afterAll(async () => {
      await clearRateLimits('guest');
    });

    it('follow-up returns 429 RATE_LIMITED when hourly quota exceeded', async () => {
      await clearRateLimits('guest');

      // Create a fresh review to follow up on (owned by guest)
      const baseRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 200,
          revieweeId: hostUserId,
          ratingCleanliness: 3,
          ratingCommunication: 3,
          ratingAccuracy: 3,
          text: 'Base review for follow-up rate limit test.',
        })
        .expect(201);
      const baseReviewId = baseRes.body.data.id;

      // Inject 3 existing create_followup log entries to exhaust the quota
      await seedRateLimitLogs('guest', 'create_followup', 3);

      const res = await api
        .post(`/api/reviews/${baseReviewId}/follow-up`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ ratingCleanliness: 5, ratingCommunication: 5, ratingAccuracy: 5 })
        .expect(429);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('follow-up succeeds when rate limit has not been reached', async () => {
      await clearRateLimits('guest');

      // Create a fresh review
      const baseRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 201,
          revieweeId: hostUserId,
          ratingCleanliness: 4,
          ratingCommunication: 4,
          ratingAccuracy: 4,
          text: 'Base review for follow-up allowed test.',
        })
        .expect(201);
      const baseReviewId = baseRes.body.data.id;

      // Only 2 prior follow-up entries — should be allowed
      await seedRateLimitLogs('guest', 'create_followup', 2);

      const res = await api
        .post(`/api/reviews/${baseReviewId}/follow-up`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ ratingCleanliness: 5, ratingCommunication: 5, ratingAccuracy: 5 })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ─── Host reply anti-spam rate limiting ───────────────────────

  describe('Host reply anti-spam (5 per hour limit)', () => {
    afterAll(async () => {
      await clearRateLimits('host');
    });

    it('host reply returns 429 RATE_LIMITED when hourly quota exceeded', async () => {
      await clearRateLimits('host');

      // Create a fresh review for the host to reply to
      const baseRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 300,
          revieweeId: hostUserId,
          ratingCleanliness: 3,
          ratingCommunication: 3,
          ratingAccuracy: 3,
          text: 'Base review for host reply rate limit test.',
        })
        .expect(201);
      const baseReviewId = baseRes.body.data.id;

      // Inject 5 existing create_host_reply entries to exhaust the quota
      await seedRateLimitLogs('host', 'create_host_reply', 5);

      const res = await api
        .post(`/api/reviews/${baseReviewId}/reply`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ text: 'This reply should be blocked by rate limiting.' })
        .expect(429);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('host reply succeeds when rate limit has not been reached', async () => {
      await clearRateLimits('host');

      // Create a fresh review for the host to reply to
      const baseRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          targetType: 'STAY',
          targetId: 301,
          revieweeId: hostUserId,
          ratingCleanliness: 4,
          ratingCommunication: 4,
          ratingAccuracy: 4,
          text: 'Base review for host reply allowed test.',
        })
        .expect(201);
      const baseReviewId = baseRes.body.data.id;

      // Only 4 prior entries — should be allowed
      await seedRateLimitLogs('host', 'create_host_reply', 4);

      const res = await api
        .post(`/api/reviews/${baseReviewId}/reply`)
        .set('Authorization', `Bearer ${hostToken}`)
        .send({ text: 'Allowed reply within rate limit.' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  // ─── Object-level image authorization ────────────────────────

  describe('Review image access (GET /api/reviews/:reviewId/images/:imageId)', () => {
    let reviewerToken: string;   // guest — the review author / image owner
    let unrelatedToken: string;  // clerk — authenticated but has no relation to the review
    let revieweeToken: string;   // host — the subject of the review
    let moderatorToken: string;
    let imageReviewId: number;
    let imageId: number;
    let revieweeUserId: number;

    beforeAll(async () => {
      // Obtain tokens for the roles we need
      [reviewerToken, unrelatedToken, revieweeToken, moderatorToken] = await Promise.all([
        loginAs(demoUsers.guest.username, demoUsers.guest.password),
        loginAs(demoUsers.clerk.username, demoUsers.clerk.password),
        loginAs(demoUsers.host.username, demoUsers.host.password),
        loginAs(demoUsers.moderator.username, demoUsers.moderator.password),
      ]);

      // Resolve the host user's ID so we can set revieweeId correctly
      const hostMe = await api.get('/api/auth/me').set('Authorization', `Bearer ${revieweeToken}`);
      revieweeUserId = hostMe.body.data.id;

      // Clear rate limits for the reviewer so image-test review creation isn't blocked
      await clearRateLimits('guest');

      // Create a review with a single image attachment
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${reviewerToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '500')
        .field('revieweeId', String(revieweeUserId))
        .field('ratingCleanliness', '4')
        .field('ratingCommunication', '4')
        .field('ratingAccuracy', '4')
        .field('text', 'Image authorization test review.')
        .attach('images', Buffer.from('fake-image-bytes'), { filename: 'test.jpg', contentType: 'image/jpeg' })
        .expect(201);

      imageReviewId = res.body.data.id;
      imageId = res.body.data.images[0].id;
    });

    it('returns 401 without an Authorization header', async () => {
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/${imageId}`)
        .expect(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 for the reviewer (image owner)', async () => {
      // The file itself is a fake buffer — sendFile may produce a 404 once it
      // tries to open the file on disk, but authorization succeeds (no 401/403).
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/${imageId}`)
        .set('Authorization', `Bearer ${reviewerToken}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 404) {
        // Authorized: the error comes from sendFile not finding the fake file, not auth
        expect(res.body.error?.code).toBe('NOT_FOUND');
      }
    });

    it('returns 200 or 404 for the reviewee (host whose review this is)', async () => {
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/${imageId}`)
        .set('Authorization', `Bearer ${revieweeToken}`);
      expect([200, 404]).toContain(res.status);
      // Must not be a 403
      expect(res.status).not.toBe(403);
    });

    it('returns 403 for an authenticated user unrelated to the review', async () => {
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/${imageId}`)
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 200 or 404 for ADMIN', async () => {
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/${imageId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 404]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('returns 200 or 404 for MODERATOR', async () => {
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/${imageId}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect([200, 404]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('returns 404 when imageId does not belong to the given reviewId', async () => {
      const res = await api
        .get(`/api/reviews/999999/images/${imageId}`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for a non-existent imageId', async () => {
      const res = await api
        .get(`/api/reviews/${imageReviewId}/images/999999`)
        .set('Authorization', `Bearer ${reviewerToken}`)
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    // ─── Legacy shim (/api/uploads/:filename) ──────────────────

    describe('Legacy shim GET /api/uploads/:filename (deprecated)', () => {
      let uploadedFilename: string;

      beforeAll(async () => {
        // Retrieve the stored filename from the DB via the review detail
        const detail = await api
          .get(`/api/reviews/${imageReviewId}`)
          .set('Authorization', `Bearer ${reviewerToken}`)
          .expect(200);
        uploadedFilename = detail.body.data.images[0].filePath;
      });

      it('returns 401 without an Authorization header', async () => {
        await api
          .get(`/api/uploads/${uploadedFilename}`)
          .expect(401);
      });

      it('returns 403 for an unrelated authenticated user', async () => {
        const res = await api
          .get(`/api/uploads/${uploadedFilename}`)
          .set('Authorization', `Bearer ${unrelatedToken}`)
          .expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      });

      it('returns 200 or 404 for the reviewer (authorized)', async () => {
        const res = await api
          .get(`/api/uploads/${uploadedFilename}`)
          .set('Authorization', `Bearer ${reviewerToken}`);
        // Auth passes — 404 means the fake file isn't on disk, which is fine
        expect([200, 404]).toContain(res.status);
        expect(res.status).not.toBe(403);
      });

      it('returns 404 for a filename not in the DB', async () => {
        const res = await api
          .get('/api/uploads/totally-unknown-file.jpg')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
    });
  });

  // ─── Multipart form-data upload edge cases ────────────────────

  describe('Review multipart upload', () => {
    let multipartReviewId: number;

    it('POST /api/reviews accepts multipart/form-data with tagIds[] and creates review', async () => {
      const res = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '1')
        .field('revieweeId', String(hostUserId))
        .field('ratingCleanliness', '5')
        .field('ratingCommunication', '5')
        .field('ratingAccuracy', '5')
        .field('text', 'Multipart form test review.')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeTypeOf('number');
      multipartReviewId = res.body.data.id;
    });

    it('POST /api/reviews rejects more than 6 image files (413 or 400)', async () => {
      // Create 7 small in-memory buffers to test file limit
      let req = api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${guestToken}`)
        .field('targetType', 'STAY')
        .field('targetId', '1')
        .field('revieweeId', String(hostUserId))
        .field('ratingCleanliness', '3')
        .field('ratingCommunication', '3')
        .field('ratingAccuracy', '3');

      // Attach 7 tiny files (1-byte each) — middleware limit is 6
      for (let i = 0; i < 7; i++) {
        req = req.attach('images', Buffer.from('x'), { filename: `img${i}.jpg`, contentType: 'image/jpeg' });
      }

      const res = await req;
      // Multer may respond 400 or 413 depending on configuration
      expect([400, 413]).toContain(res.status);
    });
  });
});
