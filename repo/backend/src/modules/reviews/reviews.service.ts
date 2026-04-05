import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { filterContent } from '../../lib/contentFilter';
import {
  CreateReviewInput,
  CreateFollowUpInput,
  CreateHostReplyInput,
  ReviewsQuery,
} from './reviews.schema';

function businessError(code: string, message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

function calcOverall(cleanliness: number, communication: number, accuracy: number): number {
  return Math.round(((cleanliness + communication + accuracy) / 3) * 10) / 10;
}

export class ReviewsService {
  async createReview(
    input: CreateReviewInput,
    reviewerId: number,
    files: Express.Multer.File[]
  ) {
    // Content filter
    if (input.text) {
      const { clean, flaggedWords } = await filterContent(input.text);
      if (!clean) {
        businessError('CONTENT_FILTERED', `Review contains prohibited words: ${flaggedWords.join(', ')}`, 422);
      }
    }

    // Rate limit: max 3 reviews per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.rateLimitLog.count({
      where: { userId: reviewerId, action: 'create_review', createdAt: { gte: oneHourAgo } },
    });
    if (recentCount >= 3) {
      businessError('RATE_LIMITED', 'Maximum 3 reviews per hour', 429);
    }

    // Cannot review yourself
    if (input.revieweeId && input.revieweeId === reviewerId) {
      businessError('SELF_REVIEW', 'Cannot review yourself', 422);
    }

    // Validate tag IDs exist
    if (input.tagIds && input.tagIds.length > 0) {
      const tags = await prisma.tag.findMany({ where: { id: { in: input.tagIds } } });
      if (tags.length !== input.tagIds.length) {
        businessError('INVALID_TAGS', 'One or more tag IDs do not exist', 422);
      }
    }

    const overallRating = calcOverall(
      input.ratingCleanliness,
      input.ratingCommunication,
      input.ratingAccuracy
    );

    const review = await prisma.review.create({
      data: {
        reviewerId,
        revieweeId: input.revieweeId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        ratingCleanliness: input.ratingCleanliness,
        ratingCommunication: input.ratingCommunication,
        ratingAccuracy: input.ratingAccuracy,
        overallRating,
        text: input.text ?? null,
        images: files.length > 0
          ? {
              create: files.map((f) => ({
                filePath: f.filename,
                fileSize: f.size,
              })),
            }
          : undefined,
        tags: input.tagIds && input.tagIds.length > 0
          ? { create: input.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        images: true,
        tags: { include: { tag: true } },
      },
    });

    // Log for rate limiting
    await prisma.rateLimitLog.create({
      data: { userId: reviewerId, action: 'create_review' },
    });

    logger.info({ reviewId: review.id, reviewerId }, 'Review created');
    return review;
  }

  async getReview(id: number) {
    const review = await prisma.review.findUnique({
      where: { id },
      include: {
        reviewer: { select: { id: true, displayName: true } },
        reviewee: { select: { id: true, displayName: true } },
        images: true,
        tags: { include: { tag: true } },
        hostReply: { include: { host: { select: { id: true, displayName: true } } } },
        followUps: {
          include: {
            images: true,
            tags: { include: { tag: true } },
          },
        },
      },
    });
    if (!review) businessError('NOT_FOUND', 'Review not found', 404);
    return review;
  }

  async listReviews(query: ReviewsQuery) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10)));
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (query.targetType) where.targetType = query.targetType;
    if (query.status) where.status = query.status;
    if (query.revieweeId) where.revieweeId = parseInt(query.revieweeId, 10);
    // Top-level reviews only (no follow-ups in list)
    where.isFollowUp = false;

    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          reviewer: { select: { id: true, displayName: true } },
          images: true,
          tags: { include: { tag: true } },
          hostReply: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async createFollowUp(
    parentReviewId: number,
    input: CreateFollowUpInput,
    reviewerId: number,
    files: Express.Multer.File[]
  ) {
    const parent = await prisma.review.findUnique({ where: { id: parentReviewId } });
    if (!parent) businessError('NOT_FOUND', 'Parent review not found', 404);

    if (parent!.reviewerId !== reviewerId) {
      businessError('FORBIDDEN', 'Can only follow up on your own reviews', 403);
    }

    // 7-day window
    const daysSince = (Date.now() - parent!.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) {
      businessError('WINDOW_EXPIRED', 'Follow-up window of 7 days has passed', 422);
    }

    // No existing follow-up
    const existing = await prisma.review.findFirst({
      where: { parentReviewId, isFollowUp: true },
    });
    if (existing) businessError('DUPLICATE', 'Follow-up already exists for this review', 409);

    if (input.text) {
      const { clean, flaggedWords } = await filterContent(input.text);
      if (!clean) {
        businessError('CONTENT_FILTERED', `Content contains prohibited words: ${flaggedWords.join(', ')}`, 422);
      }
    }

    const overallRating = calcOverall(
      input.ratingCleanliness,
      input.ratingCommunication,
      input.ratingAccuracy
    );

    const followUp = await prisma.review.create({
      data: {
        reviewerId,
        revieweeId: parent!.revieweeId,
        targetType: parent!.targetType,
        targetId: parent!.targetId,
        ratingCleanliness: input.ratingCleanliness,
        ratingCommunication: input.ratingCommunication,
        ratingAccuracy: input.ratingAccuracy,
        overallRating,
        text: input.text ?? null,
        isFollowUp: true,
        parentReviewId,
        images: files.length > 0
          ? { create: files.map((f) => ({ filePath: f.filename, fileSize: f.size })) }
          : undefined,
        tags: input.tagIds && input.tagIds.length > 0
          ? { create: input.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        images: true,
        tags: { include: { tag: true } },
      },
    });

    logger.info({ followUpId: followUp.id, parentReviewId, reviewerId }, 'Follow-up created');
    return followUp;
  }

  async createHostReply(
    reviewId: number,
    input: CreateHostReplyInput,
    hostId: number,
    callerRole: string
  ) {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) businessError('NOT_FOUND', 'Review not found', 404);

    // Object-level authorization: HOST can only reply to reviews about them
    if (callerRole !== 'ADMIN' && callerRole !== 'MANAGER') {
      if (review!.revieweeId !== hostId) {
        businessError('FORBIDDEN', 'You can only reply to reviews about your property', 403);
      }
    }

    // 14-day window
    const daysSince = (Date.now() - review!.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 14) {
      businessError('WINDOW_EXPIRED', 'Host reply window of 14 days has passed', 422);
    }

    // Already replied
    const existingReply = await prisma.hostReply.findUnique({ where: { reviewId } });
    if (existingReply) businessError('DUPLICATE', 'Host reply already exists for this review', 409);

    if (input.text) {
      const { clean, flaggedWords } = await filterContent(input.text);
      if (!clean) {
        businessError('CONTENT_FILTERED', `Reply contains prohibited words: ${flaggedWords.join(', ')}`, 422);
      }
    }

    const reply = await prisma.hostReply.create({
      data: { reviewId, hostId, text: input.text },
      include: { host: { select: { id: true, displayName: true } } },
    });

    logger.info({ replyId: reply.id, reviewId, hostId }, 'Host reply created');
    return reply;
  }

  async listTags() {
    return prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }
}

export const reviewsService = new ReviewsService();
