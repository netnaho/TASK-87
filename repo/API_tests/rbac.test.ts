import { describe, it, expect } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('RBAC - Role-Based Access Control', () => {
  describe('Admin-only endpoints', () => {
    it('should allow admin to access user management', async () => {
      const token = await loginAs(demoUsers.admin.username, demoUsers.admin.password);
      const res = await api
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('should deny guest access to user management', async () => {
      const token = await loginAs(demoUsers.guest.username, demoUsers.guest.password);
      await api
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should deny clerk access to user management', async () => {
      const token = await loginAs(demoUsers.clerk.username, demoUsers.clerk.password);
      await api
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Manager endpoints', () => {
    it('should allow manager to access ledger', async () => {
      const token = await loginAs(demoUsers.manager.username, demoUsers.manager.password);
      const res = await api
        .get('/api/inventory/ledger')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should deny guest access to ledger', async () => {
      const token = await loginAs(demoUsers.guest.username, demoUsers.guest.password);
      await api
        .get('/api/inventory/ledger')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Moderation endpoints', () => {
    it('should allow moderator to access queue', async () => {
      const token = await loginAs(demoUsers.moderator.username, demoUsers.moderator.password);
      const res = await api
        .get('/api/moderation/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should deny guest access to moderation', async () => {
      const token = await loginAs(demoUsers.guest.username, demoUsers.guest.password);
      await api
        .get('/api/moderation/queue')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should allow admin access to audit trail', async () => {
      const token = await loginAs(demoUsers.admin.username, demoUsers.admin.password);
      const res = await api
        .get('/api/moderation/audit')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should deny moderator access to audit trail (admin only)', async () => {
      const token = await loginAs(demoUsers.moderator.username, demoUsers.moderator.password);
      await api
        .get('/api/moderation/audit')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });
});
