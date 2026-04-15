import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    trustScore: { create: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ALLOW_INSECURE_DEV_SECRETS is already set globally in vitest.unit.config.ts.
// Do NOT set JWT_SECRET or ENCRYPTION_KEY here — let the config use its dev fallback
// so it matches the value the already-cached config module will provide.

import prisma from '@/lib/prisma';
import { authService } from '@/modules/auth/auth.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.trustScore.create).mockResolvedValue({} as any);
});

// ─── register ─────────────────────────────────────────────────────────────────

describe('AuthService - register', () => {
  it('throws CONFLICT when username already exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 1 } as any);

    await expect(
      authService.register({ username: 'taken', password: 'pass', displayName: 'Test' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('creates user and trust score when username is free', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 42,
      username: 'newuser',
      displayName: 'New',
      role: 'GUEST',
      phoneMasked: null,
      createdAt: new Date(),
    } as any);

    const result = await authService.register({
      username: 'newuser',
      password: 'p@ssw0rd',
      displayName: 'New',
    });

    expect(prisma.user.create).toHaveBeenCalledOnce();
    expect(prisma.trustScore.create).toHaveBeenCalledOnce();
    expect(result.user.username).toBe('newuser');
    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe('string');
  });

  it('stores phone masked and encrypted when phone is provided', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 1, username: 'u', displayName: 'd', role: 'GUEST',
      phoneMasked: '***-***-1234', createdAt: new Date(),
    } as any);

    await authService.register({
      username: 'u', password: 'pass', displayName: 'd', phone: '+15551234567',
    });

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    expect(createCall.data.phoneMasked).toBeDefined();
    expect(createCall.data.phoneEncrypted).toBeDefined();
  });

  it('stores null for phone fields when phone is not provided', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 2, username: 'u2', displayName: 'd2', role: 'GUEST',
      phoneMasked: null, createdAt: new Date(),
    } as any);

    await authService.register({ username: 'u2', password: 'pass', displayName: 'd2' });

    const createCall = vi.mocked(prisma.user.create).mock.calls[0][0] as any;
    expect(createCall.data.phoneEncrypted).toBeNull();
    expect(createCall.data.phoneMasked).toBeNull();
  });

  it('returns token that is a non-empty string', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 3, username: 'u3', displayName: 'd3', role: 'GUEST',
      phoneMasked: null, createdAt: new Date(),
    } as any);

    const result = await authService.register({ username: 'u3', password: 'pw', displayName: 'd3' });
    expect(result.token.length).toBeGreaterThan(10);
    expect(result.token.split('.')).toHaveLength(3); // JWT has 3 parts
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('AuthService - login', () => {
  it('throws INVALID_CREDENTIALS when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      authService.login({ username: 'nobody', password: 'pw' })
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('throws INVALID_CREDENTIALS when user is inactive', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 1, username: 'u', isActive: false,
      passwordHash: 'h', salt: 's', role: 'GUEST',
    } as any);

    await expect(
      authService.login({ username: 'u', password: 'pw' })
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('throws INVALID_CREDENTIALS when password is wrong', async () => {
    // Use direct path so vitest resolves bcryptjs correctly
    const bcrypt = require('../backend/node_modules/bcryptjs');
    const realSalt = 'abc123defsalt9876abcdef1';
    const realHash = await bcrypt.hash('correctpassword' + realSalt, 10);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 1, username: 'u', isActive: true,
      passwordHash: realHash, salt: realSalt,
      displayName: 'U', role: 'GUEST', phoneMasked: null,
    } as any);

    await expect(
      authService.login({ username: 'u', password: 'wrongpassword' })
    ).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('returns user and token on successful login', async () => {
    const bcrypt = require('../backend/node_modules/bcryptjs');
    const salt = 'testsalt1234567890abcdef';
    const hash = await bcrypt.hash('mypassword' + salt, 10);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 5, username: 'alice', isActive: true,
      passwordHash: hash, salt,
      displayName: 'Alice', role: 'GUEST', phoneMasked: null,
    } as any);

    const result = await authService.login({ username: 'alice', password: 'mypassword' });

    expect(result.user.username).toBe('alice');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('salt');
    expect(result.token).toBeTruthy();
  });
});

// ─── getCurrentUser ───────────────────────────────────────────────────────────

describe('AuthService - getCurrentUser', () => {
  it('throws NOT_FOUND when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(authService.getCurrentUser(999)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when user is inactive', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 1, isActive: false } as any);

    await expect(authService.getCurrentUser(1)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns user data when user is active', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 7, username: 'bob', displayName: 'Bob', role: 'MANAGER',
      phoneMasked: null, isActive: true, createdAt: new Date(),
    } as any);

    const user = await authService.getCurrentUser(7);
    expect(user.id).toBe(7);
    expect(user.username).toBe('bob');
  });
});
