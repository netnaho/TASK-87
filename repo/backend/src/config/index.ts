const isProduction = process.env.NODE_ENV === 'production';
const allowInsecureFallbacks = process.env.ALLOW_INSECURE_DEV_SECRETS === 'true';

/**
 * Patterns that flag a secret as a known weak or placeholder value.
 * Only enforced in production — non-production environments are intentionally
 * permissive so developers can run locally without needing real secrets.
 */
const WEAK_SECRET_PATTERNS: RegExp[] = [
  /dev[\s_-]?only/i,            // "dev-only-*", "devonly"
  /not[\s_-]?for[\s_-]?prod/i,  // "not-for-production", "notforprod"
  /replace[\s_-]?with/i,        // "replace-with-a-random-secret"
  /\bplaceholder\b/i,
  /\bexample\b/i,
  /\bchangeme\b/i,
  /\binsecure\b/i,
];

/** Minimum character length accepted for any secret in production. */
const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Exact values that were committed to the repository and are permanently
 * compromised. Blocked in production regardless of length or pattern match.
 */
const KNOWN_COMMITTED_SECRETS = new Set<string>([
  'harborops-dev-jwt-secret-not-for-production',
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4',
]);

/** Returns true when the value is too short, a known-committed secret, or matches a weak pattern. */
export function isWeakSecret(value: string): boolean {
  if (value.length < MIN_PRODUCTION_SECRET_LENGTH) return true;
  if (KNOWN_COMMITTED_SECRETS.has(value)) return true;
  return WEAK_SECRET_PATTERNS.some((p) => p.test(value));
}

/**
 * Returns the env var value when set and, in production, strong enough.
 *
 * Behaviour matrix:
 *   - Production + value present + strong:     value returned as-is.
 *   - Production + value present + weak:       throws — no weak secrets in prod.
 *   - Production + value missing:              throws — secrets must be injected.
 *   - Non-prod + value present:                returned as-is (dev is permissive).
 *   - Non-prod + missing, no opt-in flag:      throws with hint to set flag.
 *   - Non-prod + missing, ALLOW_INSECURE=true: emits loud stderr warning, returns devFallback.
 *
 * ALLOW_INSECURE_DEV_SECRETS=true is intentionally ignored in production.
 */
export function requireSecret(envVar: string, devFallback: string): string {
  const value = process.env[envVar];

  if (value) {
    if (isProduction && isWeakSecret(value)) {
      throw new Error(
        `[config] ${envVar} is set but appears to be a known weak or publicly-committed ` +
          'placeholder value. Generate a strong random secret before starting in production:\n' +
          '  openssl rand -hex 32'
      );
    }
    return value;
  }

  if (isProduction) {
    throw new Error(
      `[config] Required secret ${envVar} is not set. ` +
        'Set it via environment variable before starting in production.'
    );
  }

  if (!allowInsecureFallbacks) {
    throw new Error(
      `[config] Required secret ${envVar} is not set. ` +
        'Supply the value via environment variable. ' +
        'To use an insecure dev-only fallback during local development ' +
        'set ALLOW_INSECURE_DEV_SECRETS=true (never in production).'
    );
  }

  // Explicit opt-in — still warn on every startup so it cannot be missed.
  process.stderr.write(
    `[config] WARNING: ${envVar} is not set. ` +
      'Using an insecure dev-only fallback because ALLOW_INSECURE_DEV_SECRETS=true. ' +
      'Never deploy this configuration to production.\n'
  );
  return devFallback;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || 'mysql://harborops:harborops_pass@localhost:3306/harborops',
  },
  jwt: {
    secret: requireSecret('JWT_SECRET', 'dev-only-jwt-secret-not-for-production'),
    expiresIn: '24h',
  },
  encryption: {
    key: requireSecret('ENCRYPTION_KEY', 'dev-only-encryption-key-not-for-production'),
  },
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: 5 * 1024 * 1024, // 5 MB
    maxFiles: 6,
  },
  cache: {
    ttlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || '15', 10),
  },
  rateLimit: {
    reviewsPerHour: parseInt(process.env.RATE_LIMIT_REVIEWS_PER_HOUR || '3', 10),
    followUpsPerHour: parseInt(process.env.RATE_LIMIT_FOLLOWUPS_PER_HOUR || '3', 10),
    hostRepliesPerHour: parseInt(process.env.RATE_LIMIT_HOST_REPLIES_PER_HOUR || '5', 10),
  },
  inventory: {
    defaultSafetyThreshold: 10,
    defaultAvgUsageDays: 7,
    varianceApprovalPct: 5,
    varianceApprovalUsd: 250,
  },
  reviews: {
    followUpDays: 7,
    hostReplyDays: 14,
  },
  trust: {
    // When true (default), an empty credit_rules table falls back to hardcoded defaults.
    // Set ALLOW_TRUST_RULE_FALLBACK=false in production to require explicit DB rules
    // and surface misconfiguration as a 503 rather than silently using defaults.
    allowFallback: process.env.ALLOW_TRUST_RULE_FALLBACK !== 'false',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;
