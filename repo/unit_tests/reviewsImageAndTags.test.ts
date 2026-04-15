/**
 * Tests for ReviewsService image access, listTags, host reply rate limit,
 * and content filtering on host reply.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    review: { findUnique: vi.fn() },
    hostReply: { findUnique: vi.fn(), create: vi.fn() },
    rateLimitLog: { count: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    tag: { findMany: vi.fn() },
    reviewImage: { findFirst: vi.fn() },
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

// ─── listTags ─────────────────────────────────────────────────────────────────

describe('ReviewsService - listTags', () => {
  it('returns tags ordered by name', async () => {
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      { id: 1, name: 'clean' }, { id: 2, name: 'friendly' },
    ] as any);

    const result = await reviewsService.listTags();
    expect(result).toHaveLength(2);
    expect(vi.mocked(prisma.tag.findMany).mock.calls[0][0]).toMatchObject({
      orderBy: { name: 'asc' },
    });
  });
});

// ─── getImageFileByReviewAndId ────────────────────────────────────────────────

describe('ReviewsService - getImageFileByReviewAndId', () => {
  it('throws NOT_FOUND when image does not exist', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue(null);

    await expect(
      reviewsService.getImageFileByReviewAndId(1, 99, 1, 'ADMIN')
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws FORBIDDEN when requester is not the reviewer, reviewee, or privileged', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue({
      id: 1,
      filePath: 'image.jpg',
      review: { reviewerId: 10, revieweeId: 20 },
    } as any);

    // Requester 99 has role GUEST — not reviewer (10), reviewee (20), or privileged
    await expect(
      reviewsService.getImageFileByReviewAndId(1, 1, 99, 'GUEST')
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('returns filename when reviewer requests their own image', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue({
      id: 1,
      filePath: 'uploads/abc123.jpg',
      review: { reviewerId: 10, revieweeId: 20 },
    } as any);

    const result = await reviewsService.getImageFileByReviewAndId(1, 1, 10, 'GUEST');
    expect(result).toBe('abc123.jpg'); // path.basename strips the directory
  });

  it('allows ADMIN to access any image', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue({
      id: 2,
      filePath: 'uploads/xyz.jpg',
      review: { reviewerId: 5, revieweeId: null },
    } as any);

    const result = await reviewsService.getImageFileByReviewAndId(1, 2, 999, 'ADMIN');
    expect(result).toBe('xyz.jpg');
  });

  it('allows reviewee to access image', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue({
      id: 3,
      filePath: 'uploads/host.jpg',
      review: { reviewerId: 5, revieweeId: 15 },
    } as any);

    const result = await reviewsService.getImageFileByReviewAndId(1, 3, 15, 'HOST');
    expect(result).toBe('host.jpg');
  });
});

// ─── getImageFileByFilename ────────────────────────────────────────────────────

describe('ReviewsService - getImageFileByFilename', () => {
  it('throws NOT_FOUND when file does not exist', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue(null);

    await expect(
      reviewsService.getImageFileByFilename('missing.jpg', 1, 'GUEST')
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('returns safe basename when access is allowed', async () => {
    vi.mocked(prisma.reviewImage.findFirst).mockResolvedValue({
      id: 1,
      filePath: 'file.jpg',
      review: { reviewerId: 3, revieweeId: null },
    } as any);

    const result = await reviewsService.getImageFileByFilename('file.jpg', 3, 'GUEST');
    expect(result).toBe('file.jpg');
  });
});

// ─── createHostReply - rate limit and content filter ─────────────────────────

describe('ReviewsService - createHostReply guards', () => {
  it('throws RATE_LIMITED when host reply rate limit is exceeded', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue({
      id: 1, revieweeId: 30, createdAt: daysAgo(1),
    } as any);
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(10); // exceeded

    await expect(
      reviewsService.createHostReply(1, { text: 'Thanks!' }, 30, 'HOST')
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
  });

  it('throws CONTENT_FILTERED when reply text contains prohibited words', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue({
      id: 1, revieweeId: 30, createdAt: daysAgo(1),
    } as any);
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(prisma.hostReply.findUnique).mockResolvedValue(null);
    vi.mocked(filterContent).mockResolvedValue({ clean: false, flaggedWords: ['spam'] });

    await expect(
      reviewsService.createHostReply(1, { text: 'spam content' }, 30, 'HOST')
    ).rejects.toMatchObject({ code: 'CONTENT_FILTERED', statusCode: 422 });
  });
});
