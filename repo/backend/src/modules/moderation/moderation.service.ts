import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import {
  FileReportInput,
  TakeActionInput,
  FileAppealInput,
  ResolveAppealInput,
  AddSensitiveWordInput,
} from './moderation.schema';
import { cache } from '../../lib/cache';
import {
  canAppealTransition,
  getReviewStatusAfterAction,
  shouldRestoreOnOverturned,
} from './moderation.utils';

function businessError(code: string, message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

export class ModerationService {
  async fileReport(input: FileReportInput, reporterId: number) {
    // Prevent duplicate reports from same user on same content
    const existing = await prisma.report.findFirst({
      where: {
        reporterId,
        contentType: input.contentType,
        contentId: input.contentId,
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
    });
    if (existing) businessError('DUPLICATE', 'You have already reported this content', 409);

    const report = await prisma.report.create({
      data: {
        reporterId,
        contentType: input.contentType,
        contentId: input.contentId,
        reviewId: input.reviewId ?? null,
        reason: input.reason,
        status: 'PENDING',
      },
    });

    // If content is a review, flag it
    if (input.contentType === 'REVIEW' && input.reviewId) {
      await prisma.review.update({
        where: { id: input.reviewId },
        data: { status: 'FLAGGED' },
      });
    }

    logger.info({ reportId: report.id, reporterId, contentType: input.contentType, contentId: input.contentId }, 'Report filed');
    return report;
  }

  async getQueue(status?: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['PENDING', 'IN_REVIEW'] };
    }

    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          reporter: { select: { id: true, displayName: true } },
          review: { select: { id: true, text: true, status: true } },
          actions: {
            include: { moderator: { select: { id: true, displayName: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.report.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async assignReport(reportId: number, moderatorId: number) {
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) businessError('NOT_FOUND', 'Report not found', 404);
    if (report!.status === 'RESOLVED' || report!.status === 'DISMISSED') {
      businessError('INVALID_STATE', 'Report is already closed', 422);
    }

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: { assignedTo: moderatorId, status: 'IN_REVIEW' },
    });

    logger.info({ reportId, moderatorId }, 'Report assigned');
    return updated;
  }

  async takeAction(reportId: number, input: TakeActionInput, moderatorId: number) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { review: true },
    });
    if (!report) businessError('NOT_FOUND', 'Report not found', 404);
    if (report!.status === 'RESOLVED' || report!.status === 'DISMISSED') {
      businessError('INVALID_STATE', 'Report is already closed', 422);
    }

    const moderationAction = await prisma.$transaction(async (tx) => {
      const action = await tx.moderationAction.create({
        data: {
          reportId,
          moderatorId,
          action: input.action,
          notes: input.notes ?? null,
        },
      });

      // Side-effect on review status
      if (report!.reviewId) {
        const reviewStatus = getReviewStatusAfterAction(input.action);
        if (reviewStatus) {
          await tx.review.update({
            where: { id: report!.reviewId },
            data: { status: reviewStatus as any },
          });
        }
      }

      // Close the report
      await tx.report.update({
        where: { id: reportId },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });

      return action;
    });

    logger.info({ reportId, action: input.action, moderatorId }, 'Moderation action taken');
    return moderationAction;
  }

  async getAudit(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.moderationAction.findMany({
        skip,
        take: pageSize,
        include: {
          moderator: { select: { id: true, displayName: true } },
          report: { select: { id: true, contentType: true, contentId: true } },
          appeals: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.moderationAction.count(),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async fileAppeal(input: FileAppealInput, userId: number) {
    const action = await prisma.moderationAction.findUnique({
      where: { id: input.moderationActionId },
      include: { report: true },
    });
    if (!action) businessError('NOT_FOUND', 'Moderation action not found', 404);

    // Object-level authorization: only the affected user can appeal
    let affectedUserId: number | null = null;
    const report = action!.report;
    if (report.contentType === 'REVIEW') {
      const reviewId = report.reviewId ?? report.contentId;
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (review) affectedUserId = review.reviewerId;
    } else if (report.contentType === 'USER') {
      affectedUserId = report.contentId;
    }

    if (affectedUserId !== userId) {
      businessError('FORBIDDEN', 'You can only appeal moderation actions on your own content', 403);
    }

    // One appeal per user per moderation action
    const existing = await prisma.appeal.findFirst({
      where: { userId, moderationActionId: input.moderationActionId },
    });
    if (existing) businessError('DUPLICATE', 'You have already appealed this action', 409);

    const appeal = await prisma.appeal.create({
      data: {
        userId,
        moderationActionId: input.moderationActionId,
        userStatement: input.userStatement,
        status: 'PENDING',
      },
    });

    logger.info({ appealId: appeal.id, userId, moderationActionId: input.moderationActionId }, 'Appeal filed');
    return appeal;
  }

  async listAppeals(status?: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.appeal.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, displayName: true } },
          moderationAction: {
            include: {
              moderator: { select: { id: true, displayName: true } },
              report: { select: { id: true, contentType: true, contentId: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appeal.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async resolveAppeal(appealId: number, input: ResolveAppealInput) {
    const appeal = await prisma.appeal.findUnique({
      where: { id: appealId },
      include: {
        moderationAction: {
          include: { report: { include: { review: true } } },
        },
      },
    });
    if (!appeal) businessError('NOT_FOUND', 'Appeal not found', 404);

    // State machine: PENDING/IN_REVIEW → UPHELD/OVERTURNED/IN_REVIEW
    if (!canAppealTransition(appeal!.status, input.status)) {
      businessError('INVALID_STATE', `Cannot transition from ${appeal!.status} to ${input.status}`, 422);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const resolvedAt = ['UPHELD', 'OVERTURNED'].includes(input.status) ? new Date() : null;

      const result = await tx.appeal.update({
        where: { id: appealId },
        data: {
          status: input.status as any,
          arbitrationNotes: input.arbitrationNotes ?? null,
          outcome: input.outcome ?? null,
          resolvedAt,
        },
      });

      // On OVERTURNED: restore the review if the action was HIDE or REMOVE
      if (input.status === 'OVERTURNED') {
        const originalAction = appeal!.moderationAction.action;
        const reviewId = appeal!.moderationAction.report.reviewId;
        if (reviewId && shouldRestoreOnOverturned(originalAction)) {
          await tx.review.update({
            where: { id: reviewId },
            data: { status: 'ACTIVE' },
          });
        }
      }

      return result;
    });

    logger.info({ appealId, status: input.status }, 'Appeal resolved');
    return updated;
  }

  // ─── User-facing endpoints ────────────────────────────────────────────────────

  async listMyAppeals(userId: number, status?: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.appeal.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          moderationAction: {
            include: {
              moderator: { select: { id: true, displayName: true } },
              report: {
                select: { id: true, contentType: true, contentId: true, reviewId: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appeal.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async listMyModerationActions(userId: number, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    // Gather all review IDs belonging to this user
    const userReviews = await prisma.review.findMany({
      where: { reviewerId: userId },
      select: { id: true },
    });
    const reviewIds = userReviews.map((r) => r.id);

    // Build the where clause — actions affecting user's reviews OR user account directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any =
      reviewIds.length > 0
        ? {
            OR: [
              { report: { contentType: 'REVIEW', reviewId: { in: reviewIds } } },
              { report: { contentType: 'REVIEW', contentId: { in: reviewIds } } },
              { report: { contentType: 'USER', contentId: userId } },
            ],
          }
        : { report: { contentType: 'USER', contentId: userId } };

    const [items, total] = await Promise.all([
      prisma.moderationAction.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          report: {
            select: {
              id: true,
              contentType: true,
              contentId: true,
              reviewId: true,
              reason: true,
            },
          },
          // Only include this user's own appeals so the client knows if already appealed
          appeals: {
            where: { userId },
            select: { id: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.moderationAction.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async addSensitiveWord(input: AddSensitiveWordInput) {
    const normalized = input.word.toLowerCase();
    const word = await prisma.sensitiveWord.upsert({
      where: { word: normalized },
      create: { word: normalized, category: input.category ?? null },
      update: { category: input.category ?? null },
    });

    // Invalidate cache so next content filter reload picks up the new word
    cache.delete('sensitive_words');

    logger.info({ wordId: word.id, word: word.word }, 'Sensitive word added');
    return word;
  }

  async listSensitiveWords(page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.sensitiveWord.findMany({
        skip,
        take: pageSize,
        orderBy: { word: 'asc' },
      }),
      prisma.sensitiveWord.count(),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async deleteSensitiveWord(id: number) {
    const word = await prisma.sensitiveWord.findUnique({ where: { id } });
    if (!word) businessError('NOT_FOUND', 'Sensitive word not found', 404);

    await prisma.sensitiveWord.delete({ where: { id } });
    cache.delete('sensitive_words');

    logger.info({ wordId: id }, 'Sensitive word removed');
    return { deleted: true };
  }
}

export const moderationService = new ModerationService();
