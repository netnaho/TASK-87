export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL || 'mysql://harborops:harborops_pass@localhost:3306/harborops',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'harborops-jwt-secret-change-in-production-2024',
    expiresIn: '24h',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
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
