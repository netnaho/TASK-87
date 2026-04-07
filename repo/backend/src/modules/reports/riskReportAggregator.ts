import type { PrismaClient } from '@prisma/client';

// ─── Pure formula functions (no I/O; safe to unit-test without Prisma) ───────

/**
 * HIDE/REMOVE rate — percentage of moderation actions that permanently restrict
 * content (HIDE or REMOVE), as opposed to softer actions (WARN, RESTORE).
 *
 *   hideRemoveRate = count(HIDE + REMOVE) / count(all actions) × 100
 *
 * Returns 0 when there are no actions (denominator guard).
 */
export function computeHideRemoveRate(
  hideRemoveCount: number,
  totalActionCount: number,
): number {
  if (totalActionCount === 0) return 0;
  return (hideRemoveCount / totalActionCount) * 100;
}

/**
 * Appeal overturn rate — percentage of finalised appeals that were decided in
 * the appellant's favour (OVERTURNED), indicating a moderation error.
 *
 *   appealOverturnRate = count(OVERTURNED) / count(UPHELD + OVERTURNED) × 100
 *
 * Returns 0 when there are no finalised appeals (denominator guard).
 */
export function computeAppealOverturnRate(
  overturnedCount: number,
  finalisedAppealCount: number,
): number {
  if (finalisedAppealCount === 0) return 0;
  return (overturnedCount / finalisedAppealCount) * 100;
}

/**
 * Repeat-offender count — number of distinct review authors who received 2 or
 * more HIDE or REMOVE actions on their content within the supplied window.
 *
 * Accepts a pre-built map of authorId → actionCount so the function stays pure.
 * Returns 0 when the map is empty.
 */
export function computeRepeatOffenderCount(
  authorActionCounts: Map<number, number>,
): number {
  let count = 0;
  for (const n of authorActionCounts.values()) {
    if (n >= 2) count++;
  }
  return count;
}

// ─── Data-fetching helpers ────────────────────────────────────────────────────

/**
 * Build a map of { authorId → hide/remove action count } for all HIDE/REMOVE
 * moderation actions on review-type content within [windowStart, windowEnd).
 *
 * Returns an empty Map when there is no data, ensuring callers are safe to call
 * computeRepeatOffenderCount() on the result without extra guards.
 */
export async function buildAuthorActionMap(
  windowStart: Date,
  windowEnd: Date,
  prisma: PrismaClient,
): Promise<Map<number, number>> {
  const p = prisma as any;

  const actions: Array<{
    report: { review: { authorId: number } | null } | null;
  }> = await p.moderationAction.findMany({
    where: {
      action: { in: ['HIDE', 'REMOVE'] },
      createdAt: { gte: windowStart, lt: windowEnd },
      report: { reviewId: { not: null } },
    },
    select: {
      report: {
        select: { review: { select: { authorId: true } } },
      },
    },
  });

  const map = new Map<number, number>();
  for (const a of actions) {
    const authorId = a.report?.review?.authorId;
    if (authorId !== undefined && authorId !== null) {
      map.set(authorId, (map.get(authorId) ?? 0) + 1);
    }
  }
  return map;
}

// ─── Per-day data shape returned by fetchRiskDay ─────────────────────────────

export interface RiskDayRaw {
  flaggedContentCount: number;
  totalActionCount: number;
  hideRemoveActionCount: number;
  finalisedAppeals: number;
  overturnedAppeals: number;
}

/**
 * Fetch the four raw counts needed to compute risk metrics for a single
 * UTC calendar day [dayStart, dayEnd).
 *
 * Accepts `prisma` as a parameter so tests can inject a mock.
 */
export async function fetchRiskDay(
  dayStart: Date,
  dayEnd: Date,
  prisma: PrismaClient,
): Promise<RiskDayRaw> {
  const p = prisma as any;

  const [flaggedContentCount, actionRows, finalisedAppeals] = await Promise.all([
    p.report.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }) as Promise<number>,

    p.moderationAction.groupBy({
      by: ['action'],
      _count: { action: true },
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    }) as Promise<Array<{ action: string; _count: { action: number } }>>,

    p.appeal.findMany({
      where: {
        resolvedAt: { gte: dayStart, lt: dayEnd },
        status: { in: ['UPHELD', 'OVERTURNED'] },
      },
      select: { status: true },
    }) as Promise<Array<{ status: string }>>,
  ]);

  const totalActionCount = actionRows.reduce((s, r) => s + r._count.action, 0);
  const hideRemoveActionCount = actionRows
    .filter((r) => r.action === 'HIDE' || r.action === 'REMOVE')
    .reduce((s, r) => s + r._count.action, 0);

  const overturnedAppeals = finalisedAppeals.filter(
    (a) => a.status === 'OVERTURNED',
  ).length;

  return {
    flaggedContentCount,
    totalActionCount,
    hideRemoveActionCount,
    finalisedAppeals: finalisedAppeals.length,
    overturnedAppeals,
  };
}
