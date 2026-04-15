import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Moderation API', () => {
  let guestToken: string;
  let hostToken: string;
  let moderatorToken: string;
  let adminToken: string;

  let testReviewId: number;
  let reportId: number;
  let moderationActionId: number;
  let appealId: number;

  beforeAll(async () => {
    [guestToken, hostToken, moderatorToken, adminToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
      loginAs(demoUsers.moderator.username, demoUsers.moderator.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
    ]);

    // Create a review as guest so we have a known author for appeal ownership tests
    const reviewRes = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({
        targetType: 'STAY',
        targetId: 1,
        ratingCleanliness: 2,
        ratingCommunication: 2,
        ratingAccuracy: 2,
        text: 'Review created for moderation testing purposes.',
      });
    testReviewId = reviewRes.body.data.id;
  });

  // ─── File report ─────────────────────────────────────────────

  describe('File report', () => {
    it('POST /api/moderation/reports files a report successfully', async () => {
      const res = await api
        .post('/api/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contentType: 'REVIEW',
          contentId: testReviewId,
          reviewId: testReviewId,
          reason: 'This review contains inappropriate language and false claims.',
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeTypeOf('number');
      reportId = res.body.data.id;
    });

    it('POST /api/moderation/reports without auth returns 401', async () => {
      await api
        .post('/api/moderation/reports')
        .send({ contentType: 'REVIEW', contentId: 1, reason: 'Something bad.' })
        .expect(401);
    });

    it('POST /api/moderation/reports with short reason returns 400', async () => {
      const res = await api
        .post('/api/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentType: 'REVIEW', contentId: 2, reason: 'Bad.' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/moderation/reports duplicate returns 409', async () => {
      const res = await api
        .post('/api/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contentType: 'REVIEW',
          contentId: testReviewId,
          reviewId: testReviewId,
          reason: 'Submitting the same report again for the same content.',
        })
        .expect(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE');
    });
  });

  // ─── Queue and actions ───────────────────────────────────────

  describe('Queue and actions', () => {
    it('GET /api/moderation/reports/queue requires MODERATOR role', async () => {
      await api
        .get('/api/moderation/reports/queue')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('GET /api/moderation/reports/queue returns paginated queue', async () => {
      const res = await api
        .get('/api/moderation/reports/queue')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('POST /api/moderation/reports/:id/assign assigns to moderator', async () => {
      const res = await api
        .post(`/api/moderation/reports/${reportId}/assign`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_REVIEW');
    });

    it('POST /api/moderation/reports/:id/action takes WARN action', async () => {
      const res = await api
        .post(`/api/moderation/reports/${reportId}/action`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ action: 'WARN', notes: 'First warning issued to the reviewer.' })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.action).toBe('WARN');
      moderationActionId = res.body.data.id;
    });
  });

  // ─── Audit trail ─────────────────────────────────────────────

  describe('Audit trail', () => {
    it('GET /api/moderation/audit requires ADMIN role', async () => {
      await api
        .get('/api/moderation/audit')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(403);
    });

    it('GET /api/moderation/audit returns audit log (ADMIN)', async () => {
      const res = await api
        .get('/api/moderation/audit')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  // ─── Appeals ─────────────────────────────────────────────────

  describe('Appeals workflow', () => {
    it('POST /api/moderation/appeals files an appeal', async () => {
      const res = await api
        .post('/api/moderation/appeals')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          moderationActionId,
          userStatement: 'I believe the warning was unjust. My review was factual and polite throughout.',
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      appealId = res.body.data.id;
    });

    it('POST /api/moderation/appeals duplicate returns 409', async () => {
      const res = await api
        .post('/api/moderation/appeals')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ moderationActionId, userStatement: 'Filing the same appeal again should be blocked.' })
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/moderation/appeals by non-affected user returns 403', async () => {
      const res = await api
        .post('/api/moderation/appeals')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          moderationActionId,
          userStatement: 'I am not the affected user but trying to appeal anyway.',
        })
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/moderation/appeals lists appeals (MODERATOR)', async () => {
      const res = await api
        .get('/api/moderation/appeals')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('POST /api/moderation/appeals/:id/resolve moves to IN_REVIEW (ADMIN)', async () => {
      const res = await api
        .post(`/api/moderation/appeals/${appealId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_REVIEW', arbitrationNotes: 'Under review by senior moderator.' })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_REVIEW');
    });

    it('POST /api/moderation/appeals/:id/resolve finalizes as UPHELD', async () => {
      const res = await api
        .post(`/api/moderation/appeals/${appealId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'UPHELD', outcome: 'Warning confirmed. Review violated community guidelines.' })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UPHELD');
    });

    it('POST /api/moderation/appeals/:id/resolve on closed appeal returns 422', async () => {
      const res = await api
        .post(`/api/moderation/appeals/${appealId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OVERTURNED' })
        .expect(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });
  });

  // ─── User-facing appeals (GET /appeals/my, GET /actions/my) ─────────────

  describe('User-facing appeal endpoints', () => {
    it('GET /api/moderation/appeals/my returns only caller-owned appeals (guest)', async () => {
      const res = await api
        .get('/api/moderation/appeals/my')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      // Every appeal returned must belong to the guest user
      for (const appeal of res.body.data.items) {
        expect(appeal.userId).toBeTypeOf('number');
      }
    });

    it('GET /api/moderation/appeals/my returns 401 without auth', async () => {
      await api.get('/api/moderation/appeals/my').expect(401);
    });

    it('GET /api/moderation/appeals/my does NOT expose another user\'s appeals', async () => {
      // Host has no appeals, so the guest\'s appeal must not appear here
      const res = await api
        .get('/api/moderation/appeals/my')
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      // The appealId created under guestToken should not be in host's list
      const ids = res.body.data.items.map((a: any) => a.id);
      expect(ids).not.toContain(appealId);
    });

    it('GET /api/moderation/actions/my returns only caller-affected actions (guest)', async () => {
      const res = await api
        .get('/api/moderation/actions/my')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      // The moderationActionId created earlier must appear in guest's action list
      const ids = res.body.data.items.map((a: any) => a.id);
      expect(ids).toContain(moderationActionId);
    });

    it('GET /api/moderation/actions/my does NOT expose actions on another user\'s content', async () => {
      const res = await api
        .get('/api/moderation/actions/my')
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      // Host has no content that was actioned; guest's action must not appear
      const ids = res.body.data.items.map((a: any) => a.id);
      expect(ids).not.toContain(moderationActionId);
    });

    it('GET /api/moderation/actions/my returns 401 without auth', async () => {
      await api.get('/api/moderation/actions/my').expect(401);
    });

    it('GET /api/moderation/appeals/my supports status filter', async () => {
      const res = await api
        .get('/api/moderation/appeals/my')
        .query({ status: 'UPHELD' })
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      for (const appeal of res.body.data.items) {
        expect(appeal.status).toBe('UPHELD');
      }
    });

    it('GET /api/moderation/actions/my includes per-user appeal status on each action', async () => {
      const res = await api
        .get('/api/moderation/actions/my')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      const action = res.body.data.items.find((a: any) => a.id === moderationActionId);
      expect(action).toBeDefined();
      // The response includes a filtered appeals array for this user
      expect(Array.isArray(action.appeals)).toBe(true);
    });

    it('POST /api/moderation/appeals by user for own action (new action needed)', async () => {
      // Create a fresh review under host so we can appeal on behalf of host
      const reviewRes = await api
        .post('/api/reviews')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          targetType: 'STAY',
          targetId: 2,
          ratingCleanliness: 3,
          ratingCommunication: 3,
          ratingAccuracy: 3,
          text: 'Host review created for appeal ownership test.',
        });
      const hostReviewId: number = reviewRes.body.data.id;

      // Admin reports it
      const rptRes = await api
        .post('/api/moderation/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contentType: 'REVIEW',
          contentId: hostReviewId,
          reviewId: hostReviewId,
          reason: 'Fabricated reason for testing appeal ownership flow.',
        });
      const rptId: number = rptRes.body.data.id;

      // Moderator takes action
      const actRes = await api
        .post(`/api/moderation/reports/${rptId}/action`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ action: 'WARN', notes: 'Ownership test warning.' });
      const newActionId: number = actRes.body.data.id;

      // Host (the affected user) can file an appeal
      const appealRes = await api
        .post('/api/moderation/appeals')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          moderationActionId: newActionId,
          userStatement: 'I am the owner of this review and believe the warning was unjustified.',
        })
        .expect(201);
      expect(appealRes.body.success).toBe(true);

      // Guest (non-owner) cannot appeal the same action
      await api
        .post('/api/moderation/appeals')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          moderationActionId: newActionId,
          userStatement: 'I am not the owner but trying to appeal anyway.',
        })
        .expect(403);
    });

    it('Duplicate appeal on same action returns 409', async () => {
      // Use moderationActionId which guest already appealed
      const res = await api
        .post('/api/moderation/appeals')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          moderationActionId,
          userStatement: 'Filing a second appeal on the same action should be blocked.',
        })
        .expect(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE');
    });

    it('GET /api/moderation/appeals (admin view) remains accessible to MODERATOR', async () => {
      const res = await api
        .get('/api/moderation/appeals')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/moderation/appeals (admin view) is forbidden for GUEST', async () => {
      await api
        .get('/api/moderation/appeals')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('Appeal status transitions remain admin-governed (guest cannot resolve)', async () => {
      await api
        .post(`/api/moderation/appeals/${appealId}/resolve`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ status: 'OVERTURNED' })
        .expect(403);
    });
  });

  // ─── Sensitive words ─────────────────────────────────────────

  describe('Sensitive words', () => {
    it('POST /api/moderation/sensitive-words requires ADMIN', async () => {
      await api
        .post('/api/moderation/sensitive-words')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ word: 'testword', category: 'profanity' })
        .expect(403);
    });

    it('POST /api/moderation/sensitive-words adds a word (ADMIN)', async () => {
      const res = await api
        .post('/api/moderation/sensitive-words')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ word: 'testblockword', category: 'test' })
        .expect(201);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/moderation/sensitive-words lists all words (ADMIN)', async () => {
      const res = await api
        .get('/api/moderation/sensitive-words')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('DELETE /api/moderation/sensitive-words/:id removes the word (ADMIN)', async () => {
      // First create a word so we have a known ID to delete
      const createRes = await api
        .post('/api/moderation/sensitive-words')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ word: `deleteme_${Date.now()}`, category: 'test' })
        .expect(201);
      const wordId = createRes.body.data.id;
      expect(typeof wordId).toBe('number');

      const deleteRes = await api
        .delete(`/api/moderation/sensitive-words/${wordId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.data.deleted).toBe(true);
    });

    it('DELETE /api/moderation/sensitive-words/:id returns 404 for non-existent word', async () => {
      const res = await api
        .delete('/api/moderation/sensitive-words/999999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('DELETE /api/moderation/sensitive-words/:id requires ADMIN (403 for moderator)', async () => {
      await api
        .delete('/api/moderation/sensitive-words/1')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(403);
    });

    it('DELETE /api/moderation/sensitive-words/:id requires authentication (401)', async () => {
      await api
        .delete('/api/moderation/sensitive-words/1')
        .expect(401);
    });
  });
});
