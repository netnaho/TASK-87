import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    review: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    hostReply: { findUnique: vi.fn(), create: vi.fn() },
    rateLimitLog: { count: vi.fn(), create: vi.fn().mockResolvedValue({}) },
    tag: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/contentFilter', () => ({
  filterContent: vi.fn().mockResolvedValue({ clean: true, flaggedWords: [] }),
}));

import prisma from '@/lib/prisma';
import { filterContent } from '@/lib/contentFilter';
import { reviewsService } from '@/modules/reviews/reviews.service';
import { createReviewSchema } from '@/modules/reviews/reviews.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function makeReview(overrides: Partial<{
  id: number;
  reviewerId: number;
  revieweeId: number | null;
  createdAt: Date;
  targetType: string;
  targetId: number;
}>): object {
  return {
    id: 1,
    reviewerId: 10,
    revieweeId: 20,
    createdAt: new Date(),
    targetType: 'STAY',
    targetId: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.rateLimitLog.create).mockResolvedValue({} as any);
  vi.mocked(filterContent).mockResolvedValue({ clean: true, flaggedWords: [] });
});

// ─── Follow-up timing window ──────────────────────────────────────────────────

describe('Reviews - Follow-up Window', () => {
  it('throws WINDOW_EXPIRED when parent review is older than 7 days', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 10, createdAt: daysAgo(8) }) as any
    );

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 10, [])
    ).rejects.toMatchObject({ code: 'WINDOW_EXPIRED', statusCode: 422 });
  });

  it('allows follow-up when parent is within 7 days', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 10, createdAt: daysAgo(6) }) as any
    );
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null); // no existing follow-up
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 2, overallRating: 4, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 10, [])
    ).resolves.toBeDefined();
  });

  it('allows follow-up exactly at the 7-day boundary', async () => {
    // Exactly 7 days ago — daysSince ≈ 7.000 which is NOT > 7, so allowed
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 10, createdAt: daysAgo(7) }) as any
    );
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 2, overallRating: 4, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 10, [])
    ).resolves.toBeDefined();
  });
});

// ─── Follow-up ownership ──────────────────────────────────────────────────────

describe('Reviews - Follow-up Ownership', () => {
  it('throws FORBIDDEN when caller is not the original reviewer', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 10, createdAt: daysAgo(1) }) as any
    );

    // Caller is user 99, but review owner is 10
    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 99, [])
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('allows follow-up when caller is the original reviewer', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 42, createdAt: daysAgo(1) }) as any
    );
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 2, overallRating: 3.7, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 3, ratingAccuracy: 4,
      }, 42, [])
    ).resolves.toBeDefined();
  });

  it('throws DUPLICATE when follow-up already exists', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 10, createdAt: daysAgo(1) }) as any
    );
    vi.mocked(prisma.review.findFirst).mockResolvedValue({ id: 99 } as any); // existing

    await expect(
      reviewsService.createFollowUp(1, {
        ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4,
      }, 10, [])
    ).rejects.toMatchObject({ code: 'DUPLICATE', statusCode: 409 });
  });
});

// ─── Host reply window ─────────────────────────────────────────────────────────

describe('Reviews - Host Reply Window', () => {
  it('throws WINDOW_EXPIRED when review is older than 14 days', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(15) }) as any
    );

    await expect(
      reviewsService.createHostReply(1, { text: 'Thank you!' }, 30, 'HOST')
    ).rejects.toMatchObject({ code: 'WINDOW_EXPIRED', statusCode: 422 });
  });

  it('allows host reply within 14 days', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(13) }) as any
    );
    vi.mocked(prisma.hostReply.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.hostReply.create).mockResolvedValue({
      id: 1, host: { id: 30, displayName: 'Host' },
    } as any);

    await expect(
      reviewsService.createHostReply(1, { text: 'Thank you!' }, 30, 'HOST')
    ).resolves.toBeDefined();
  });

  it('allows host reply exactly at the 14-day boundary', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(14) }) as any
    );
    vi.mocked(prisma.hostReply.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.hostReply.create).mockResolvedValue({
      id: 1, host: { id: 30, displayName: 'Host' },
    } as any);

    await expect(
      reviewsService.createHostReply(1, { text: 'Thanks!' }, 30, 'HOST')
    ).resolves.toBeDefined();
  });
});

// ─── Host reply authorization ─────────────────────────────────────────────────

describe('Reviews - Host Reply Authorization', () => {
  it('throws FORBIDDEN when HOST replies to a review not about them', async () => {
    // revieweeId is 30, but caller is 99
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(1) }) as any
    );

    await expect(
      reviewsService.createHostReply(1, { text: 'Hello!' }, 99, 'HOST')
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('ADMIN bypasses ownership check', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(1) }) as any
    );
    vi.mocked(prisma.hostReply.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.hostReply.create).mockResolvedValue({
      id: 1, host: { id: 99, displayName: 'Admin' },
    } as any);

    // Caller 99 is ADMIN, revieweeId is 30 — should succeed despite ownership mismatch
    await expect(
      reviewsService.createHostReply(1, { text: 'Admin reply' }, 99, 'ADMIN')
    ).resolves.toBeDefined();
  });

  it('MANAGER bypasses ownership check', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(1) }) as any
    );
    vi.mocked(prisma.hostReply.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.hostReply.create).mockResolvedValue({
      id: 1, host: { id: 55, displayName: 'Manager' },
    } as any);

    await expect(
      reviewsService.createHostReply(1, { text: 'Manager reply' }, 55, 'MANAGER')
    ).resolves.toBeDefined();
  });

  it('throws DUPLICATE when host has already replied', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ revieweeId: 30, createdAt: daysAgo(1) }) as any
    );
    vi.mocked(prisma.hostReply.findUnique).mockResolvedValue({ id: 1 } as any);

    await expect(
      reviewsService.createHostReply(1, { text: 'Second reply' }, 30, 'HOST')
    ).rejects.toMatchObject({ code: 'DUPLICATE', statusCode: 409 });
  });
});

// ─── Rating calculation via createReview ─────────────────────────────────────

describe('Reviews - Rating Calculation', () => {
  function setupCreateReview() {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(prisma.review.create).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 1, ...data, images: [], tags: [] })
    );
  }

  it('averages three equal ratings to produce overallRating', async () => {
    setupCreateReview();
    await reviewsService.createReview(
      { targetType: 'STAY', targetId: 1, ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4 },
      10, []
    );
    const createArg = vi.mocked(prisma.review.create).mock.calls[0][0] as any;
    expect(createArg.data.overallRating).toBe(4.0);
  });

  it('correctly averages mixed ratings', async () => {
    setupCreateReview();
    await reviewsService.createReview(
      { targetType: 'STAY', targetId: 1, ratingCleanliness: 5, ratingCommunication: 3, ratingAccuracy: 4 },
      10, []
    );
    const createArg = vi.mocked(prisma.review.create).mock.calls[0][0] as any;
    expect(createArg.data.overallRating).toBe(4.0);
  });

  it('rounds overallRating to one decimal place', async () => {
    setupCreateReview();
    await reviewsService.createReview(
      { targetType: 'STAY', targetId: 1, ratingCleanliness: 5, ratingCommunication: 5, ratingAccuracy: 4 },
      10, []
    );
    const createArg = vi.mocked(prisma.review.create).mock.calls[0][0] as any;
    expect(createArg.data.overallRating).toBe(4.7);
  });

  it('handles all-1 ratings producing 1.0', async () => {
    setupCreateReview();
    await reviewsService.createReview(
      { targetType: 'STAY', targetId: 1, ratingCleanliness: 1, ratingCommunication: 1, ratingAccuracy: 1 },
      10, []
    );
    const createArg = vi.mocked(prisma.review.create).mock.calls[0][0] as any;
    expect(createArg.data.overallRating).toBe(1.0);
  });

  it('calculates overallRating correctly in createFollowUp as well', async () => {
    vi.mocked(prisma.review.findUnique).mockResolvedValue(
      makeReview({ reviewerId: 10, createdAt: daysAgo(1) }) as any
    );
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.review.create).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 2, ...data, images: [], tags: [] })
    );

    await reviewsService.createFollowUp(1, {
      ratingCleanliness: 5, ratingCommunication: 4, ratingAccuracy: 3,
    }, 10, []);

    const createArg = vi.mocked(prisma.review.create).mock.calls[0][0] as any;
    expect(createArg.data.overallRating).toBe(4.0);
  });
});

// ─── Anti-spam: self-review prevention ───────────────────────────────────────

describe('Reviews - Self-review Prevention', () => {
  it('throws SELF_REVIEW when revieweeId equals reviewerId', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1, revieweeId: 42,
          ratingCleanliness: 5, ratingCommunication: 5, ratingAccuracy: 5 },
        42, []
      )
    ).rejects.toMatchObject({ code: 'SELF_REVIEW', statusCode: 422 });
  });

  it('proceeds when revieweeId differs from reviewerId', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 1, overallRating: 5, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1, revieweeId: 99,
          ratingCleanliness: 5, ratingCommunication: 5, ratingAccuracy: 5 },
        42, []
      )
    ).resolves.toBeDefined();
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe('Reviews - Rate Limiting', () => {
  it('throws RATE_LIMITED when 3 or more reviews were created in the last hour', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(3);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1,
          ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4 },
        10, []
      )
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
  });

  it('allows creation when fewer than 3 recent reviews exist', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(2);
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 1, overallRating: 4, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1,
          ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4 },
        10, []
      )
    ).resolves.toBeDefined();
  });
});

// ─── Content filtering ────────────────────────────────────────────────────────

describe('Reviews - Content Filtering', () => {
  it('throws CONTENT_FILTERED when text contains prohibited words', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(filterContent).mockResolvedValue({
      clean: false, flaggedWords: ['badword'],
    });

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1, text: 'contains badword',
          ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4 },
        10, []
      )
    ).rejects.toMatchObject({ code: 'CONTENT_FILTERED', statusCode: 422 });
  });

  it('proceeds when content is clean', async () => {
    vi.mocked(prisma.rateLimitLog.count).mockResolvedValue(0);
    vi.mocked(filterContent).mockResolvedValue({ clean: true, flaggedWords: [] });
    vi.mocked(prisma.review.create).mockResolvedValue({
      id: 1, overallRating: 4, images: [], tags: [],
    } as any);

    await expect(
      reviewsService.createReview(
        { targetType: 'STAY', targetId: 1, text: 'Great stay!',
          ratingCleanliness: 4, ratingCommunication: 4, ratingAccuracy: 4 },
        10, []
      )
    ).resolves.toBeDefined();
  });
});

// ─── Tag limit via Zod schema (enforced at input validation layer) ─────────────

describe('Reviews - Tag Limit (Schema)', () => {
  it('rejects more than 10 tags', () => {
    const result = createReviewSchema.safeParse({
      targetType: 'STAY',
      targetId: 1,
      ratingCleanliness: 4,
      ratingCommunication: 4,
      ratingAccuracy: 4,
      tagIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 10 tags', () => {
    const result = createReviewSchema.safeParse({
      targetType: 'STAY',
      targetId: 1,
      ratingCleanliness: 4,
      ratingCommunication: 4,
      ratingAccuracy: 4,
      tagIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(result.success).toBe(true);
  });

  it('accepts no tags', () => {
    const result = createReviewSchema.safeParse({
      targetType: 'STAY',
      targetId: 1,
      ratingCleanliness: 4,
      ratingCommunication: 4,
      ratingAccuracy: 4,
    });
    expect(result.success).toBe(true);
  });
});
