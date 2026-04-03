import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Moderation API', () => {
  let guestToken: string;
  let moderatorToken: string;
  let adminToken: string;

  let reportId: number;
  let moderationActionId: number;
  let appealId: number;

  beforeAll(async () => {
    [guestToken, moderatorToken, adminToken] = await Promise.all([
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.moderator.username, demoUsers.moderator.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
    ]);
  });

  // ─── File report ─────────────────────────────────────────────

  describe('File report', () => {
    it('POST /api/moderation/reports files a report successfully', async () => {
      const res = await api
        .post('/api/moderation/reports')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          contentType: 'REVIEW',
          contentId: 1,
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
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ contentType: 'REVIEW', contentId: 2, reason: 'Bad.' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/moderation/reports duplicate returns 409', async () => {
      const res = await api
        .post('/api/moderation/reports')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          contentType: 'REVIEW',
          contentId: 1,
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
  });
});
