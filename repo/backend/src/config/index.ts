const isProduction = process.env.NODE_ENV === 'production';
const allowInsecureFallbacks = process.env.ALLOW_INSECURE_DEV_SECRETS === 'true';

/**
 * Returns the env var value when set.
 *
 * When the variable is missing:
 *   - Production:   always throws — secrets must be injected explicitly.
 *   - Any other env without ALLOW_INSECURE_DEV_SECRETS=true: throws with a
 *     hint to set the flag or supply the real value.
 *   - Any other env with ALLOW_INSECURE_DEV_SECRETS=true: emits a loud stderr
 *     warning and returns the insecure dev-only fallback.
 *
 * This means insecure fallbacks require an intentional opt-in even in
 * development, preventing accidental use of weak keys.
 */
export function requireSecret(envVar: string, devFallback: string): string {
  const value = process.env[envVar];
  if (value) return value;

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
    reviewsPerHour: 3,
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
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;
