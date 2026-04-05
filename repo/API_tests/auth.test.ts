import { describe, it, expect } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Auth API', () => {
  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const res = await api
        .post('/api/auth/login')
        .send(demoUsers.admin)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.user.username).toBe('admin');
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(res.body.data.user).not.toHaveProperty('salt');
    });

    it('should fail with invalid username', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'whatever' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should fail with wrong password', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should fail with empty body', async () => {
      const res = await api
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should login all demo users successfully', async () => {
      for (const [role, creds] of Object.entries(demoUsers)) {
        const res = await api
          .post('/api/auth/login')
          .send(creds)
          .expect(200);

        expect(res.body.data.token).toBeTruthy();
        expect(res.body.data.user.username).toBe(creds.username);
      }
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const token = await loginAs(demoUsers.admin.username, demoUsers.admin.password);

      const res = await api
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('admin');
      expect(res.body.data.role).toBe('ADMIN');
    });

    it('should reject requests without auth header', async () => {
      const res = await api
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid tokens', async () => {
      const res = await api
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);

      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const uniqueUser = `testuser_${Date.now()}`;
      const res = await api
        .post('/api/auth/register')
        .send({
          username: uniqueUser,
          password: 'testpass123!',
          displayName: 'Test User',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeTruthy();
      expect(res.body.data.user.username).toBe(uniqueUser);
      expect(res.body.data.user.role).toBe('GUEST');
    });

    it('should reject duplicate username', async () => {
      const res = await api
        .post('/api/auth/register')
        .send({
          username: 'admin',
          password: 'testpass123!',
          displayName: 'Duplicate Admin',
        })
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should ignore role ADMIN and assign GUEST', async () => {
      const uniqueUser = `testadmin_${Date.now()}`;
      const res = await api
        .post('/api/auth/register')
        .send({
          username: uniqueUser,
          password: 'testpass123!',
          displayName: 'Privilege Escalation Test',
          role: 'ADMIN',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('GUEST');
    });

    it('should ignore role MANAGER and assign GUEST', async () => {
      const uniqueUser = `testmgr_${Date.now()}`;
      const res = await api
        .post('/api/auth/register')
        .send({
          username: uniqueUser,
          password: 'testpass123!',
          displayName: 'Privilege Escalation Test',
          role: 'MANAGER',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('GUEST');
    });

    it('should ignore role MODERATOR and assign GUEST', async () => {
      const uniqueUser = `testmod_${Date.now()}`;
      const res = await api
        .post('/api/auth/register')
        .send({
          username: uniqueUser,
          password: 'testpass123!',
          displayName: 'Privilege Escalation Test',
          role: 'MODERATOR',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('GUEST');
    });

    it('should reject weak password', async () => {
      const res = await api
        .post('/api/auth/register')
        .send({
          username: `weakpw_${Date.now()}`,
          password: 'short',
          displayName: 'Weak PW User',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});
