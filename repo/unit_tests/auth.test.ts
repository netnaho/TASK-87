import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Use dynamic require to resolve from backend node_modules
const bcrypt = require('../backend/node_modules/bcryptjs');
const jwt = require('../backend/node_modules/jsonwebtoken');

describe('Auth - Password Hashing', () => {
  it('should hash password with per-user salt and verify correctly', async () => {
    const password = 'testpass123!';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await bcrypt.hash(password + salt, 12);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50);

    const valid = await bcrypt.compare(password + salt, hash);
    expect(valid).toBe(true);

    const invalid = await bcrypt.compare('wrongpassword' + salt, hash);
    expect(invalid).toBe(false);
  });

  it('should produce different hashes for same password with different salts', async () => {
    const password = 'samepassword';
    const salt1 = crypto.randomBytes(16).toString('hex');
    const salt2 = crypto.randomBytes(16).toString('hex');

    const hash1 = await bcrypt.hash(password + salt1, 12);
    const hash2 = await bcrypt.hash(password + salt2, 12);

    expect(hash1).not.toBe(hash2);
  });

  it('should generate unique salts', () => {
    const salt1 = crypto.randomBytes(16).toString('hex');
    const salt2 = crypto.randomBytes(16).toString('hex');

    expect(salt1).not.toBe(salt2);
    expect(salt1.length).toBe(32);
  });
});

describe('Auth - JWT', () => {
  const secret = 'test-jwt-secret';

  it('should create and verify JWT with role payload', () => {
    const payload = { userId: 1, username: 'testuser', role: 'ADMIN' };
    const token = jwt.sign(payload, secret, { expiresIn: '24h' });

    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const decoded = jwt.verify(token, secret) as any;
    expect(decoded.userId).toBe(1);
    expect(decoded.username).toBe('testuser');
    expect(decoded.role).toBe('ADMIN');
  });

  it('should reject token with wrong secret', () => {
    const payload = { userId: 1, username: 'testuser', role: 'GUEST' };
    const token = jwt.sign(payload, secret);

    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });

  it('should reject expired token', () => {
    const payload = { userId: 1, username: 'testuser', role: 'GUEST' };
    const token = jwt.sign(payload, secret, { expiresIn: '0s' });

    expect(() => jwt.verify(token, secret)).toThrow();
  });
});
