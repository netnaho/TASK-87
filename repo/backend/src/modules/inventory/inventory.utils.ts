/**
 * Shared low-stock threshold computation.
 *
 * Formula: max(safetyThreshold, avgDailyUsage × LOW_STOCK_DAYS_COVER)
 *
 * This function is the single source of truth for the threshold rule.
 * The nightly scheduler mirrors it exactly in SQL:
 *   GREATEST(sl.safety_threshold, sl.avg_daily_usage * 7)
 *
 * If you change LOW_STOCK_DAYS_COVER here, you MUST update the raw SQL
 * in scheduler.ts (search for "nightly-low-stock-reorder") to keep parity.
 */
export const LOW_STOCK_DAYS_COVER = 7;

/**
 * Return the effective low-stock threshold for a stock level row.
 */
export function computeLowStockThreshold(
  safetyThreshold: number,
  avgDailyUsage: number,
): number {
  return Math.max(safetyThreshold, avgDailyUsage * LOW_STOCK_DAYS_COVER);
}

/** True when onHand is strictly below the computed low-stock threshold. */
export function isLowStock(onHand: number, safetyThreshold: number, avgDailyUsage: number): boolean {
  return onHand < computeLowStockThreshold(safetyThreshold, avgDailyUsage);
}

// ─── Variance computation ────────────────────────────────────────────────────

export interface VarianceLine {
  systemQty: number;
  countedQty: number;
  unitPrice?: number | null;
}

export interface VarianceLineResult {
  varianceQty: number;
  variancePct: number | null;
  varianceUsd: number | null;
}

export interface VarianceResult {
  processed: VarianceLineResult[];
  overallVariancePct: number;
  totalVarianceUsd: number;
  needsApproval: boolean;
}

/**
 * Compute per-line and aggregate variance for a set of stock count lines.
 *
 * Each line carries the original systemQty and the clerk's countedQty.
 * Returns per-line results plus aggregate metrics used to decide whether
 * the stock count needs managerial approval before adjustments are applied.
 */
export function computeVarianceResult(
  lines: VarianceLine[],
  varianceApprovalPct = 5,
  varianceApprovalUsd = 250,
): VarianceResult {
  const processed: VarianceLineResult[] = lines.map((l) => {
    const varianceQty = l.countedQty - l.systemQty;
    const variancePct =
      l.systemQty === 0 ? null : (Math.abs(varianceQty) / l.systemQty) * 100;
    const varianceUsd =
      l.unitPrice != null ? Math.abs(varianceQty) * l.unitPrice : null;
    return { varianceQty, variancePct, varianceUsd };
  });

  const totalSystemQty = lines.reduce((s, l) => s + l.systemQty, 0);
  const totalAbsVarianceQty = processed.reduce((s, l) => s + Math.abs(l.varianceQty), 0);
  const totalVarianceUsd = processed.reduce((s, l) => s + (l.varianceUsd ?? 0), 0);
  const overallVariancePct =
    totalSystemQty === 0 ? 0 : (totalAbsVarianceQty / totalSystemQty) * 100;
  const needsApproval =
    overallVariancePct > varianceApprovalPct || totalVarianceUsd > varianceApprovalUsd;

  return { processed, overallVariancePct, totalVarianceUsd, needsApproval };
}

// ─── Transfer validation ────────────────────────────────────────────────────

/**
 * Validate the quantity guards for a stock transfer.
 * Returns valid=true when the transfer can proceed, or false with an errorCode.
 */
export function validateTransferQty(
  onHand: number,
  requested: number,
): { valid: boolean; errorCode?: string } {
  if (requested <= 0) return { valid: false, errorCode: 'INVALID_QUANTITY' };
  if (requested > onHand) return { valid: false, errorCode: 'INSUFFICIENT_STOCK' };
  return { valid: true };
}

// ─── Receive validation ─────────────────────────────────────────────────────

/**
 * Validate lot-number and expiration-date requirements at receive time.
 * Returns an error code string on failure, null on success.
 */
export function validateReceiveInput(
  item: { isLotControlled: boolean; requiresExpiration: boolean },
  input: { lotNumber?: string; expirationDate?: string },
): string | null {
  if (item.isLotControlled && !input.lotNumber) return 'LOT_REQUIRED';
  if (item.requiresExpiration && !input.expirationDate) return 'EXPIRATION_REQUIRED';
  return null;
}

// ─── Reference number generation ────────────────────────────────────────────

/** Generate a movement reference number, e.g. RCV-20240820-A3F1. */
export function generateRefNum(type: 'RCV' | 'ISS' | 'TRF' | 'STC' | 'ADJ'): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${type}-${yyyymmdd}-${rand}`;
}
