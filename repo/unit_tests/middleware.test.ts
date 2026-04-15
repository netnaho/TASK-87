import { vi, describe, it, expect, beforeEach } from 'vitest';

// Use direct node_modules path so vitest resolves it correctly (same pattern as auth.test.ts)
const jwt = require('../backend/node_modules/jsonwebtoken');
import { authenticate, authorize } from '@/middleware/auth';
import { config } from '@/config';

// Use whatever JWT secret the config resolved to (dev fallback when JWT_SECRET is unset)
const JWT_SECRET = config.jwt.secret;

function makeToken(payload: object, secret = JWT_SECRET): string {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

function makeReq(authHeader?: string): any {
  return { headers: { authorization: authHeader } };
}

function makeRes(): any {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate middleware', () => {
  it('returns 401 when Authorization header is missing', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with Bearer', () => {
    const req = makeReq('Basic somebase64token');
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', () => {
    const token = jwt.sign(
      { userId: 1, username: 'u', role: 'GUEST' },
      JWT_SECRET,
      { expiresIn: '-1s' } // already expired
    );
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.error.code).toBe('TOKEN_INVALID');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a token signed with a wrong secret', () => {
    const token = makeToken({ userId: 1, username: 'u', role: 'GUEST' }, 'wrong-secret');
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user for a valid token', () => {
    const token = makeToken({ userId: 7, username: 'alice', role: 'MANAGER' });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: 7, username: 'alice', role: 'MANAGER' });
  });
});

// ─── authorize ────────────────────────────────────────────────────────────────

describe('authorize middleware', () => {
  it('returns 401 when req.user is not set', () => {
    const req: any = { headers: {} };
    const res = makeRes();
    const next = vi.fn();

    authorize('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not in allowed roles', () => {
    const req: any = { user: { userId: 1, username: 'u', role: 'GUEST' } };
    const res = makeRes();
    const next = vi.fn();

    authorize('ADMIN', 'MANAGER')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.error.code).toBe('FORBIDDEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user role matches single allowed role', () => {
    const req: any = { user: { userId: 2, username: 'admin', role: 'ADMIN' } };
    const res = makeRes();
    const next = vi.fn();

    authorize('ADMIN')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when user role is in multi-role allowlist', () => {
    const req: any = { user: { userId: 3, username: 'mgr', role: 'MANAGER' } };
    const res = makeRes();
    const next = vi.fn();

    authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() when no roles are specified (allow all authenticated)', () => {
    const req: any = { user: { userId: 4, username: 'g', role: 'GUEST' } };
    const res = makeRes();
    const next = vi.fn();

    authorize()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
