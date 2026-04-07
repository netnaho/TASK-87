import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    serviceInteraction: { findUnique: vi.fn() },
    taskRating: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    trustScore: { findUnique: vi.fn() },
    creditRule: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { trustService, getCreditRules, setCreditRules, resetCreditRules } from '@/modules/trust/trust.service';

// ─── tx mock used in every transaction-touching test ─────────────────────────

const txMock = {
  taskRating: { create: vi.fn().mockResolvedValue({}) },
  trustScore: {
    findUnique: vi.fn(),
    upsert: vi.fn().mockResolvedValue({}),
  },
  creditHistory: { create: vi.fn().mockResolvedValue({}) },
};

function setupPassingInteraction(
  raterId: number,
  rateeId: number,
  currentScore = 50
) {
  // Empty credit_rules table → getCreditRules() returns hardcoded defaults
  vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue({
    id: 1,
    requesterId: raterId,
    providerId: rateeId,
    status: 'COMPLETED',
  } as any);
  vi.mocked(prisma.taskRating.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: rateeId } as any);
  txMock.trustScore.findUnique.mockResolvedValue(
    currentScore !== null ? { score: String(currentScore) } : null
  );
  vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMock));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty credit_rules table → fallback to hardcoded defaults
  vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.creditRule.deleteMany).mockResolvedValue({ count: 0 } as any);
  // Reset tx mock fns each test
  txMock.taskRating.create.mockResolvedValue({});
  txMock.trustScore.upsert.mockResolvedValue({});
  txMock.creditHistory.create.mockResolvedValue({});
});

// ─── Self-rating prevention ────────────────────────────────────────────────────

describe('Trust - Self-rating Prevention', () => {
  it('throws SELF_RATING when raterId equals rateeId', async () => {
    await expect(
      trustService.rateTask({ rateeId: 42, taskId: 1, rating: 5 }, 42)
    ).rejects.toMatchObject({ code: 'SELF_RATING', statusCode: 422 });
  });

  it('proceeds when rater and ratee are different users', async () => {
    setupPassingInteraction(10, 20);
    const result = await trustService.rateTask({ rateeId: 20, taskId: 1, rating: 5 }, 10);
    expect(result.message).toBeDefined();
  });
});

// ─── Credit delta values ──────────────────────────────────────────────────────

describe('Trust - Credit Delta', () => {
  const rater = 10;
  const ratee = 20;

  it.each([
    [5, 2],
    [4, 1],
    [3, 0],
    [2, -1],
    [1, -2],
  ])('%i-star rating returns delta %i', async (rating, expectedDelta) => {
    setupPassingInteraction(rater, ratee);
    const result = await trustService.rateTask(
      { rateeId: ratee, taskId: 1, rating },
      rater
    );
    expect(result.delta).toBe(expectedDelta);
  });

  it('3-star rating does not write credit history (delta = 0)', async () => {
    setupPassingInteraction(rater, ratee);
    await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 3 }, rater);
    // transaction is not called at all for delta=0 ratings
    expect(txMock.creditHistory.create).not.toHaveBeenCalled();
    expect(txMock.trustScore.upsert).not.toHaveBeenCalled();
  });

  it('non-zero delta writes trust score upsert', async () => {
    setupPassingInteraction(rater, ratee);
    await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 5 }, rater);
    expect(txMock.trustScore.upsert).toHaveBeenCalledOnce();
    expect(txMock.creditHistory.create).toHaveBeenCalledOnce();
  });
});

// ─── Explanation format ───────────────────────────────────────────────────────

describe('Trust - Explanation Format', () => {
  const rater = 10;
  const ratee = 20;

  it('positive explanation contains + sign and task id', async () => {
    setupPassingInteraction(rater, ratee);
    const result = await trustService.rateTask(
      { rateeId: ratee, taskId: 99, rating: 5 },
      rater
    );
    expect(result.explanation).toContain('+2');
    expect(result.explanation).toContain('#99');
    expect(result.explanation).toContain('5★');
  });

  it('negative explanation contains minus sign and task id', async () => {
    setupPassingInteraction(rater, ratee);
    const result = await trustService.rateTask(
      { rateeId: ratee, taskId: 7, rating: 1 },
      rater
    );
    expect(result.explanation).toContain('-2');
    expect(result.explanation).toContain('#7');
  });

  it('3-star explanation mentions no trust change', async () => {
    setupPassingInteraction(rater, ratee);
    const result = await trustService.rateTask(
      { rateeId: ratee, taskId: 5, rating: 3 },
      rater
    );
    expect(result.explanation).toContain('no trust change');
  });
});

// ─── Score clamping via rateTask ──────────────────────────────────────────────

describe('Trust - Score Clamping (rateTask)', () => {
  const rater = 10;
  const ratee = 20;

  it('clamps score at 100 when +2 would exceed it', async () => {
    setupPassingInteraction(rater, ratee, 99);
    await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 5 }, rater);

    const upsertCall = txMock.trustScore.upsert.mock.calls[0][0];
    expect(upsertCall.create.score).toBe(100);
    expect(upsertCall.update.score).toBe(100);
  });

  it('clamps score at 0 when -2 would go negative', async () => {
    setupPassingInteraction(rater, ratee, 1);
    await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 1 }, rater);

    const upsertCall = txMock.trustScore.upsert.mock.calls[0][0];
    expect(upsertCall.create.score).toBe(0);
    expect(upsertCall.update.score).toBe(0);
  });

  it('defaults to score 50 when no existing trust score record', async () => {
    setupPassingInteraction(rater, ratee, null as any);
    txMock.trustScore.findUnique.mockResolvedValue(null); // no existing record
    await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 5 }, rater);

    const upsertCall = txMock.trustScore.upsert.mock.calls[0][0];
    expect(upsertCall.create.score).toBe(52); // 50 default + 2
  });
});

// ─── Score clamping via adminAdjust ──────────────────────────────────────────

describe('Trust - Score Clamping (adminAdjust)', () => {
  const adminTx = {
    trustScore: { upsert: vi.fn().mockResolvedValue({}) },
    creditHistory: { create: vi.fn().mockResolvedValue({}) },
  };

  beforeEach(() => {
    adminTx.trustScore.upsert.mockResolvedValue({});
    adminTx.creditHistory.create.mockResolvedValue({});
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(adminTx));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 1 } as any);
  });

  it('clamps at 100 when adjustment would exceed it', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue({ score: '99' } as any);
    const result = await trustService.adminAdjust(
      { userId: 1, changeAmount: 5, reason: 'Test' },
      99
    );
    expect(result.newScore).toBe(100);
    expect(result.previousScore).toBe(99);
  });

  it('clamps at 0 when adjustment would go negative', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue({ score: '1' } as any);
    const result = await trustService.adminAdjust(
      { userId: 1, changeAmount: -10, reason: 'Test' },
      99
    );
    expect(result.newScore).toBe(0);
    expect(result.previousScore).toBe(1);
  });

  it('applies delta normally within bounds', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue({ score: '50' } as any);
    const result = await trustService.adminAdjust(
      { userId: 1, changeAmount: 15, reason: 'Bonus' },
      99
    );
    expect(result.newScore).toBe(65);
    expect(result.previousScore).toBe(50);
  });

  it('defaults previous score to 50 when no trust record exists', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue(null);
    const result = await trustService.adminAdjust(
      { userId: 1, changeAmount: 10, reason: 'Test' },
      99
    );
    expect(result.previousScore).toBe(50);
    expect(result.newScore).toBe(60);
  });

  it('returns correct userId in result', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue({ score: '70' } as any);
    const result = await trustService.adminAdjust(
      { userId: 7, changeAmount: 0, reason: 'No-op' },
      99
    );
    expect(result.userId).toBe(7);
  });
});

// ─── Guard conditions ─────────────────────────────────────────────────────────

describe('Trust - Guard Conditions', () => {
  it('throws INTERACTION_NOT_FOUND when interaction does not exist', async () => {
    vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue(null);
    await expect(
      trustService.rateTask({ rateeId: 20, taskId: 999, rating: 5 }, 10)
    ).rejects.toMatchObject({ code: 'INTERACTION_NOT_FOUND' });
  });

  it('throws INTERACTION_NOT_COMPLETED when interaction is still PENDING', async () => {
    vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue({
      id: 1, requesterId: 10, providerId: 20, status: 'PENDING',
    } as any);
    await expect(
      trustService.rateTask({ rateeId: 20, taskId: 1, rating: 5 }, 10)
    ).rejects.toMatchObject({ code: 'INTERACTION_NOT_COMPLETED' });
  });

  it('throws NOT_PARTICIPANT when rater is not part of the interaction', async () => {
    vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue({
      id: 1, requesterId: 10, providerId: 20, status: 'COMPLETED',
    } as any);
    // rater 99 is not requester (10) or provider (20)
    await expect(
      trustService.rateTask({ rateeId: 20, taskId: 1, rating: 5 }, 99)
    ).rejects.toMatchObject({ code: 'NOT_PARTICIPANT' });
  });

  it('throws DUPLICATE when rater has already rated this task', async () => {
    vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue({
      id: 1, requesterId: 10, providerId: 20, status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.taskRating.findUnique).mockResolvedValue({ id: 1 } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 20 } as any);
    await expect(
      trustService.rateTask({ rateeId: 20, taskId: 1, rating: 5 }, 10)
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
});

// ─── Configurable credit rules (DB-backed) ───────────────────────────────────

describe('Trust - Configurable Credit Rules', () => {
  // No inner beforeEach needed: the outer beforeEach already defaults
  // prisma.creditRule.findMany to [] (empty table → use hardcoded defaults).

  // ── getCreditRules ──────────────────────────────────────────────

  it('getCreditRules returns hardcoded defaults when DB table is empty', async () => {
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
    const rules = await getCreditRules();
    expect(rules[5]).toBe(2);
    expect(rules[4]).toBe(1);
    expect(rules[3]).toBe(0);
    expect(rules[2]).toBe(-1);
    expect(rules[1]).toBe(-2);
  });

  it('getCreditRules returns persisted DB values when rows exist', async () => {
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([
      { id: 1, rating: 5, delta: 5, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, rating: 4, delta: 3, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, rating: 3, delta: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 4, rating: 2, delta: -1, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, rating: 1, delta: -5, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    const rules = await getCreditRules();
    expect(rules[5]).toBe(5);
    expect(rules[4]).toBe(3);
    expect(rules[3]).toBe(1);
    expect(rules[2]).toBe(-1);
    expect(rules[1]).toBe(-5);
  });

  // ── setCreditRules ──────────────────────────────────────────────

  it('setCreditRules upserts all provided rules inside a single transaction', async () => {
    const txCR = { creditRule: { upsert: vi.fn().mockResolvedValue({}) } };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txCR));

    await setCreditRules({ 5: 5, 4: 3, 3: 1, 2: -1, 1: -5 });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txCR.creditRule.upsert).toHaveBeenCalledTimes(5);
  });

  it('setCreditRules upserts each rating with correct create/update args', async () => {
    const txCR = { creditRule: { upsert: vi.fn().mockResolvedValue({}) } };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txCR));

    await setCreditRules({ 5: 7 });

    expect(txCR.creditRule.upsert).toHaveBeenCalledWith({
      where: { rating: 5 },
      create: { rating: 5, delta: 7 },
      update: { delta: 7 },
    });
  });

  // ── resetCreditRules ────────────────────────────────────────────

  it('resetCreditRules deletes all custom rows so defaults are used again', async () => {
    vi.mocked(prisma.creditRule.deleteMany).mockResolvedValue({ count: 5 } as any);

    await resetCreditRules();

    expect(prisma.creditRule.deleteMany).toHaveBeenCalledWith({});
  });

  it('getCreditRules returns defaults after resetCreditRules empties the table', async () => {
    vi.mocked(prisma.creditRule.deleteMany).mockResolvedValue({ count: 5 } as any);
    await resetCreditRules();

    // After reset the table is empty again
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
    const rules = await getCreditRules();
    expect(rules[5]).toBe(2);
    expect(rules[1]).toBe(-2);
  });

  // ── rateTask integration ────────────────────────────────────────

  it('rateTask uses persisted delta from DB', async () => {
    const rater = 10;
    const ratee = 20;

    // DB has 5-star → +10
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([
      { id: 1, rating: 5, delta: 10, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, rating: 4, delta: 1,  createdAt: new Date(), updatedAt: new Date() },
      { id: 3, rating: 3, delta: 0,  createdAt: new Date(), updatedAt: new Date() },
      { id: 4, rating: 2, delta: -1, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, rating: 1, delta: -2, createdAt: new Date(), updatedAt: new Date() },
    ] as any);

    vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue({
      id: 1, requesterId: rater, providerId: ratee, status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.taskRating.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: ratee } as any);

    const txMockLocal = {
      taskRating: { create: vi.fn().mockResolvedValue({}) },
      trustScore: { findUnique: vi.fn().mockResolvedValue({ score: '50' }), upsert: vi.fn().mockResolvedValue({}) },
      creditHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMockLocal));

    const result = await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 5 }, rater);
    expect(result.delta).toBe(10);
  });

  // ── Fallback observability ──────────────────────────────────────

  it('getCreditRules emits logger.warn when table is empty (fallback path)', async () => {
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
    await getCreditRules();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledOnce();
    const [meta, msg] = vi.mocked(logger.warn).mock.calls[0];
    expect(meta).toHaveProperty('defaults');
    expect(msg).toMatch(/hardcoded fallback defaults/);
  });

  it('getCreditRules does NOT emit logger.warn when DB has rows', async () => {
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([
      { id: 1, rating: 5, delta: 2, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    await getCreditRules();
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  // ── Partial-rules drift prevention ─────────────────────────────
  // Documents the CURRENT behaviour: if the DB has some rows but not all
  // ratings, missing ratings return 0 (not the hardcoded default). Operators
  // should always persist the full 1-5 set to avoid unintended 0-delta.

  it('partial DB rules: missing rating returns 0 via the ?? 0 fallback in rateTask', async () => {
    // DB only has rating 5; ratings 1-4 are absent
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([
      { id: 1, rating: 5, delta: 10, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    const rules = await getCreditRules();
    // Missing rating 1 → undefined → rateTask would use delta = rules[1] ?? 0 = 0
    expect(rules[1]).toBeUndefined();
  });

  it('getCreditRules returns all 5 ratings when DB has the full default set', async () => {
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([
      { id: 1, rating: 5, delta: 2,  createdAt: new Date(), updatedAt: new Date() },
      { id: 2, rating: 4, delta: 1,  createdAt: new Date(), updatedAt: new Date() },
      { id: 3, rating: 3, delta: 0,  createdAt: new Date(), updatedAt: new Date() },
      { id: 4, rating: 2, delta: -1, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, rating: 1, delta: -2, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    const rules = await getCreditRules();
    expect(Object.keys(rules)).toHaveLength(5);
    expect([1, 2, 3, 4, 5].every((r) => r in rules)).toBe(true);
  });

  // ── DEFAULT_CREDIT_DELTA sentinel ───────────────────────────────
  // Breaks loudly if someone silently edits the hardcoded defaults, forcing
  // a conscious decision and a matching seed/migration update.

  it('hardcoded default deltas match the documented policy (5★→+2 … 1★→-2)', async () => {
    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
    const rules = await getCreditRules();
    expect(rules[5]).toBe(2);
    expect(rules[4]).toBe(1);
    expect(rules[3]).toBe(0);
    expect(rules[2]).toBe(-1);
    expect(rules[1]).toBe(-2);
    // Exactly 5 entries — no extras
    expect(Object.keys(rules)).toHaveLength(5);
  });

  it('rateTask falls back to hardcoded default delta when DB is empty', async () => {
    const rater = 10;
    const ratee = 20;

    vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]); // empty → defaults

    vi.mocked(prisma.serviceInteraction.findUnique).mockResolvedValue({
      id: 1, requesterId: rater, providerId: ratee, status: 'COMPLETED',
    } as any);
    vi.mocked(prisma.taskRating.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: ratee } as any);

    const txMockLocal = {
      taskRating: { create: vi.fn().mockResolvedValue({}) },
      trustScore: { findUnique: vi.fn().mockResolvedValue({ score: '50' }), upsert: vi.fn().mockResolvedValue({}) },
      creditHistory: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMockLocal));

    const result = await trustService.rateTask({ rateeId: ratee, taskId: 1, rating: 5 }, rater);
    expect(result.delta).toBe(2); // hardcoded default for 5-star
  });
});
