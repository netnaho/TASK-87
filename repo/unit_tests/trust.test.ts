import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    serviceInteraction: { findUnique: vi.fn() },
    taskRating: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    trustScore: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import prisma from '@/lib/prisma';
import { trustService } from '@/modules/trust/trust.service';

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
