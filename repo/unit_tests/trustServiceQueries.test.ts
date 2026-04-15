/**
 * Tests for TrustService read methods (getScore, getUserHistory, getHistory,
 * getLeaderboard, getAllScores) — the rateTask / adminAdjust paths are in trust.test.ts.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    trustScore: { findUnique: vi.fn(), findMany: vi.fn() },
    creditHistory: { findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
    creditRule: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/prisma';
import { trustService } from '@/modules/trust/trust.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.creditRule.findMany).mockResolvedValue([]);
});

// ─── getScore ─────────────────────────────────────────────────────────────────

describe('TrustService - getScore', () => {
  it('returns score from DB when record exists', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue({
      userId: 5, score: '72',
    } as any);

    const result = await trustService.getScore(5);
    expect(result.score).toBe('72');
    expect(result.userId).toBe(5);
  });

  it('returns default score of 50 when no record exists', async () => {
    vi.mocked(prisma.trustScore.findUnique).mockResolvedValue(null);

    const result = await trustService.getScore(999);
    expect(result).toMatchObject({ userId: 999, score: 50 });
  });
});

// ─── getUserHistory ───────────────────────────────────────────────────────────

describe('TrustService - getUserHistory', () => {
  it('throws NOT_FOUND when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(trustService.getUserHistory(999, 1, 10)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('returns paginated credit history when user exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 5 } as any);
    vi.mocked(prisma.creditHistory.findMany).mockResolvedValue([
      { id: 1, userId: 5, changeAmount: 2 },
    ] as any);
    vi.mocked(prisma.creditHistory.count).mockResolvedValue(1);

    const result = await trustService.getUserHistory(5, 1, 10);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });
});

// ─── getHistory ───────────────────────────────────────────────────────────────

describe('TrustService - getHistory', () => {
  it('returns paginated history for given userId', async () => {
    vi.mocked(prisma.creditHistory.findMany).mockResolvedValue([
      { id: 10, userId: 3, changeAmount: -1 },
    ] as any);
    vi.mocked(prisma.creditHistory.count).mockResolvedValue(1);

    const result = await trustService.getHistory(3, 1, 5);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.pageSize).toBe(5);
    expect(result.totalPages).toBe(1);
  });

  it('correctly computes pagination offset', async () => {
    vi.mocked(prisma.creditHistory.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.creditHistory.count).mockResolvedValue(0);

    await trustService.getHistory(1, 3, 10);
    const call = vi.mocked(prisma.creditHistory.findMany).mock.calls[0][0] as any;
    expect(call.skip).toBe(20); // (3-1) * 10
    expect(call.take).toBe(10);
  });
});

// ─── getLeaderboard ───────────────────────────────────────────────────────────

describe('TrustService - getLeaderboard', () => {
  it('returns top trust scores ordered by score desc', async () => {
    vi.mocked(prisma.trustScore.findMany).mockResolvedValue([
      { userId: 1, score: '95', user: { username: 'top' } },
      { userId: 2, score: '80', user: { username: 'second' } },
    ] as any);

    const result = await trustService.getLeaderboard(10);
    expect(result).toHaveLength(2);
    expect(vi.mocked(prisma.trustScore.findMany).mock.calls[0][0]).toMatchObject({
      orderBy: { score: 'desc' },
      take: 10,
    });
  });

  it('defaults to top 10 when limit is not provided', async () => {
    vi.mocked(prisma.trustScore.findMany).mockResolvedValue([] as any);

    await trustService.getLeaderboard();
    const call = vi.mocked(prisma.trustScore.findMany).mock.calls[0][0] as any;
    expect(call.take).toBe(10);
  });
});

// ─── getAllScores ─────────────────────────────────────────────────────────────

describe('TrustService - getAllScores', () => {
  it('returns all trust scores with user information', async () => {
    vi.mocked(prisma.trustScore.findMany).mockResolvedValue([
      { userId: 1, score: '60', user: { id: 1, username: 'a', displayName: 'A', role: 'GUEST' } },
    ] as any);

    const result = await trustService.getAllScores();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(vi.mocked(prisma.trustScore.findMany).mock.calls[0][0]).toMatchObject({
      orderBy: { score: 'desc' },
    });
  });
});
