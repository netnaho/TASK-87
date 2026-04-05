import type { PrismaClient } from '@prisma/client';
import { logger } from '../../lib/logger';

export interface ResolvedReport {
  createdAt: Date;
  resolvedAt: Date;
}

export interface EfficiencyMetrics {
  avgModerationTimeHrs: number;
  flaggedCount: number;
  resolvedCount: number;
  /** Percentage 0–100: (appealsCount / resolvedCount) * 100 */
  appealRate: number;
}

/**
 * Pure function — computes the four review-efficiency metrics from raw counts.
 * No I/O; safe to unit-test without Prisma.
 */
export function computeReviewEfficiencyMetrics(
  flaggedCount: number,
  resolvedReports: ResolvedReport[],
  appealsCount: number,
): EfficiencyMetrics {
  const resolvedCount = resolvedReports.length;

  let totalHrs = 0;
  for (const r of resolvedReports) {
    const diffMs = r.resolvedAt.getTime() - r.createdAt.getTime();
    totalHrs += diffMs / (1000 * 60 * 60);
  }
  const avgModerationTimeHrs =
    resolvedCount > 0 ? totalHrs / resolvedCount : 0;

  const appealRate =
    resolvedCount > 0 ? (appealsCount / resolvedCount) * 100 : 0;

  return {
    avgModerationTimeHrs,
    flaggedCount,
    resolvedCount,
    appealRate,
  };
}

/**
 * Fetches the raw data for `date`'s day window, computes the four metrics,
 * and idempotently upserts one row into `report_review_efficiency`.
 *
 * Accepts `prisma` as a parameter so callers (and tests) can inject it.
 */
export async function aggregateReviewEfficiency(
  date: Date,
  prisma: PrismaClient,
): Promise<void> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const [flaggedCount, resolvedReports, appealsCount] = await Promise.all([
    prisma.report.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.report.findMany({
      where: { resolvedAt: { gte: dayStart, lt: dayEnd } },
      select: { createdAt: true, resolvedAt: true },
    }) as Promise<ResolvedReport[]>,
    prisma.appeal.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }),
  ]);

  const metrics = computeReviewEfficiencyMetrics(
    flaggedCount,
    resolvedReports,
    appealsCount,
  );

  logger.info(
    {
      date: dayStart.toISOString().slice(0, 10),
      flaggedCount: metrics.flaggedCount,
      resolvedCount: metrics.resolvedCount,
      avgModerationTimeHrs: metrics.avgModerationTimeHrs.toFixed(2),
      appealRate: metrics.appealRate.toFixed(2),
    },
    'review-efficiency aggregation computed',
  );

  await prisma.reportReviewEfficiency.upsert({
    where: { date: dayStart },
    create: {
      date: dayStart,
      avgModerationTimeHrs: metrics.avgModerationTimeHrs,
      flaggedCount: metrics.flaggedCount,
      resolvedCount: metrics.resolvedCount,
      appealRate: metrics.appealRate,
    },
    update: {
      avgModerationTimeHrs: metrics.avgModerationTimeHrs,
      flaggedCount: metrics.flaggedCount,
      resolvedCount: metrics.resolvedCount,
      appealRate: metrics.appealRate,
    },
  });
}
