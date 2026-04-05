import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeReviewEfficiencyMetrics,
  aggregateReviewEfficiency,
} from '@/modules/reports/reviewEfficiencyAggregator';
import type { ResolvedReport } from '@/modules/reports/reviewEfficiencyAggregator';

// ─── Helper ───────────────────────────────────────────────────────────────────

function hoursAgo(hours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

function makeResolved(resolvedAt: Date, moderationHours: number): ResolvedReport {
  return { createdAt: hoursAgo(moderationHours, resolvedAt), resolvedAt };
}

// ─── computeReviewEfficiencyMetrics ──────────────────────────────────────────

describe('computeReviewEfficiencyMetrics - flaggedCount / resolvedCount', () => {
  it('passes flaggedCount through unchanged', () => {
    const m = computeReviewEfficiencyMetrics(12, [], 0);
    expect(m.flaggedCount).toBe(12);
    expect(m.resolvedCount).toBe(0);
  });

  it('resolvedCount equals the number of resolved-report entries', () => {
    const now = new Date();
    const reports = [makeResolved(now, 2), makeResolved(now, 4)];
    const m = computeReviewEfficiencyMetrics(5, reports, 0);
    expect(m.resolvedCount).toBe(2);
    expect(m.flaggedCount).toBe(5);
  });
});

describe('computeReviewEfficiencyMetrics - avgModerationTimeHrs', () => {
  it('returns 0 when there are no resolved reports', () => {
    const m = computeReviewEfficiencyMetrics(3, [], 0);
    expect(m.avgModerationTimeHrs).toBe(0);
  });

  it('computes average correctly for a single report', () => {
    const now = new Date();
    const m = computeReviewEfficiencyMetrics(1, [makeResolved(now, 6)], 0);
    expect(m.avgModerationTimeHrs).toBeCloseTo(6, 5);
  });

  it('averages across multiple resolved reports', () => {
    const now = new Date();
    // 2 hrs and 4 hrs → average 3 hrs
    const reports = [makeResolved(now, 2), makeResolved(now, 4)];
    const m = computeReviewEfficiencyMetrics(2, reports, 0);
    expect(m.avgModerationTimeHrs).toBeCloseTo(3, 5);
  });

  it('handles fractional hours correctly', () => {
    const now = new Date();
    // 1.5 hrs and 2.5 hrs → average 2 hrs
    const reports = [makeResolved(now, 1.5), makeResolved(now, 2.5)];
    const m = computeReviewEfficiencyMetrics(2, reports, 0);
    expect(m.avgModerationTimeHrs).toBeCloseTo(2, 5);
  });

  it('handles a very fast resolution (sub-hour)', () => {
    const now = new Date();
    const reports = [makeResolved(now, 0.25)]; // 15 minutes
    const m = computeReviewEfficiencyMetrics(1, reports, 0);
    expect(m.avgModerationTimeHrs).toBeCloseTo(0.25, 5);
  });
});

describe('computeReviewEfficiencyMetrics - appealRate', () => {
  it('returns 0 when resolvedCount is 0 (no division by zero)', () => {
    const m = computeReviewEfficiencyMetrics(5, [], 3);
    expect(m.appealRate).toBe(0);
  });

  it('returns 0 when there are no appeals', () => {
    const now = new Date();
    const m = computeReviewEfficiencyMetrics(4, [makeResolved(now, 1)], 0);
    expect(m.appealRate).toBe(0);
  });

  it('computes rate as percentage: (appeals / resolved) * 100', () => {
    const now = new Date();
    // 1 appeal out of 4 resolved = 25%
    const reports = Array.from({ length: 4 }, () => makeResolved(now, 2));
    const m = computeReviewEfficiencyMetrics(4, reports, 1);
    expect(m.appealRate).toBeCloseTo(25, 5);
  });

  it('rate can exceed 100% when appeals > resolved', () => {
    // e.g. 3 appeals on 2 resolutions = 150%
    const now = new Date();
    const reports = [makeResolved(now, 1), makeResolved(now, 1)];
    const m = computeReviewEfficiencyMetrics(5, reports, 3);
    expect(m.appealRate).toBeCloseTo(150, 5);
  });

  it('rate is 100% when appeals equals resolved count', () => {
    const now = new Date();
    const reports = [makeResolved(now, 2)];
    const m = computeReviewEfficiencyMetrics(1, reports, 1);
    expect(m.appealRate).toBeCloseTo(100, 5);
  });
});

describe('computeReviewEfficiencyMetrics - all-zero input', () => {
  it('returns all zeros with no data', () => {
    const m = computeReviewEfficiencyMetrics(0, [], 0);
    expect(m.flaggedCount).toBe(0);
    expect(m.resolvedCount).toBe(0);
    expect(m.avgModerationTimeHrs).toBe(0);
    expect(m.appealRate).toBe(0);
  });
});

// ─── aggregateReviewEfficiency — mocked Prisma ───────────────────────────────

function makePrismaMock(overrides: {
  flaggedCount?: number;
  resolvedReports?: ResolvedReport[];
  appealsCount?: number;
}) {
  const flaggedCount = overrides.flaggedCount ?? 0;
  const resolvedReports = overrides.resolvedReports ?? [];
  const appealsCount = overrides.appealsCount ?? 0;

  const upsert = vi.fn().mockResolvedValue({});
  const reportCount = vi.fn().mockResolvedValue(flaggedCount);
  const reportFindMany = vi.fn().mockResolvedValue(resolvedReports);
  const appealCount = vi.fn().mockResolvedValue(appealsCount);

  const prisma = {
    report: { count: reportCount, findMany: reportFindMany },
    appeal: { count: appealCount },
    reportReviewEfficiency: { upsert },
  } as unknown as import('@prisma/client').PrismaClient;

  return { prisma, upsert, reportCount, reportFindMany, appealCount };
}

describe('aggregateReviewEfficiency - queries correct day window', () => {
  it('queries report.count with gte dayStart and lt dayEnd', async () => {
    const { prisma, reportCount } = makePrismaMock({});
    const date = new Date('2024-06-15T14:30:00.000Z');
    await aggregateReviewEfficiency(date, prisma);

    expect(reportCount).toHaveBeenCalledOnce();
    const { where } = reportCount.mock.calls[0][0];
    // Aggregator normalises to UTC midnight
    expect(where.createdAt.gte.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2024-06-16T00:00:00.000Z');
  });

  it('queries appeal.count with gte dayStart and lt dayEnd', async () => {
    const { prisma, appealCount } = makePrismaMock({});
    const date = new Date('2024-06-15T08:00:00.000Z');
    await aggregateReviewEfficiency(date, prisma);

    expect(appealCount).toHaveBeenCalledOnce();
    const { where } = appealCount.mock.calls[0][0];
    expect(where.createdAt.gte.toISOString()).toBe('2024-06-15T00:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2024-06-16T00:00:00.000Z');
  });

  it('queries report.findMany for resolvedAt in the day window', async () => {
    const { prisma, reportFindMany } = makePrismaMock({});
    const date = new Date('2024-06-15T00:00:00.000Z');
    await aggregateReviewEfficiency(date, prisma);

    expect(reportFindMany).toHaveBeenCalledOnce();
    const { where } = reportFindMany.mock.calls[0][0];
    expect(where.resolvedAt).toBeDefined();
    expect(where.resolvedAt.gte).toBeDefined();
    expect(where.resolvedAt.lt).toBeDefined();
  });
});

describe('aggregateReviewEfficiency - upsert behavior', () => {
  it('calls upsert with where: { date: UTC dayStart }', async () => {
    const { prisma, upsert } = makePrismaMock({ flaggedCount: 3 });
    const date = new Date('2024-06-15T10:00:00.000Z');
    await aggregateReviewEfficiency(date, prisma);

    expect(upsert).toHaveBeenCalledOnce();
    const { where } = upsert.mock.calls[0][0];
    expect(where.date.toISOString()).toBe('2024-06-15T00:00:00.000Z');
  });

  it('upsert create and update both receive the computed metrics', async () => {
    const now = new Date('2024-06-15T09:00:00.000Z');
    const resolvedReports = [makeResolved(now, 2), makeResolved(now, 4)];
    const { prisma, upsert } = makePrismaMock({
      flaggedCount: 10,
      resolvedReports,
      appealsCount: 1,
    });

    const date = new Date('2024-06-15T00:00:00.000Z');
    await aggregateReviewEfficiency(date, prisma);

    const call = upsert.mock.calls[0][0];
    expect(call.create.flaggedCount).toBe(10);
    expect(call.create.resolvedCount).toBe(2);
    expect(call.create.avgModerationTimeHrs).toBeCloseTo(3, 5);
    expect(call.create.appealRate).toBeCloseTo(50, 5); // 1/2 * 100

    expect(call.update.flaggedCount).toBe(call.create.flaggedCount);
    expect(call.update.resolvedCount).toBe(call.create.resolvedCount);
    expect(call.update.avgModerationTimeHrs).toBe(call.create.avgModerationTimeHrs);
    expect(call.update.appealRate).toBe(call.create.appealRate);
  });

  it('is idempotent — calling twice with same date produces identical upsert args', async () => {
    const now = new Date('2024-06-15T09:00:00.000Z');
    const resolvedReports = [makeResolved(now, 3)];
    const { prisma, upsert } = makePrismaMock({
      flaggedCount: 5,
      resolvedReports,
      appealsCount: 2,
    });

    const date = new Date('2024-06-15T00:00:00.000Z');
    await aggregateReviewEfficiency(date, prisma);
    await aggregateReviewEfficiency(date, prisma);

    expect(upsert).toHaveBeenCalledTimes(2);
    const [first, second] = upsert.mock.calls.map((c) => c[0]);
    expect(first.create.flaggedCount).toBe(second.create.flaggedCount);
    expect(first.create.resolvedCount).toBe(second.create.resolvedCount);
    expect(first.create.avgModerationTimeHrs).toBe(second.create.avgModerationTimeHrs);
    expect(first.create.appealRate).toBe(second.create.appealRate);
  });

  it('upserts zero-metrics row when there is no data for the day', async () => {
    const { prisma, upsert } = makePrismaMock({
      flaggedCount: 0,
      resolvedReports: [],
      appealsCount: 0,
    });
    const date = new Date('2024-06-15T00:00:00.000Z');
    await aggregateReviewEfficiency(date, prisma);

    const { create } = upsert.mock.calls[0][0];
    expect(create.flaggedCount).toBe(0);
    expect(create.resolvedCount).toBe(0);
    expect(create.avgModerationTimeHrs).toBe(0);
    expect(create.appealRate).toBe(0);
  });
});
