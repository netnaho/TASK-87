import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { config } from '../../config';
import { RateTaskInput, AdminAdjustInput } from './trust.schema';

function businessError(code: string, message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

// Hardcoded defaults — used when the credit_rules table is empty.
const DEFAULT_CREDIT_DELTA: Record<number, number> = {
  5: 2,
  4: 1,
  3: 0,
  2: -1,
  1: -2,
};

/** Source of the active credit rules — 'db' when table has rows, 'fallback' otherwise. */
export type CreditRuleSource = 'db' | 'fallback';

export interface CreditRulesWithMeta {
  rules: Record<number, number>;
  source: CreditRuleSource;
  /** Whether fallback-to-defaults is permitted when the table is empty (env flag). */
  fallbackEnabled: boolean;
}

/**
 * Read credit rules from DB and return them together with observability metadata.
 *
 * Fallback policy (empty table):
 *   If ALLOW_TRUST_RULE_FALLBACK=true (default) the hardcoded defaults are used
 *   and a structured warning is emitted so operators can notice and seed explicit
 *   rules via PUT /trust/admin/credit-rules.
 *
 *   If ALLOW_TRUST_RULE_FALLBACK=false an explicit 503 is raised instead, ensuring
 *   misconfigured deployments fail loudly rather than silently applying stale defaults.
 *
 * Default credit policy (empty table):
 *   5★ → +2, 4★ → +1, 3★ → 0, 2★ → -1, 1★ → -2
 */
export async function getCreditRulesWithMeta(): Promise<CreditRulesWithMeta> {
  const fallbackEnabled = config.trust.allowFallback;
  const rows = await prisma.creditRule.findMany();

  if (rows.length === 0) {
    if (!fallbackEnabled) {
      businessError(
        'RULES_NOT_CONFIGURED',
        'credit_rules table is empty and ALLOW_TRUST_RULE_FALLBACK=false. ' +
          'Seed default rules via PUT /trust/admin/credit-rules.',
        503,
      );
    }
    logger.warn(
      { defaults: DEFAULT_CREDIT_DELTA, fallbackEnabled },
      'credit_rules table is empty — using hardcoded fallback defaults. ' +
        'Set ALLOW_TRUST_RULE_FALLBACK=false to surface this as an error instead. ' +
        'Run PUT /trust/admin/credit-rules to persist explicit rules.',
    );
    return { rules: { ...DEFAULT_CREDIT_DELTA }, source: 'fallback', fallbackEnabled };
  }

  logger.debug({ count: rows.length }, 'Using persisted credit rules from DB');
  const rules: Record<number, number> = {};
  for (const row of rows) {
    rules[row.rating] = row.delta;
  }
  return { rules, source: 'db', fallbackEnabled };
}

/**
 * Convenience wrapper — returns only the rating→delta map.
 * Used internally by rateTask and other callers that don't need observability metadata.
 */
export async function getCreditRules(): Promise<Record<number, number>> {
  return (await getCreditRulesWithMeta()).rules;
}

/**
 * Persist a full or partial set of rating→delta overrides.
 * Runs as a single transaction so the table is never left in a partial state.
 */
export async function setCreditRules(rules: Record<number, number>): Promise<void> {
  const entries = Object.entries(rules).map(([k, v]) => ({
    rating: Number(k),
    delta: Number(v),
  }));
  await prisma.$transaction(async (tx) => {
    for (const { rating, delta } of entries) {
      await tx.creditRule.upsert({
        where: { rating },
        create: { rating, delta },
        update: { delta },
      });
    }
  });
}

/**
 * Delete all custom rows — next read of getCreditRules() returns defaults.
 */
export async function resetCreditRules(): Promise<void> {
  await prisma.creditRule.deleteMany({});
}

function buildExplanation(rating: number, delta: number, taskId: number): string {
  if (delta > 0) return `Received ${rating}★ rating on task #${taskId}: +${delta} trust credit`;
  if (delta < 0) return `Received ${rating}★ rating on task #${taskId}: ${delta} trust credit`;
  return `Received ${rating}★ rating on task #${taskId}: no trust change`;
}

export class TrustService {
  async getScore(userId: number) {
    const score = await prisma.trustScore.findUnique({ where: { userId } });
    return score ?? { userId, score: 50 };
  }

  async getUserHistory(userId: number, page: number, pageSize: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) businessError('NOT_FOUND', 'User not found', 404);
    return this.getHistory(userId, page, pageSize);
  }

  async getHistory(userId: number, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.creditHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.creditHistory.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getLeaderboard(limit: number = 10) {
    return prisma.trustScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
  }

  async getAllScores() {
    return prisma.trustScore.findMany({
      orderBy: { score: 'desc' },
      include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
    });
  }

  async rateTask(input: RateTaskInput, raterId: number) {
    // Prevent self-rating
    if (input.rateeId === raterId) {
      businessError('SELF_RATING', 'Cannot rate yourself', 422);
    }

    // Validate interaction exists
    const interaction = await prisma.serviceInteraction.findUnique({
      where: { id: input.taskId },
    });
    if (!interaction) {
      businessError('INTERACTION_NOT_FOUND', 'Service interaction not found', 404);
    }

    // Validate interaction is completed
    if (interaction!.status !== 'COMPLETED') {
      businessError('INTERACTION_NOT_COMPLETED', 'Can only rate completed interactions', 422);
    }

    // Validate rater and ratee are both participants
    const participantIds = new Set([interaction!.requesterId, interaction!.providerId]);
    if (!participantIds.has(raterId) || !participantIds.has(input.rateeId)) {
      businessError('NOT_PARTICIPANT', 'Rater and ratee must both be participants of this interaction', 403);
    }

    // Unique per rater+task
    const existing = await prisma.taskRating.findUnique({
      where: { raterId_taskId: { raterId, taskId: input.taskId } },
    });
    if (existing) businessError('DUPLICATE', 'You have already rated this task', 409);

    // Verify ratee exists
    const ratee = await prisma.user.findUnique({ where: { id: input.rateeId } });
    if (!ratee) businessError('NOT_FOUND', 'Ratee user not found', 404);

    const rules = await getCreditRules();
    const delta = rules[input.rating] ?? 0;
    const explanation = buildExplanation(input.rating, delta, input.taskId);

    await prisma.$transaction(async (tx) => {
      // Create rating record
      await tx.taskRating.create({
        data: {
          raterId,
          rateeId: input.rateeId,
          taskId: input.taskId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
      });

      if (delta !== 0) {
        // Upsert trust score, clamp 0-100
        const current = await tx.trustScore.findUnique({ where: { userId: input.rateeId } });
        const currentScore = Number(current?.score ?? 50);
        const newScore = Math.max(0, Math.min(100, currentScore + delta));

        await tx.trustScore.upsert({
          where: { userId: input.rateeId },
          create: { userId: input.rateeId, score: newScore, lastUpdated: new Date() },
          update: { score: newScore, lastUpdated: new Date() },
        });

        // Credit history
        await tx.creditHistory.create({
          data: {
            userId: input.rateeId,
            changeAmount: delta,
            reason: `Task rating from user #${raterId}`,
            sourceType: 'TASK_RATING',
            sourceId: input.taskId,
            explanation,
          },
        });
      }
    });

    logger.info({ raterId, rateeId: input.rateeId, taskId: input.taskId, rating: input.rating }, 'Task rated');
    return { message: 'Rating submitted', delta, explanation };
  }

  async adminAdjust(input: AdminAdjustInput, adminId: number) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) businessError('NOT_FOUND', 'User not found', 404);

    const current = await prisma.trustScore.findUnique({ where: { userId: input.userId } });
    const currentScore = Number(current?.score ?? 50);
    const newScore = Math.max(0, Math.min(100, currentScore + input.changeAmount));

    await prisma.$transaction(async (tx) => {
      await tx.trustScore.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, score: newScore, lastUpdated: new Date() },
        update: { score: newScore, lastUpdated: new Date() },
      });

      const direction = input.changeAmount > 0 ? `+${input.changeAmount}` : `${input.changeAmount}`;
      await tx.creditHistory.create({
        data: {
          userId: input.userId,
          changeAmount: input.changeAmount,
          reason: input.reason,
          sourceType: 'ADMIN_ADJUSTMENT',
          sourceId: adminId,
          explanation: `Admin adjustment by #${adminId}: ${direction} (${input.reason})`,
        },
      });
    });

    logger.info({ adminId, targetUserId: input.userId, changeAmount: input.changeAmount }, 'Trust score adjusted by admin');
    return { userId: input.userId, previousScore: currentScore, newScore };
  }
}

export const trustService = new TrustService();
