import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    report: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    review: { update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    moderationAction: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    appeal: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    sensitiveWord: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/cache', () => ({
  cache: { get: vi.fn().mockReturnValue(null), set: vi.fn(), delete: vi.fn() },
}));

import prisma from '@/lib/prisma';
import { cache } from '@/lib/cache';
import { moderationService } from '@/modules/moderation/moderation.service';

const txMock = {
  moderationAction: { create: vi.fn() },
  review: { update: vi.fn() },
  report: { update: vi.fn() },
  appeal: { update: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMock));
  txMock.moderationAction.create.mockResolvedValue({ id: 10, action: 'WARN' });
  txMock.review.update.mockResolvedValue({});
  txMock.report.update.mockResolvedValue({});
  txMock.appeal.update.mockResolvedValue({ id: 1, status: 'UPHELD' });
});

// ─── fileReport ───────────────────────────────────────────────────────────────

describe('ModerationService - fileReport', () => {
  it('throws DUPLICATE when reporter already filed a pending report on same content', async () => {
    vi.mocked(prisma.report.findFirst).mockResolvedValue({ id: 1 } as any);

    await expect(
      moderationService.fileReport({ contentType: 'REVIEW', contentId: 5, reason: 'Spam' }, 1)
    ).rejects.toMatchObject({ code: 'DUPLICATE', statusCode: 409 });
  });

  it('creates report and flags review when contentType is REVIEW', async () => {
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.report.create).mockResolvedValue({ id: 99, reporterId: 1 } as any);
    vi.mocked(prisma.review.update).mockResolvedValue({} as any);

    const result = await moderationService.fileReport(
      { contentType: 'REVIEW', contentId: 5, reviewId: 5, reason: 'Inappropriate' },
      1
    );

    expect(prisma.report.create).toHaveBeenCalledOnce();
    expect(prisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 }, data: { status: 'FLAGGED' } })
    );
    expect(result.id).toBe(99);
  });

  it('creates report without flagging review for non-REVIEW content type', async () => {
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.report.create).mockResolvedValue({ id: 100 } as any);

    await moderationService.fileReport(
      { contentType: 'USER', contentId: 7, reason: 'Abuse' },
      2
    );

    expect(prisma.review.update).not.toHaveBeenCalled();
  });
});

// ─── assignReport ─────────────────────────────────────────────────────────────

describe('ModerationService - assignReport', () => {
  it('throws NOT_FOUND when report does not exist', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue(null);

    await expect(moderationService.assignReport(999, 1)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('throws INVALID_STATE when report is already RESOLVED', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: 1, status: 'RESOLVED' } as any);

    await expect(moderationService.assignReport(1, 2)).rejects.toMatchObject({
      code: 'INVALID_STATE', statusCode: 422,
    });
  });

  it('throws INVALID_STATE when report is DISMISSED', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: 1, status: 'DISMISSED' } as any);

    await expect(moderationService.assignReport(1, 2)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('updates report to IN_REVIEW and assigns moderator', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: 1, status: 'PENDING' } as any);
    vi.mocked(prisma.report.update).mockResolvedValue({ id: 1, status: 'IN_REVIEW', assignedTo: 5 } as any);

    const result = await moderationService.assignReport(1, 5);
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedTo: 5, status: 'IN_REVIEW' } })
    );
    expect(result.status).toBe('IN_REVIEW');
  });
});

// ─── takeAction ───────────────────────────────────────────────────────────────

describe('ModerationService - takeAction', () => {
  it('throws NOT_FOUND when report does not exist', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue(null);

    await expect(
      moderationService.takeAction(999, { action: 'WARN' }, 1)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INVALID_STATE when report is already RESOLVED', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({
      id: 1, status: 'RESOLVED', reviewId: null, review: null,
    } as any);

    await expect(
      moderationService.takeAction(1, { action: 'WARN' }, 1)
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('creates action and resolves report in a transaction', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({
      id: 1, status: 'IN_REVIEW', reviewId: null, review: null,
    } as any);

    const result = await moderationService.takeAction(1, { action: 'WARN', notes: 'warning issued' }, 3);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txMock.moderationAction.create).toHaveBeenCalledOnce();
    expect(txMock.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) })
    );
    expect(result.action).toBe('WARN');
  });

  it('updates review status when report has a reviewId', async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({
      id: 2, status: 'IN_REVIEW', reviewId: 10,
      review: { id: 10, status: 'FLAGGED' },
    } as any);
    txMock.moderationAction.create.mockResolvedValue({ id: 11, action: 'HIDE' });

    await moderationService.takeAction(2, { action: 'HIDE' }, 3);

    expect(txMock.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 } })
    );
  });
});

// ─── getAudit ─────────────────────────────────────────────────────────────────

describe('ModerationService - getAudit', () => {
  it('returns paginated audit records', async () => {
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.moderationAction.count).mockResolvedValue(1);

    const result = await moderationService.getAudit(1, 10);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });
});

// ─── addSensitiveWord / deleteSensitiveWord / listSensitiveWords ──────────────

describe('ModerationService - sensitive word management', () => {
  it('addSensitiveWord upserts lowercase word and invalidates cache', async () => {
    vi.mocked(prisma.sensitiveWord.upsert).mockResolvedValue({
      id: 1, word: 'badword', category: null, createdAt: new Date(),
    } as any);

    const result = await moderationService.addSensitiveWord({ word: 'BadWord' });
    expect(prisma.sensitiveWord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { word: 'badword' } })
    );
    expect(cache.delete).toHaveBeenCalledWith('sensitive_words');
    expect(result.word).toBe('badword');
  });

  it('addSensitiveWord stores category when provided', async () => {
    vi.mocked(prisma.sensitiveWord.upsert).mockResolvedValue({
      id: 2, word: 'junk', category: 'spam', createdAt: new Date(),
    } as any);

    await moderationService.addSensitiveWord({ word: 'junk', category: 'spam' });
    const call = vi.mocked(prisma.sensitiveWord.upsert).mock.calls[0][0] as any;
    expect(call.create.category).toBe('spam');
  });

  it('deleteSensitiveWord throws NOT_FOUND for missing word', async () => {
    vi.mocked(prisma.sensitiveWord.findUnique).mockResolvedValue(null);

    await expect(moderationService.deleteSensitiveWord(999)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('deleteSensitiveWord deletes word and invalidates cache', async () => {
    vi.mocked(prisma.sensitiveWord.findUnique).mockResolvedValue({ id: 5, word: 'spam' } as any);
    vi.mocked(prisma.sensitiveWord.delete).mockResolvedValue({} as any);

    const result = await moderationService.deleteSensitiveWord(5);
    expect(prisma.sensitiveWord.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(cache.delete).toHaveBeenCalledWith('sensitive_words');
    expect(result.deleted).toBe(true);
  });

  it('listSensitiveWords returns paginated list', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([{ id: 1, word: 'test' }] as any);
    vi.mocked(prisma.sensitiveWord.count).mockResolvedValue(1);

    const result = await moderationService.listSensitiveWords(1, 50);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

// ─── fileAppeal ───────────────────────────────────────────────────────────────

describe('ModerationService - fileAppeal', () => {
  it('throws NOT_FOUND when moderation action does not exist', async () => {
    vi.mocked(prisma.moderationAction.findUnique).mockResolvedValue(null);

    await expect(
      moderationService.fileAppeal({ moderationActionId: 999, userStatement: 'Not fair' }, 1)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws FORBIDDEN when user did not author the reviewed content', async () => {
    vi.mocked(prisma.moderationAction.findUnique).mockResolvedValue({
      id: 1,
      report: { contentType: 'REVIEW', reviewId: 10, contentId: 10 },
    } as any);
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 10, reviewerId: 99 } as any);

    // Caller is user 1, but review belongs to user 99
    await expect(
      moderationService.fileAppeal({ moderationActionId: 1, userStatement: 'Mine' }, 1)
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('throws DUPLICATE when user already appealed this action', async () => {
    vi.mocked(prisma.moderationAction.findUnique).mockResolvedValue({
      id: 2,
      report: { contentType: 'REVIEW', reviewId: 5, contentId: 5 },
    } as any);
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 5, reviewerId: 7 } as any);
    vi.mocked(prisma.appeal.findFirst).mockResolvedValue({ id: 1 } as any);

    await expect(
      moderationService.fileAppeal({ moderationActionId: 2, userStatement: 'Again' }, 7)
    ).rejects.toMatchObject({ code: 'DUPLICATE', statusCode: 409 });
  });

  it('creates appeal when all conditions pass', async () => {
    vi.mocked(prisma.moderationAction.findUnique).mockResolvedValue({
      id: 3,
      report: { contentType: 'REVIEW', reviewId: 6, contentId: 6 },
    } as any);
    vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: 6, reviewerId: 8 } as any);
    vi.mocked(prisma.appeal.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appeal.create).mockResolvedValue({
      id: 20, userId: 8, moderationActionId: 3, status: 'PENDING',
    } as any);

    const result = await moderationService.fileAppeal(
      { moderationActionId: 3, userStatement: 'I disagree' },
      8
    );
    expect(result.id).toBe(20);
    expect(result.status).toBe('PENDING');
  });

  it('allows appeal for USER content type when userId matches contentId', async () => {
    vi.mocked(prisma.moderationAction.findUnique).mockResolvedValue({
      id: 4,
      report: { contentType: 'USER', reviewId: null, contentId: 9 },
    } as any);
    vi.mocked(prisma.appeal.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appeal.create).mockResolvedValue({ id: 21, status: 'PENDING' } as any);

    await expect(
      moderationService.fileAppeal({ moderationActionId: 4, userStatement: 'Wrong ban' }, 9)
    ).resolves.toBeDefined();
  });
});

// ─── resolveAppeal ────────────────────────────────────────────────────────────

describe('ModerationService - resolveAppeal', () => {
  it('throws NOT_FOUND when appeal does not exist', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue(null);

    await expect(
      moderationService.resolveAppeal(999, { status: 'UPHELD' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INVALID_STATE for disallowed transition', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 1, status: 'UPHELD',
      moderationAction: { action: 'WARN', report: { reviewId: null, review: null } },
    } as any);

    await expect(
      moderationService.resolveAppeal(1, { status: 'PENDING' })
    ).rejects.toMatchObject({ code: 'INVALID_STATE', statusCode: 422 });
  });

  it('resolves appeal and restores review when OVERTURNED with HIDE action', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 5, status: 'PENDING',
      moderationAction: {
        action: 'HIDE',
        report: { reviewId: 20, review: { id: 20, status: 'HIDDEN' } },
      },
    } as any);
    txMock.appeal.update.mockResolvedValue({ id: 5, status: 'OVERTURNED' });

    await moderationService.resolveAppeal(5, { status: 'OVERTURNED', outcome: 'Review restored' });

    expect(txMock.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20 }, data: { status: 'ACTIVE' } })
    );
  });

  it('resolves appeal without restoring review for WARN action', async () => {
    vi.mocked(prisma.appeal.findUnique).mockResolvedValue({
      id: 6, status: 'PENDING',
      moderationAction: {
        action: 'WARN',
        report: { reviewId: null, review: null },
      },
    } as any);
    txMock.appeal.update.mockResolvedValue({ id: 6, status: 'UPHELD' });

    await moderationService.resolveAppeal(6, { status: 'UPHELD' });

    expect(txMock.review.update).not.toHaveBeenCalled();
  });
});

// ─── listAppeals / listMyAppeals / listMyModerationActions ───────────────────

describe('ModerationService - list methods', () => {
  it('listAppeals returns paginated list without filter', async () => {
    vi.mocked(prisma.appeal.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.appeal.count).mockResolvedValue(1);

    const result = await moderationService.listAppeals(undefined, 1, 10);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('listAppeals filters by status when provided', async () => {
    vi.mocked(prisma.appeal.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.appeal.count).mockResolvedValue(0);

    await moderationService.listAppeals('PENDING', 1, 10);
    const call = vi.mocked(prisma.appeal.findMany).mock.calls[0][0] as any;
    expect(call.where.status).toBe('PENDING');
  });

  it('listMyAppeals returns appeals for specified user', async () => {
    vi.mocked(prisma.appeal.findMany).mockResolvedValue([{ id: 2 }] as any);
    vi.mocked(prisma.appeal.count).mockResolvedValue(1);

    const result = await moderationService.listMyAppeals(42, undefined, 1, 10);
    const findCall = vi.mocked(prisma.appeal.findMany).mock.calls[0][0] as any;
    expect(findCall.where.userId).toBe(42);
    expect(result.items).toHaveLength(1);
  });

  it('listMyModerationActions builds correct where for user with reviews', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ id: 10 }, { id: 11 }] as any);
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.moderationAction.count).mockResolvedValue(0);

    const result = await moderationService.listMyModerationActions(5, 1, 10);
    expect(result.total).toBe(0);
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reviewerId: 5 } })
    );
  });

  it('listMyModerationActions uses USER-only where when user has no reviews', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.moderationAction.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.moderationAction.count).mockResolvedValue(0);

    await moderationService.listMyModerationActions(99, 1, 10);
    const findCall = vi.mocked(prisma.moderationAction.findMany).mock.calls[0][0] as any;
    // No OR clause; just USER content type filter
    expect(findCall.where).toHaveProperty('report');
    expect(findCall.where.OR).toBeUndefined();
  });

  it('getQueue returns all open reports when no status filter', async () => {
    vi.mocked(prisma.report.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.report.count).mockResolvedValue(1);

    const result = await moderationService.getQueue(undefined, 1, 20);
    expect(result.total).toBe(1);
    const findCall = vi.mocked(prisma.report.findMany).mock.calls[0][0] as any;
    expect(findCall.where.status).toMatchObject({ in: ['PENDING', 'IN_REVIEW'] });
  });

  it('getQueue filters by explicit status when provided', async () => {
    vi.mocked(prisma.report.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.report.count).mockResolvedValue(0);

    await moderationService.getQueue('RESOLVED', 1, 20);
    const findCall = vi.mocked(prisma.report.findMany).mock.calls[0][0] as any;
    expect(findCall.where.status).toBe('RESOLVED');
  });
});
