import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { CreatePromotionInput, UpdatePromotionInput, CheckoutInput } from './promotions.schema';

function businessError(code: string, message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

interface LineResult {
  itemId: number;
  quantity: number;
  unitPrice: number;
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  promotionId: number | null;
  promotionName: string | null;
  discountExplanation: string | null;
}

function calculateDiscount(
  unitPrice: number,
  quantity: number,
  discountType: string,
  discountValue: number
): number {
  const lineTotal = unitPrice * quantity;
  if (discountType === 'PERCENTAGE') {
    return Math.round(lineTotal * (discountValue / 100) * 100) / 100;
  }
  // FIXED_AMOUNT — cap at line total
  return Math.min(discountValue, lineTotal);
}

function buildDiscountExplanation(promotionName: string, discountType: string, discountValue: number): string {
  if (discountType === 'PERCENTAGE') {
    return `${promotionName}: ${discountValue}% off`;
  }
  return `${promotionName}: $${discountValue.toFixed(2)} off`;
}

export class PromotionsService {
  async listPromotions(isActive?: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (isActive === 'true') where.isActive = true;
    else if (isActive === 'false') where.isActive = false;

    const [items, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          items: { include: { item: { select: { id: true, name: true, sku: true } } } },
          exclusionsFrom: { include: { excludedPromotion: { select: { id: true, name: true } } } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.promotion.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async createPromotion(input: CreatePromotionInput) {
    const promotion = await prisma.$transaction(async (tx) => {
      const created = await tx.promotion.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          discountType: input.discountType,
          discountValue: input.discountValue,
          effectiveStart: new Date(input.effectiveStart),
          effectiveEnd: new Date(input.effectiveEnd),
          priority: input.priority ?? 0,
          isActive: input.isActive ?? true,
          conditions: (input.conditions ?? undefined) as any,
        },
      });

      if (input.itemIds && input.itemIds.length > 0) {
        await tx.promotionItem.createMany({
          data: input.itemIds.map((itemId) => ({ promotionId: created.id, itemId })),
        });
      }

      if (input.exclusions && input.exclusions.length > 0) {
        await tx.promotionExclusion.createMany({
          data: input.exclusions.map((excludedId) => ({
            promotionId: created.id,
            excludedPromotionId: excludedId,
          })),
        });
      }

      return created;
    });

    logger.info({ promotionId: promotion.id, name: promotion.name }, 'Promotion created');
    return promotion;
  }

  async updatePromotion(id: number, input: UpdatePromotionInput) {
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) businessError('NOT_FOUND', 'Promotion not found', 404);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.discountType !== undefined) data.discountType = input.discountType;
    if (input.discountValue !== undefined) data.discountValue = input.discountValue;
    if (input.effectiveStart !== undefined) data.effectiveStart = new Date(input.effectiveStart);
    if (input.effectiveEnd !== undefined) data.effectiveEnd = new Date(input.effectiveEnd);
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await prisma.promotion.update({ where: { id }, data });
    logger.info({ promotionId: id }, 'Promotion updated');
    return updated;
  }

  async checkout(input: CheckoutInput) {
    const now = new Date();

    // Fetch all active promotions valid right now, highest priority first
    const activePromotions = await prisma.promotion.findMany({
      where: {
        isActive: true,
        effectiveStart: { lte: now },
        effectiveEnd: { gte: now },
      },
      include: {
        items: { select: { itemId: true } },
        exclusionsFrom: { select: { excludedPromotionId: true } },
      },
      orderBy: [{ priority: 'desc' }, { discountValue: 'desc' }],
    });

    // Fetch item prices
    const itemIds = input.items.map((i) => i.itemId);
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds }, isActive: true },
      select: { id: true, name: true, unitPrice: true },
    });

    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Validate all items exist
    for (const line of input.items) {
      if (!itemMap.has(line.itemId)) {
        businessError('NOT_FOUND', `Item #${line.itemId} not found or not active`, 404);
      }
    }

    const lineResults: LineResult[] = [];
    let orderTotal = 0;
    let totalDiscount = 0;

    // Track which promotions have been applied (for exclusion logic)
    const appliedPromotionIds = new Set<number>();

    // For each line item, find the best applicable promotion
    for (const line of input.items) {
      const item = itemMap.get(line.itemId)!;
      const unitPrice = Number(item.unitPrice ?? 0);
      const originalTotal = unitPrice * line.quantity;

      let bestPromotion: (typeof activePromotions)[0] | null = null;
      let bestSavings = 0;

      for (const promo of activePromotions) {
        // Skip promotions already applied to a previous line
        if (appliedPromotionIds.has(promo.id)) continue;

        // Skip if this promo excludes one already applied
        const excludedIds = promo.exclusionsFrom.map((e) => e.excludedPromotionId);
        const conflictsWithApplied = excludedIds.some((eid) => appliedPromotionIds.has(eid));
        // Also check reverse: if a previously applied promo excludes this one
        const alreadyAppliedExcludesThis = [...appliedPromotionIds].some((appliedId) => {
          const appliedPromo = activePromotions.find((p) => p.id === appliedId);
          return appliedPromo?.exclusionsFrom.some((e) => e.excludedPromotionId === promo.id) ?? false;
        });
        if (conflictsWithApplied || alreadyAppliedExcludesThis) continue;

        // Check if promo applies to this item (empty items list = applies to all)
        const promoItemIds = promo.items.map((pi) => pi.itemId);
        if (promoItemIds.length > 0 && !promoItemIds.includes(line.itemId)) continue;

        const savings = calculateDiscount(unitPrice, line.quantity, promo.discountType, Number(promo.discountValue));
        // Higher priority wins; on tie pick max savings
        if (
          bestPromotion === null ||
          promo.priority > bestPromotion.priority ||
          (promo.priority === bestPromotion.priority && savings > bestSavings)
        ) {
          bestPromotion = promo;
          bestSavings = savings;
        }
      }

      const discountAmount = bestSavings;
      const finalTotal = originalTotal - discountAmount;

      if (bestPromotion) {
        appliedPromotionIds.add(bestPromotion.id);

        // Persist applied promotion record
        await prisma.appliedPromotion.create({
          data: {
            itemId: line.itemId,
            promotionId: bestPromotion.id,
            originalPrice: originalTotal,
            discountAmount,
            finalPrice: finalTotal,
            reasonApplied: buildDiscountExplanation(
              bestPromotion.name,
              bestPromotion.discountType,
              Number(bestPromotion.discountValue)
            ),
          },
        });
      }

      lineResults.push({
        itemId: line.itemId,
        quantity: line.quantity,
        unitPrice,
        originalTotal,
        discountAmount,
        finalTotal,
        promotionId: bestPromotion?.id ?? null,
        promotionName: bestPromotion?.name ?? null,
        discountExplanation: bestPromotion
          ? buildDiscountExplanation(bestPromotion.name, bestPromotion.discountType, Number(bestPromotion.discountValue))
          : null,
      });

      orderTotal += finalTotal;
      totalDiscount += discountAmount;
    }

    const originalOrderTotal = lineResults.reduce((s, l) => s + l.originalTotal, 0);

    logger.info({ itemCount: input.items.length, totalDiscount, orderTotal }, 'Checkout calculated');

    return {
      lines: lineResults,
      originalOrderTotal,
      totalDiscount,
      orderTotal,
    };
  }
}

export const promotionsService = new PromotionsService();
