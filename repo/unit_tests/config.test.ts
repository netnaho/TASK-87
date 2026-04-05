/**
 * Tests for backend/src/config/index.ts — requireSecret() behaviour.
 *
 * Each test manipulates process.env and calls vi.resetModules() so that the
 * config module is re-evaluated from scratch, exercising the four branches:
 *
 *   1. Secret is provided                           → value used directly
 *   2. Secret missing, production                   → throws (no opt-out)
 *   3. Secret missing, non-prod, no opt-in flag     → throws with helpful hint
 *   4. Secret missing, non-prod, ALLOW_INSECURE_DEV_SECRETS=true → fallback + warning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Env snapshot ─────────────────────────────────────────────────────────────
// Capture the env state BEFORE any test mutations so we can fully restore it.

const SNAPSHOT = { ...process.env };

function restoreEnv() {
  // Remove keys added by tests
  for (const key of Object.keys(process.env)) {
    if (!(key in SNAPSHOT)) delete process.env[key];
  }
  // Restore original values (covers keys that were deleted or modified)
  Object.assign(process.env, SNAPSHOT);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

// ─── Helper to load a fresh config module ────────────────────────────────────

async function loadConfig() {
  // Dynamic import after vi.resetModules() loads the module fresh each time.
  return import('@/config');
}

// ─── Branch 1: secret is explicitly provided ─────────────────────────────────

describe('config - secret provided via env var', () => {
  it('returns the provided JWT_SECRET value', async () => {
    process.env.JWT_SECRET = 'explicitly-set-jwt-secret';
    process.env.ENCRYPTION_KEY = 'explicitly-set-encryption-key';
    // ALLOW_INSECURE_DEV_SECRETS not needed when real values are present
    delete process.env.ALLOW_INSECURE_DEV_SECRETS;

    const { config } = await loadConfig();
    expect(config.jwt.secret).toBe('explicitly-set-jwt-secret');
  });

  it('returns the provided ENCRYPTION_KEY value', async () => {
    process.env.JWT_SECRET = 'any-jwt-secret';
    process.env.ENCRYPTION_KEY = 'explicitly-set-encryption-key';
    delete process.env.ALLOW_INSECURE_DEV_SECRETS;

    const { config } = await loadConfig();
    expect(config.encryption.key).toBe('explicitly-set-encryption-key');
  });

  it('uses the env var even when ALLOW_INSECURE_DEV_SECRETS is also set', async () => {
    process.env.JWT_SECRET = 'real-secret-value';
    process.env.ENCRYPTION_KEY = 'real-encryption-key';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';

    const { config } = await loadConfig();
    expect(config.jwt.secret).toBe('real-secret-value');
  });
});

// ─── Branch 2: secret missing in production ──────────────────────────────────

describe('config - secret missing in production', () => {
  it('throws for JWT_SECRET when NODE_ENV=production', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'some-key';
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true'; // opt-in ignored in production

    await expect(loadConfig()).rejects.toThrow('JWT_SECRET');
  });

  it('throws for ENCRYPTION_KEY when NODE_ENV=production', async () => {
    process.env.JWT_SECRET = 'some-jwt';
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true'; // opt-in ignored in production

    await expect(loadConfig()).rejects.toThrow('ENCRYPTION_KEY');
  });

  it('throws even when ALLOW_INSECURE_DEV_SECRETS=true in production', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'some-key';
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';

    await expect(loadConfig()).rejects.toThrow();
  });
});

// ─── Branch 3: secret missing, non-prod, no opt-in ───────────────────────────

describe('config - secret missing, no opt-in flag', () => {
  it('throws in development when JWT_SECRET is missing and flag is absent', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'some-key';
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_INSECURE_DEV_SECRETS;

    await expect(loadConfig()).rejects.toThrow('JWT_SECRET');
  });

  it('throws in test when JWT_SECRET is missing and flag is absent', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'some-key';
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_INSECURE_DEV_SECRETS;

    await expect(loadConfig()).rejects.toThrow('JWT_SECRET');
  });

  it('error message mentions ALLOW_INSECURE_DEV_SECRETS', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'some-key';
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_INSECURE_DEV_SECRETS;

    await expect(loadConfig()).rejects.toThrow('ALLOW_INSECURE_DEV_SECRETS');
  });

  it('ALLOW_INSECURE_DEV_SECRETS=false is treated the same as absent', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'some-key';
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'false';

    await expect(loadConfig()).rejects.toThrow('JWT_SECRET');
  });
});

// ─── Branch 4: secret missing, non-prod, with opt-in ─────────────────────────

describe('config - secret missing with ALLOW_INSECURE_DEV_SECRETS=true', () => {
  it('returns dev-only fallback for JWT_SECRET in development', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'any-key';
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';

    const { config } = await loadConfig();
    expect(config.jwt.secret).toBe('dev-only-jwt-secret-not-for-production');
  });

  it('returns dev-only fallback for ENCRYPTION_KEY in development', async () => {
    process.env.JWT_SECRET = 'any-jwt';
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';

    const { config } = await loadConfig();
    expect(config.encryption.key).toBe('dev-only-encryption-key-not-for-production');
  });

  it('emits a stderr warning when fallback is used', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'any-key';
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await loadConfig();

    // Capture calls BEFORE mockRestore() — restore also clears mock.calls in vitest.
    const warnCalls = stderrSpy.mock.calls.map((c) => String(c[0]));
    stderrSpy.mockRestore();
    const jwtWarn = warnCalls.find((m) => m.includes('JWT_SECRET'));
    expect(jwtWarn).toBeDefined();
    expect(jwtWarn).toContain('insecure');
    expect(jwtWarn).toContain('ALLOW_INSECURE_DEV_SECRETS');
  });

  it('works in test environment with the opt-in flag', async () => {
    delete process.env.JWT_SECRET;
    process.env.ENCRYPTION_KEY = 'any-key';
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';

    const { config } = await loadConfig();
    expect(config.jwt.secret).toBe('dev-only-jwt-secret-not-for-production');
  });
});

// ─── requireSecret export ─────────────────────────────────────────────────────

describe('requireSecret export', () => {
  it('is exported so it can be called by utilities that also need strict secret handling', async () => {
    process.env.JWT_SECRET = 'x';
    process.env.ENCRYPTION_KEY = 'y';
    const mod = await loadConfig();
    expect(typeof mod.requireSecret).toBe('function');
  });
});
