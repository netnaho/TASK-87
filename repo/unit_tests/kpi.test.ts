import { describe, it, expect, vi } from 'vitest';
import {
  computeAov,
  computeRepurchaseRate,
  computeRefundRate,
  aggregateKpiDaily,
} from '@/lib/kpiDailyAggregator';
import type { KpiIssueRow } from '@/lib/kpiDailyAggregator';

// ─── computeAov ──────────────────────────────────────────────────────────────

describe('computeAov — empty input', () => {
  it('returns 0 when there are no issue rows', () => {
    expect(computeAov([])).toBe(0);
  });
});

describe('computeAov — single row', () => {
  it('computes value × quantity for a single row', () => {
    const rows: KpiIssueRow[] = [{ quantity: 3, unitPrice: 10 }];
    // total value = 3*10 = 30 / 1 row = 30
    expect(computeAov(rows)).toBeCloseTo(30, 5);
  });

  it('uses absolute quantity (negative quantity issue)', () => {
    // ISSUE movements recorded as negative in some ledger styles
    const rows: KpiIssueRow[] = [{ quantity: -4, unitPrice: 5 }];
    // |−4| * 5 = 20 / 1 = 20
    expect(computeAov(rows)).toBeCloseTo(20, 5);
  });

  it('treats null unitPrice as zero value (item contributes to denominator)', () => {
    const rows: KpiIssueRow[] = [{ quantity: 10, unitPrice: null }];
    // 10 * 0 = 0 / 1 = 0
    expect(computeAov(rows)).toBeCloseTo(0, 5);
  });
});

describe('computeAov — multiple rows', () => {
  it('averages total value across all rows', () => {
    const rows: KpiIssueRow[] = [
      { quantity: 2, unitPrice: 10 }, // value = 20
      { quantity: 5, unitPrice: 4 },  // value = 20
    ];
    // total = 40 / 2 = 20
    expect(computeAov(rows)).toBeCloseTo(20, 5);
  });

  it('null-price rows reduce AOV (zero contribution to numerator, kept in denominator)', () => {
    const rows: KpiIssueRow[] = [
      { quantity: 2, unitPrice: 30 },  // value = 60
      { quantity: 5, unitPrice: null }, // value = 0
    ];
    // total = 60 / 2 = 30
    expect(computeAov(rows)).toBeCloseTo(30, 5);
  });

  it('handles mixed positive and negative quantities', () => {
    const rows: KpiIssueRow[] = [
      { quantity: 3, unitPrice: 10 },  // |3|*10 = 30
      { quantity: -2, unitPrice: 10 }, // |−2|*10 = 20
    ];
    // total = 50 / 2 = 25
    expect(computeAov(rows)).toBeCloseTo(25, 5);
  });

  it('handles fractional unit prices', () => {
    const rows: KpiIssueRow[] = [
      { quantity: 4, unitPrice: 1.25 }, // 5.00
      { quantity: 2, unitPrice: 2.50 }, // 5.00
    ];
    // total = 10 / 2 = 5
    expect(computeAov(rows)).toBeCloseTo(5, 5);
  });
});

// ─── computeRepurchaseRate ────────────────────────────────────────────────────

describe('computeRepurchaseRate — zero dau', () => {
  it('returns 0 when no active users on the target day (avoids division-by-zero)', () => {
    expect(computeRepurchaseRate([], new Set([1, 2, 3]))).toBe(0);
  });

  it('returns 0 when both sets are empty', () => {
    expect(computeRepurchaseRate([], new Set())).toBe(0);
  });
});

describe('computeRepurchaseRate — no prior active users', () => {
  it('returns 0 when no prior users (all new)', () => {
    expect(computeRepurchaseRate([1, 2, 3], new Set())).toBe(0);
  });

  it('returns 0 when prior set has no overlap with today', () => {
    expect(computeRepurchaseRate([1, 2, 3], new Set([4, 5, 6]))).toBe(0);
  });
});

describe('computeRepurchaseRate — partial overlap', () => {
  it('returns 50% when half of today\'s users were also active before', () => {
    // 2 of 4 returning
    expect(computeRepurchaseRate([1, 2, 3, 4], new Set([1, 2]))).toBeCloseTo(50, 5);
  });

  it('returns 25% with one returning user out of four', () => {
    expect(computeRepurchaseRate([1, 2, 3, 4], new Set([1]))).toBeCloseTo(25, 5);
  });

  it('returns 100% when all today\'s users were also active before', () => {
    expect(computeRepurchaseRate([1, 2, 3], new Set([1, 2, 3, 4, 5]))).toBeCloseTo(100, 5);
  });
});

describe('computeRepurchaseRate — single user', () => {
  it('returns 100 for one returning user', () => {
    expect(computeRepurchaseRate([42], new Set([42]))).toBeCloseTo(100, 5);
  });

  it('returns 0 for one new user', () => {
    expect(computeRepurchaseRate([42], new Set([99]))).toBe(0);
  });
});

// ─── computeRefundRate ───────────────────────────────────────────────────────

describe('computeRefundRate — zero issues (denominator guard)', () => {
  it('returns 0 when there are no ISSUE movements (avoids division-by-zero)', () => {
    expect(computeRefundRate(5, 0)).toBe(0);
  });

  it('returns 0 when both counts are zero', () => {
    expect(computeRefundRate(0, 0)).toBe(0);
  });
});

describe('computeRefundRate — no adjustments', () => {
  it('returns 0 when negative adjustment count is zero', () => {
    expect(computeRefundRate(0, 10)).toBe(0);
  });
});

describe('computeRefundRate — normal cases', () => {
  it('computes rate as percentage: negAdj / issues × 100', () => {
    // 2 negative adjustments / 8 issues = 25%
    expect(computeRefundRate(2, 8)).toBeCloseTo(25, 5);
  });

  it('returns 100% when negative adjustments equal issue count', () => {
    expect(computeRefundRate(5, 5)).toBeCloseTo(100, 5);
  });

  it('rate can exceed 100% when adjustments > issues', () => {
    // 3 adjustments / 1 issue = 300%
    expect(computeRefundRate(3, 1)).toBeCloseTo(300, 5);
  });

  it('returns 10% for one adjustment out of ten issues', () => {
    expect(computeRefundRate(1, 10)).toBeCloseTo(10, 5);
  });
});

// ─── aggregateKpiDaily — mocked Prisma ───────────────────────────────────────

interface MockPrismaOptions {
  dauRows?: Array<{ userId: number }>;
  issueLedgerRows?: Array<{ quantity: number; item: { unitPrice: number | null } }>;
  avgOnHand?: number | null;
  priorRows?: Array<{ userId: number }>;
  negativeAdjustmentCount?: number;
}

function makeMockPrisma(opts: MockPrismaOptions = {}) {
  const {
    dauRows = [],
    issueLedgerRows = [],
    avgOnHand = 100,
    priorRows = [],
    negativeAdjustmentCount = 0,
  } = opts;

  const upsert = vi.fn().mockResolvedValue({});
  const inventoryLedgerFindMany = vi.fn().mockResolvedValue(issueLedgerRows);
  const inventoryLedgerCount = vi.fn().mockResolvedValue(negativeAdjustmentCount);
  const stockLevelAggregate = vi.fn().mockResolvedValue({ _avg: { onHand: avgOnHand } });

  // rateLimitLog.groupBy is called twice per aggregateKpiDaily run:
  //   odd calls  → dauRows  (the target day's active users)
  //   even calls → priorRows (the prior 30-day window)
  // Using a counter-based implementation ensures consistent behavior even when
  // aggregateKpiDaily is invoked multiple times in the same test.
  let groupByCallCount = 0;
  const rateLimitLogGroupBy = vi.fn().mockImplementation(() => {
    groupByCallCount++;
    return Promise.resolve(groupByCallCount % 2 === 1 ? dauRows : priorRows);
  });

  const prisma = {
    rateLimitLog: { groupBy: rateLimitLogGroupBy },
    inventoryLedger: { findMany: inventoryLedgerFindMany, count: inventoryLedgerCount },
    stockLevel: { aggregate: stockLevelAggregate },
    kpiDaily: { upsert },
  } as unknown as import('@prisma/client').PrismaClient;

  return { prisma, upsert, rateLimitLogGroupBy, inventoryLedgerFindMany, inventoryLedgerCount, stockLevelAggregate };
}

describe('aggregateKpiDaily — day window queries', () => {
  it('queries rateLimitLog with UTC dayStart..dayEnd for DAU', async () => {
    const { prisma, rateLimitLogGroupBy } = makeMockPrisma();
    const date = new Date('2024-08-20T14:00:00.000Z');
    await aggregateKpiDaily(date, prisma);

    const firstCall = rateLimitLogGroupBy.mock.calls[0][0];
    expect(firstCall.where.createdAt.gte.toISOString()).toBe('2024-08-20T00:00:00.000Z');
    expect(firstCall.where.createdAt.lt.toISOString()).toBe('2024-08-21T00:00:00.000Z');
  });

  it('queries rateLimitLog for prior 30-day window (not overlapping day window)', async () => {
    const { prisma, rateLimitLogGroupBy } = makeMockPrisma();
    const date = new Date('2024-08-20T00:00:00.000Z');
    await aggregateKpiDaily(date, prisma);

    // Second groupBy call is the prior-period query
    const priorCall = rateLimitLogGroupBy.mock.calls[1][0];
    expect(priorCall.where.createdAt.gte.toISOString()).toBe('2024-07-21T00:00:00.000Z'); // -30 days
    expect(priorCall.where.createdAt.lt.toISOString()).toBe('2024-08-20T00:00:00.000Z');  // < dayStart
  });

  it('queries inventoryLedger with movementType ISSUE and day window', async () => {
    const { prisma, inventoryLedgerFindMany } = makeMockPrisma();
    const date = new Date('2024-08-20T00:00:00.000Z');
    await aggregateKpiDaily(date, prisma);

    expect(inventoryLedgerFindMany).toHaveBeenCalledOnce();
    const { where } = inventoryLedgerFindMany.mock.calls[0][0];
    expect(where.movementType).toBe('ISSUE');
    expect(where.createdAt.gte.toISOString()).toBe('2024-08-20T00:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2024-08-21T00:00:00.000Z');
  });

  it('queries inventoryLedger count with movementType ADJUSTMENT and qty < 0', async () => {
    const { prisma, inventoryLedgerCount } = makeMockPrisma();
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);

    expect(inventoryLedgerCount).toHaveBeenCalledOnce();
    const { where } = inventoryLedgerCount.mock.calls[0][0];
    expect(where.movementType).toBe('ADJUSTMENT');
    expect(where.quantity.lt).toBe(0);
  });
});

describe('aggregateKpiDaily — upsert behavior', () => {
  it('calls upsert with where: { date: UTC dayStart }', async () => {
    const { prisma, upsert } = makeMockPrisma();
    const date = new Date('2024-08-20T10:30:00.000Z');
    await aggregateKpiDaily(date, prisma);

    expect(upsert).toHaveBeenCalledOnce();
    const { where } = upsert.mock.calls[0][0];
    expect(where.date.toISOString()).toBe('2024-08-20T00:00:00.000Z');
  });

  it('upsert create and update both contain all five KPI fields', async () => {
    const { prisma, upsert } = makeMockPrisma({
      dauRows: [{ userId: 1 }],
      issueLedgerRows: [{ quantity: 2, item: { unitPrice: 10 } }],
      avgOnHand: 50,
      priorRows: [{ userId: 1 }],
      negativeAdjustmentCount: 1,
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);

    const { create, update } = upsert.mock.calls[0][0];
    for (const payload of [create, update]) {
      expect(payload).toHaveProperty('dau');
      expect(payload).toHaveProperty('conversionRate');
      expect(payload).toHaveProperty('aov');
      expect(payload).toHaveProperty('repurchaseRate');
      expect(payload).toHaveProperty('refundRate');
    }
    // Verify update mirrors create
    expect(update.dau).toBe(create.dau);
    expect(update.aov).toBe(create.aov);
    expect(update.repurchaseRate).toBe(create.repurchaseRate);
    expect(update.refundRate).toBe(create.refundRate);
  });

  it('is idempotent — calling twice with same date produces identical upsert args', async () => {
    const { prisma, upsert } = makeMockPrisma({
      dauRows: [{ userId: 1 }, { userId: 2 }],
      issueLedgerRows: [{ quantity: 3, item: { unitPrice: 5 } }],
    });
    const date = new Date('2024-08-20');
    await aggregateKpiDaily(date, prisma);
    await aggregateKpiDaily(date, prisma);

    expect(upsert).toHaveBeenCalledTimes(2);
    const [first, second] = upsert.mock.calls.map((c) => c[0]);
    expect(first.create.dau).toBe(second.create.dau);
    expect(first.create.aov).toBe(second.create.aov);
    expect(first.create.repurchaseRate).toBe(second.create.repurchaseRate);
    expect(first.create.refundRate).toBe(second.create.refundRate);
  });
});

describe('aggregateKpiDaily — zero-data fallback (no activity on day)', () => {
  it('writes zeros for all KPI fields when there is no data', async () => {
    const { prisma, upsert } = makeMockPrisma({
      dauRows: [],
      issueLedgerRows: [],
      avgOnHand: null,
      priorRows: [],
      negativeAdjustmentCount: 0,
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);

    const { create } = upsert.mock.calls[0][0];
    expect(create.dau).toBe(0);
    expect(create.aov).toBe(0);
    expect(create.repurchaseRate).toBe(0);
    expect(create.refundRate).toBe(0);
  });
});

describe('aggregateKpiDaily — computed field values', () => {
  it('dau equals number of distinct userId entries in rateLimitLog', async () => {
    const { prisma, upsert } = makeMockPrisma({
      dauRows: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);
    expect(upsert.mock.calls[0][0].create.dau).toBe(3);
  });

  it('aov is computed from issue rows via computeAov', async () => {
    const { prisma, upsert } = makeMockPrisma({
      issueLedgerRows: [
        { quantity: 2, item: { unitPrice: 10 } },
        { quantity: 4, item: { unitPrice: 5 } },
      ],
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);
    // (2*10 + 4*5) / 2 = (20 + 20) / 2 = 20
    expect(upsert.mock.calls[0][0].create.aov).toBeCloseTo(20, 5);
  });

  it('repurchaseRate is 100% when all active users were also active before', async () => {
    const { prisma, upsert } = makeMockPrisma({
      dauRows: [{ userId: 1 }, { userId: 2 }],
      priorRows: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);
    expect(upsert.mock.calls[0][0].create.repurchaseRate).toBeCloseTo(100, 5);
  });

  it('repurchaseRate is 50% when half returning', async () => {
    const { prisma, upsert } = makeMockPrisma({
      dauRows: [{ userId: 1 }, { userId: 2 }],
      priorRows: [{ userId: 1 }],
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);
    expect(upsert.mock.calls[0][0].create.repurchaseRate).toBeCloseTo(50, 5);
  });

  it('refundRate is 25% for one adjustment out of four issues', async () => {
    const { prisma, upsert } = makeMockPrisma({
      issueLedgerRows: [
        { quantity: 1, item: { unitPrice: 5 } },
        { quantity: 1, item: { unitPrice: 5 } },
        { quantity: 1, item: { unitPrice: 5 } },
        { quantity: 1, item: { unitPrice: 5 } },
      ],
      negativeAdjustmentCount: 1,
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);
    expect(upsert.mock.calls[0][0].create.refundRate).toBeCloseTo(25, 5);
  });

  it('refundRate is 0 when there are no ISSUE movements even with adjustments', async () => {
    const { prisma, upsert } = makeMockPrisma({
      issueLedgerRows: [],
      negativeAdjustmentCount: 3,
    });
    await aggregateKpiDaily(new Date('2024-08-20'), prisma);
    expect(upsert.mock.calls[0][0].create.refundRate).toBe(0);
  });
});
