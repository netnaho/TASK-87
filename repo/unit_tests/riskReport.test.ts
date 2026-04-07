import { describe, it, expect, vi } from 'vitest';
import {
  computeHideRemoveRate,
  computeAppealOverturnRate,
  computeRepeatOffenderCount,
  buildAuthorActionMap,
  fetchRiskDay,
} from '@/modules/reports/riskReportAggregator';

// ─── computeHideRemoveRate ────────────────────────────────────────────────────

describe('computeHideRemoveRate — zero denominator guard', () => {
  it('returns 0 when there are no actions', () => {
    expect(computeHideRemoveRate(0, 0)).toBe(0);
  });

  it('returns 0 when hideRemoveCount is 0 but actions exist', () => {
    expect(computeHideRemoveRate(0, 5)).toBe(0);
  });
});

describe('computeHideRemoveRate — normal cases', () => {
  it('returns 100 when all actions are HIDE/REMOVE', () => {
    expect(computeHideRemoveRate(4, 4)).toBeCloseTo(100, 5);
  });

  it('returns 50 when half of actions are HIDE/REMOVE', () => {
    expect(computeHideRemoveRate(2, 4)).toBeCloseTo(50, 5);
  });

  it('returns 25 for one out of four actions', () => {
    expect(computeHideRemoveRate(1, 4)).toBeCloseTo(25, 5);
  });

  it('handles fractional percentages correctly', () => {
    // 1 of 3 = 33.333...%
    expect(computeHideRemoveRate(1, 3)).toBeCloseTo(33.333, 2);
  });

  it('can exceed 100% if input data is inconsistent (no internal clamp)', () => {
    // hideRemove > total would be a data error, but function shouldn't throw
    expect(computeHideRemoveRate(5, 3)).toBeCloseTo(166.667, 2);
  });
});

// ─── computeAppealOverturnRate ────────────────────────────────────────────────

describe('computeAppealOverturnRate — zero denominator guard', () => {
  it('returns 0 when there are no finalised appeals', () => {
    expect(computeAppealOverturnRate(0, 0)).toBe(0);
  });

  it('returns 0 when finalised appeals exist but none overturned', () => {
    expect(computeAppealOverturnRate(0, 5)).toBe(0);
  });
});

describe('computeAppealOverturnRate — normal cases', () => {
  it('returns 100 when all finalised appeals are overturned', () => {
    expect(computeAppealOverturnRate(3, 3)).toBeCloseTo(100, 5);
  });

  it('returns 50 when half of finalised appeals are overturned', () => {
    expect(computeAppealOverturnRate(2, 4)).toBeCloseTo(50, 5);
  });

  it('returns 25 for one overturned out of four finalised', () => {
    expect(computeAppealOverturnRate(1, 4)).toBeCloseTo(25, 5);
  });

  it('handles a single appeal correctly', () => {
    expect(computeAppealOverturnRate(1, 1)).toBeCloseTo(100, 5);
  });
});

// ─── computeRepeatOffenderCount ───────────────────────────────────────────────

describe('computeRepeatOffenderCount — empty map', () => {
  it('returns 0 for an empty map', () => {
    expect(computeRepeatOffenderCount(new Map())).toBe(0);
  });
});

describe('computeRepeatOffenderCount — no repeat offenders', () => {
  it('returns 0 when all authors have exactly 1 action', () => {
    const map = new Map([[1, 1], [2, 1], [3, 1]]);
    expect(computeRepeatOffenderCount(map)).toBe(0);
  });
});

describe('computeRepeatOffenderCount — mixed authors', () => {
  it('counts only authors with ≥2 actions', () => {
    // authors 1 and 3 are repeat offenders; author 2 is not
    const map = new Map([[1, 3], [2, 1], [3, 2]]);
    expect(computeRepeatOffenderCount(map)).toBe(2);
  });

  it('counts an author with exactly 2 actions as a repeat offender', () => {
    const map = new Map([[42, 2]]);
    expect(computeRepeatOffenderCount(map)).toBe(1);
  });

  it('does not count an author with exactly 1 action', () => {
    const map = new Map([[42, 1]]);
    expect(computeRepeatOffenderCount(map)).toBe(0);
  });

  it('handles all authors being repeat offenders', () => {
    const map = new Map([[1, 5], [2, 2], [3, 10]]);
    expect(computeRepeatOffenderCount(map)).toBe(3);
  });
});

// ─── buildAuthorActionMap — mocked Prisma ────────────────────────────────────

function makePrismaForAuthorMap(
  actions: Array<{ report: { review: { reviewerId: number } | null } | null }>
) {
  const findMany = vi.fn().mockResolvedValue(actions);
  return {
    prisma: { moderationAction: { findMany } } as unknown as import('@prisma/client').PrismaClient,
    findMany,
  };
}

describe('buildAuthorActionMap — empty results', () => {
  it('returns an empty map when there are no actions', async () => {
    const { prisma } = makePrismaForAuthorMap([]);
    const map = await buildAuthorActionMap(new Date(), new Date(), prisma);
    expect(map.size).toBe(0);
  });
});

describe('buildAuthorActionMap — with actions', () => {
  it('counts actions per author correctly', async () => {
    const actions = [
      { report: { review: { reviewerId: 1 } } },
      { report: { review: { reviewerId: 1 } } },
      { report: { review: { reviewerId: 2 } } },
    ];
    const { prisma } = makePrismaForAuthorMap(actions);
    const map = await buildAuthorActionMap(new Date(), new Date(), prisma);
    expect(map.get(1)).toBe(2);
    expect(map.get(2)).toBe(1);
  });

  it('skips actions where report or review is null', async () => {
    const actions = [
      { report: null },
      { report: { review: null } },
      { report: { review: { reviewerId: 5 } } },
    ];
    const { prisma } = makePrismaForAuthorMap(actions);
    const map = await buildAuthorActionMap(new Date(), new Date(), prisma);
    expect(map.size).toBe(1);
    expect(map.get(5)).toBe(1);
  });

  it('queries with correct HIDE/REMOVE filter and day window', async () => {
    const { prisma, findMany } = makePrismaForAuthorMap([]);
    const start = new Date('2024-09-01T00:00:00.000Z');
    const end = new Date('2024-09-30T00:00:00.000Z');
    await buildAuthorActionMap(start, end, prisma);

    const { where } = findMany.mock.calls[0][0];
    expect(where.action.in).toContain('HIDE');
    expect(where.action.in).toContain('REMOVE');
    expect(where.createdAt.gte).toBe(start);
    expect(where.createdAt.lt).toBe(end);
  });
});

// ─── fetchRiskDay — mocked Prisma ────────────────────────────────────────────

function makePrismaForFetchRiskDay(opts: {
  flaggedCount?: number;
  actionRows?: Array<{ action: string; _count: { action: number } }>;
  appealRows?: Array<{ status: string }>;
}) {
  const reportCount = vi.fn().mockResolvedValue(opts.flaggedCount ?? 0);
  const actionGroupBy = vi.fn().mockResolvedValue(opts.actionRows ?? []);
  const appealFindMany = vi.fn().mockResolvedValue(opts.appealRows ?? []);

  const prisma = {
    report: { count: reportCount },
    moderationAction: { groupBy: actionGroupBy },
    appeal: { findMany: appealFindMany },
  } as unknown as import('@prisma/client').PrismaClient;

  return { prisma, reportCount, actionGroupBy, appealFindMany };
}

describe('fetchRiskDay — zero activity day', () => {
  it('returns all zeros when there is no data', async () => {
    const { prisma } = makePrismaForFetchRiskDay({});
    const raw = await fetchRiskDay(new Date(), new Date(), prisma);
    expect(raw.flaggedContentCount).toBe(0);
    expect(raw.totalActionCount).toBe(0);
    expect(raw.hideRemoveActionCount).toBe(0);
    expect(raw.finalisedAppeals).toBe(0);
    expect(raw.overturnedAppeals).toBe(0);
  });
});

describe('fetchRiskDay — action aggregation', () => {
  it('sums totalActionCount across all action types', async () => {
    const { prisma } = makePrismaForFetchRiskDay({
      actionRows: [
        { action: 'WARN', _count: { action: 3 } },
        { action: 'HIDE', _count: { action: 2 } },
        { action: 'REMOVE', _count: { action: 1 } },
      ],
    });
    const raw = await fetchRiskDay(new Date(), new Date(), prisma);
    expect(raw.totalActionCount).toBe(6);
    expect(raw.hideRemoveActionCount).toBe(3);
  });

  it('counts only HIDE and REMOVE in hideRemoveActionCount', async () => {
    const { prisma } = makePrismaForFetchRiskDay({
      actionRows: [
        { action: 'WARN', _count: { action: 5 } },
        { action: 'RESTORE', _count: { action: 2 } },
      ],
    });
    const raw = await fetchRiskDay(new Date(), new Date(), prisma);
    expect(raw.hideRemoveActionCount).toBe(0);
    expect(raw.totalActionCount).toBe(7);
  });
});

describe('fetchRiskDay — appeal aggregation', () => {
  it('separates OVERTURNED from UPHELD correctly', async () => {
    const { prisma } = makePrismaForFetchRiskDay({
      appealRows: [
        { status: 'OVERTURNED' },
        { status: 'OVERTURNED' },
        { status: 'UPHELD' },
      ],
    });
    const raw = await fetchRiskDay(new Date(), new Date(), prisma);
    expect(raw.finalisedAppeals).toBe(3);
    expect(raw.overturnedAppeals).toBe(2);
  });

  it('queries appeal with UPHELD/OVERTURNED status filter', async () => {
    const { prisma, appealFindMany } = makePrismaForFetchRiskDay({});
    const dayStart = new Date('2024-09-15T00:00:00.000Z');
    const dayEnd = new Date('2024-09-16T00:00:00.000Z');
    await fetchRiskDay(dayStart, dayEnd, prisma);

    const { where } = appealFindMany.mock.calls[0][0];
    expect(where.status.in).toContain('UPHELD');
    expect(where.status.in).toContain('OVERTURNED');
    expect(where.resolvedAt.gte).toEqual(dayStart);
    expect(where.resolvedAt.lt).toEqual(dayEnd);
  });

  it('uses flaggedContentCount from report.count', async () => {
    const { prisma } = makePrismaForFetchRiskDay({ flaggedCount: 7 });
    const raw = await fetchRiskDay(new Date(), new Date(), prisma);
    expect(raw.flaggedContentCount).toBe(7);
  });
});

// ─── Integration: end-to-end formula composition ─────────────────────────────

describe('full risk metrics composition', () => {
  it('correctly computes all metrics from typical day data', () => {
    // 5 HIDE/REMOVE out of 8 total actions = 62.5%
    const hideRemoveRate = computeHideRemoveRate(5, 8);
    expect(hideRemoveRate).toBeCloseTo(62.5, 5);

    // 2 overturned out of 5 finalised = 40%
    const appealOverturnRate = computeAppealOverturnRate(2, 5);
    expect(appealOverturnRate).toBeCloseTo(40, 5);

    // 3 authors with ≥2 actions each
    const map = new Map([[1, 3], [2, 2], [3, 5], [4, 1]]);
    const repeatOffenders = computeRepeatOffenderCount(map);
    expect(repeatOffenders).toBe(3);
  });

  it('all metrics return 0 on a completely empty day (no exceptions)', () => {
    expect(computeHideRemoveRate(0, 0)).toBe(0);
    expect(computeAppealOverturnRate(0, 0)).toBe(0);
    expect(computeRepeatOffenderCount(new Map())).toBe(0);
  });
});
