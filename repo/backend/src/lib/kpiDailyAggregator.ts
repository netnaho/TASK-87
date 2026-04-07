import type { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// ─── Input types (pure, no Prisma dependency) ────────────────────────────────

export interface KpiIssueRow {
  quantity: number;
  /** null when item has no unitPrice set in the catalogue. */
  unitPrice: number | null;
}

export interface KpiMetrics {
  dau: number;
  conversionRate: number;
  aov: number;
  repurchaseRate: number;
  refundRate: number;
}

// ─── Pure formula functions ──────────────────────────────────────────────────

/**
 * AOV — average supply-disbursement value.
 *
 * Because the system has no order/checkout model, ISSUE ledger entries are
 * used as the nearest proxy for "transactions". Each row represents one
 * disbursement event; AOV is:
 *
 *   AOV = Σ(|quantity| × unitPrice) / count(ISSUE rows)
 *
 * Items with no unitPrice contribute zero value but still count in the
 * denominator, preserving accuracy for the per-movement average.
 * Returns 0 when there are no ISSUE rows on the target day.
 */
export function computeAov(issueRows: KpiIssueRow[]): number {
  if (issueRows.length === 0) return 0;
  const totalValue = issueRows.reduce(
    (sum, r) => sum + Math.abs(r.quantity) * (r.unitPrice ?? 0),
    0,
  );
  return totalValue / issueRows.length;
}

/**
 * Repurchase rate — returning-user retention proxy (percentage 0–100).
 *
 * Measures the fraction of the target day's active users (by rateLimitLog)
 * who were also active during the 30-day window immediately before the
 * target day — i.e. returning versus first-time-in-window:
 *
 *   repurchaseRate =
 *     |users active on day ∩ users active in prior 30 days|
 *     / |users active on day| × 100
 *
 * Returns 0 when dau is 0 (no division-by-zero).
 */
export function computeRepurchaseRate(
  activeDayIds: number[],
  priorActiveIds: Set<number>,
): number {
  if (activeDayIds.length === 0) return 0;
  const returning = activeDayIds.filter((id) => priorActiveIds.has(id)).length;
  return (returning / activeDayIds.length) * 100;
}

/**
 * Refund rate — inventory-return proxy (percentage 0–100).
 *
 * Because there is no dedicated refund model, negative-quantity ADJUSTMENT
 * movements (stock corrections / supplier returns) serve as the proxy:
 *
 *   refundRate = count(ADJUSTMENT rows with qty < 0) / count(ISSUE rows) × 100
 *
 * Returns 0 when there are no ISSUE rows on the target day (denominator guard).
 */
export function computeRefundRate(
  negativeAdjustmentCount: number,
  issueCount: number,
): number {
  if (issueCount === 0) return 0;
  return (negativeAdjustmentCount / issueCount) * 100;
}

// ─── Aggregation function ────────────────────────────────────────────────────

/**
 * Fetch all raw data for `date`'s UTC day window, compute all five KPI
 * metrics, and idempotently upsert one row into `kpi_daily`.
 *
 * Accepts `prisma` as a parameter so callers (and unit tests) can inject it.
 */
export async function aggregateKpiDaily(
  date: Date,
  prisma: PrismaClient,
): Promise<void> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const p = prisma as any; // Prisma client types lag behind schema; cast once here

  // ── DAU ──────────────────────────────────────────────────────────────────
  const dauRows: Array<{ userId: number }> = await p.rateLimitLog.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
  const dau = dauRows.length;
  const activeDayIds = dauRows.map((r) => r.userId);

  // ── ISSUE rows — shared by conversionRate, AOV, and refundRate denominator
  // Each row carries quantity + item.unitPrice for AOV calculation.
  const issueLedgerRows: Array<{
    quantity: number;
    item: { unitPrice: { toNumber(): number } | null };
  }> = await p.inventoryLedger.findMany({
    where: { movementType: 'ISSUE', createdAt: { gte: dayStart, lt: dayEnd } },
    select: { quantity: true, item: { select: { unitPrice: true } } },
  });

  const issueCount = issueLedgerRows.length;
  const totalIssueQty = issueLedgerRows.reduce((sum, r) => sum + r.quantity, 0);

  // ── conversionRate (inventory turnover proxy) ─────────────────────────────
  const avgStockResult: { _avg: { onHand: unknown } } = await p.stockLevel.aggregate({
    _avg: { onHand: true },
  });
  const avgStock = Number(avgStockResult._avg.onHand ?? 1);
  const conversionRate = avgStock > 0 ? totalIssueQty / avgStock : 0;

  // ── AOV ───────────────────────────────────────────────────────────────────
  const issueRows: KpiIssueRow[] = issueLedgerRows.map((r) => ({
    quantity: r.quantity,
    unitPrice:
      r.item.unitPrice !== null && r.item.unitPrice !== undefined
        ? Number(r.item.unitPrice)
        : null,
  }));
  const aov = computeAov(issueRows);

  // ── repurchaseRate ────────────────────────────────────────────────────────
  const thirtyDaysBeforeDay = new Date(dayStart);
  thirtyDaysBeforeDay.setUTCDate(thirtyDaysBeforeDay.getUTCDate() - 30);

  const priorRows: Array<{ userId: number }> = await p.rateLimitLog.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: thirtyDaysBeforeDay, lt: dayStart } },
  });
  const priorActiveIds = new Set(priorRows.map((r) => r.userId));
  const repurchaseRate = computeRepurchaseRate(activeDayIds, priorActiveIds);

  // ── refundRate ────────────────────────────────────────────────────────────
  const negativeAdjustmentCount: number = await p.inventoryLedger.count({
    where: {
      movementType: 'ADJUSTMENT',
      quantity: { lt: 0 },
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });
  const refundRate = computeRefundRate(negativeAdjustmentCount, issueCount);

  // ── Upsert ────────────────────────────────────────────────────────────────
  await p.kpiDaily.upsert({
    where: { date: dayStart },
    create: { date: dayStart, dau, conversionRate, aov, repurchaseRate, refundRate },
    update: { dau, conversionRate, aov, repurchaseRate, refundRate },
  });

  logger.info(
    {
      date: dayStart.toISOString().slice(0, 10),
      dau,
      conversionRate: Number(conversionRate).toFixed(4),
      aov: Number(aov).toFixed(2),
      repurchaseRate: Number(repurchaseRate).toFixed(2),
      refundRate: Number(refundRate).toFixed(2),
    },
    'KPI daily aggregation completed',
  );
}
