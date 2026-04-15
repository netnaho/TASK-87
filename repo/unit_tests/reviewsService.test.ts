/**
 * Additional reviews service tests covering getReview, listReviews,
 * tag validation, follow-up rate limit, and follow-up content filter.
 * The main reviews.test.ts covers createReview, createFollowUp, createHostReply.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    review: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    hostReply: { findUnique: vi.fn(), create: vi.fn() },
    rateLimitLog: { count: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    tag: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/contentFilter', () => ({
  filterContent: vi.fn().mockResolvedValue({ clean: true, flaggedWords: [] }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import prisma from '@/lib/prisma';
import { filterContent } from '@/lib/contentFilter';
import { reviewsService } from '@/modules/reviews/reviews.service';

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.rateLimitLog.create).mockResolvedValue({} as any);
  vi.mocked(filterContent).mockResolvedValue({ clean: true, flaggedWords: [] });
});

// ─── getReview ────────────────────────────────────────────────────────────────

describe('ReviewsService - getReview', () => {
  it('throws NOT_FOUND when review does not exist', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null);

    await expect(reviewsService.getReview(999)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('returns review with all relations when found', async () => {
    const mockReview = {
      id: 5,
      reviewer: { id: 1, displayName: 'Alice' },
      reviewee: null,
      images: [],
      tags: [],
      hostReply: null,
      followUps: [],
    };
    vi.mocked(prisma.review.findUnique).mockResolvedValue(mockReview as any);

    const result = await reviewsService.getReview(5);
    expect(result.id).toBe(5);
  });
});

// ─── listReviews ──────────────────────────────────────────────────────────────

describe('ReviewsService - listReviews', () => {
  it('returns paginated reviews without follow-ups', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    vi.mocked(prisma.review.count).mockResolvedValue(2);

    const result = await reviewsService.listReviews({});

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);

    const whereArg = (vi.mocked(prisma.review.findMany).mock.calls[0][0] as any).where;
    expect(whereArg.isFollowUp).toBe(false);
  });

  it('filters by targetType when provided', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    await reviewsService.listReviews({ targetType: 'STAY' });

    const whereArg = (vi.mocked(prisma.review.findMany).mock.calls[0][0] as any).where;
    expect(whereArg.targetType).toBe('STAY');
  });

  it('filters by status when provided', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    await reviewsService.listReviews({ status: 'ACTIVE' });

    const whereArg = (vi.mocked(prisma.review.findMany).mock.calls[0][0] as any).where;
    expect(whereArg.status).toBe('ACTIVE');
  });

  it('filters by revieweeId when provided', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    await reviewsService.listReviews({ revieweeId: '42' });

    const whereArg = (vi.mocked(prisma.review.findMany).mock.calls[0][0] as any).where;
    expect(whereArg.revieweeId).toBe(42);
  });

  it('respects custom page and pageSize', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.review.count).mockResolvedValue(0);

    const result = await reviewsService.listReviews({ page: '2', pageSize: '5' });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    const callArgs = vi.mocked(prisma.review.findMany).mock.calls[0][0] as any;
    expect(callArgs.skip).toBe(5);
    expect(callArgs.take).toBe(5);
  });
});

// ─── createReview tag validation ──────────────────────────────────────────────

describe('ReviewsService - createReview tag validation', () => {
  it('throws INVALID_TAGS when a tagId does not exist', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    // Only 1 of 2 tags found → invalid
    vi.mocked(prisma.tag.findMany).mockResolvedValue([{ id: 1 }] as any);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1,
          ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
          tagIds: [1, 999] },
        10, []
      )
    ).rejects.toMatchObject({ code: 'INVALID_TAGS', statusCode: 422 });
  });

  it('proceeds when all tagIds are valid', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(prisma.tag.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 1, overallRating: 4, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1,
          ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
          tagIds: [1, 2] },
        10, []
      )
    ).resolves.toBeDefined();
  });
});

// ─── createFollowUp rate limit and content filter ─────────────────────────────

describe('ReviewsService - createFollowUp additional guards', () => {
  it('throws RATE_LIMITED when follow-up rate limit is exceeded', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue({
      id: 1, reviewerId: 10, createdAt: daysAgo(1),
    } as any);
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(5); // exceeded

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 10, [])
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
  });

  it('throws CONTENT_FILTERED when follow-up text contains prohibited words', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue({
      id: 1, reviewerId: 10, createdAt: daysAgo(1),
    } as any);
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(filterContent).mockResolvedValue({ clean: false, flaggedWords: ['spam'] });

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
        text: 'spam content',
      }, 10, [])
    ).rejects.toMatchObject({ code: 'CONTENT_FILTERED', statusCode: 422 });
  });

  it('throws NOT_FOUND when parent review does not exist', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null);

    await expect(
      reviewsService.createFollowUp(999, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 10, [])
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });
});

// ─── createHostReply NOT_FOUND ─────────────────────────────────────────────────

describe('ReviewsService - createHostReply NOT_FOUND', () => {
  it('throws NOT_FOUND when review does not exist', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(null);

    await expect(
      reviewsService.createHostReply(999, { text: 'Thanks!' }, 1, 'HOST')
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });
});
