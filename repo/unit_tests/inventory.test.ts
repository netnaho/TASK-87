import { describe, it, expect } from 'vitest';

// ─── Variance calculation (mirrors service.finalizeStockCount logic) ──

interface Line {
  systemQty: number;
  countedQty: number;
  unitPrice?: number | null;
}

interface ProcessedLine {
  varianceQty: number;
  variancePct: number | null;
  varianceUsd: number | null;
}

interface VarianceResult {
  processed: ProcessedLine[];
  overallVariancePct: number;
  totalVarianceUsd: number;
  needsApproval: boolean;
}

function computeVarianceResult(
  lines: Line[],
  varianceApprovalPct = 5,
  varianceApprovalUsd = 250
): VarianceResult {
  const processed: ProcessedLine[] = lines.map((l) => {
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

describe('Inventory - Variance Calculation', () => {
  it('zero variance auto-approves', () => {
    const result = computeVarianceResult([{ systemQty: 100, countedQty: 100, unitPrice: 10 }]);
    expect(result.overallVariancePct).toBe(0);
    expect(result.totalVarianceUsd).toBe(0);
    expect(result.needsApproval).toBe(false);
  });

  it('percent > 5% triggers PENDING_APPROVAL', () => {
    // 10 out of 100 = 10%
    const result = computeVarianceResult([{ systemQty: 100, countedQty: 90, unitPrice: 1 }]);
    expect(result.overallVariancePct).toBeCloseTo(10);
    expect(result.needsApproval).toBe(true);
  });

  it('USD > $250 triggers PENDING_APPROVAL even when pct is low', () => {
    // 1% variance but expensive item: 10 units * $30 = $300
    const result = computeVarianceResult([{ systemQty: 1000, countedQty: 990, unitPrice: 30 }]);
    expect(result.overallVariancePct).toBeCloseTo(1);
    expect(result.totalVarianceUsd).toBe(300);
    expect(result.needsApproval).toBe(true);
  });

  it('pct <= 5% and USD <= $250 auto-approves', () => {
    // 3% variance, $15 USD
    const result = computeVarianceResult([{ systemQty: 100, countedQty: 97, unitPrice: 5 }]);
    expect(result.overallVariancePct).toBeCloseTo(3);
    expect(result.totalVarianceUsd).toBe(15);
    expect(result.needsApproval).toBe(false);
  });

  it('null unitPrice contributes $0 to USD variance', () => {
    const result = computeVarianceResult([{ systemQty: 10, countedQty: 5, unitPrice: null }]);
    expect(result.processed[0].varianceUsd).toBeNull();
    expect(result.totalVarianceUsd).toBe(0);
    // 50% pct variance still triggers approval
    expect(result.needsApproval).toBe(true);
  });

  it('aggregate pct is computed across all lines correctly', () => {
    // Line 1: system=50, counted=50 (0 variance)
    // Line 2: system=50, counted=47 (3 units short)
    // Total: system=100, absVariance=3 → 3%
    const result = computeVarianceResult([
      { systemQty: 50, countedQty: 50, unitPrice: 1 },
      { systemQty: 50, countedQty: 47, unitPrice: 1 },
    ]);
    expect(result.overallVariancePct).toBeCloseTo(3);
    expect(result.needsApproval).toBe(false);
  });

  it('zero totalSystemQty returns 0% variance (no division by zero)', () => {
    const result = computeVarianceResult([{ systemQty: 0, countedQty: 0, unitPrice: 10 }]);
    expect(result.overallVariancePct).toBe(0);
    expect(result.needsApproval).toBe(false);
  });
});

// ─── Low-stock threshold formula ─────────────────────────────────

function isLowStock(onHand: number, safetyThreshold: number, avgDailyUsage: number): boolean {
  const threshold = Math.max(safetyThreshold, avgDailyUsage * 7);
  return onHand < threshold;
}

describe('Inventory - Low Stock Threshold', () => {
  it('uses safetyThreshold when it is the higher value', () => {
    // safetyThreshold=50, avgDailyUsage=2 → usageThreshold=14 → max=50
    expect(isLowStock(30, 50, 2)).toBe(true);
    expect(isLowStock(60, 50, 2)).toBe(false);
  });

  it('uses avgDailyUsage * 7 when it is the higher value', () => {
    // safetyThreshold=10, avgDailyUsage=5 → usageThreshold=35 → max=35
    expect(isLowStock(20, 10, 5)).toBe(true);
    expect(isLowStock(40, 10, 5)).toBe(false);
  });

  it('returns false when onHand equals threshold exactly', () => {
    // max(10, 5*7=35) = 35; onHand=35 → NOT low stock
    expect(isLowStock(35, 10, 5)).toBe(false);
  });

  it('falls back to safetyThreshold when avgDailyUsage is zero', () => {
    expect(isLowStock(5, 10, 0)).toBe(true);
    expect(isLowStock(15, 10, 0)).toBe(false);
  });

  it('handles fractional avgDailyUsage correctly', () => {
    // avgDailyUsage=1.5 → threshold=max(10, 10.5)=10.5; onHand=10 is low
    expect(isLowStock(10, 10, 1.5)).toBe(true);
    expect(isLowStock(11, 10, 1.5)).toBe(false);
  });
});

// ─── Transfer validation (mirrors service.transfer guard) ─────────

interface TransferValidation {
  valid: boolean;
  error?: string;
}

function validateTransfer(onHand: number, requested: number): TransferValidation {
  if (requested <= 0) return { valid: false, error: 'INVALID_QUANTITY' };
  if (requested > onHand) return { valid: false, error: 'INSUFFICIENT_STOCK' };
  return { valid: true };
}

describe('Inventory - Transfer Quantity Validation', () => {
  it('rejects when requested quantity exceeds onHand', () => {
    const result = validateTransfer(10, 15);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INSUFFICIENT_STOCK');
  });

  it('allows transfer when requested equals onHand', () => {
    expect(validateTransfer(10, 10).valid).toBe(true);
  });

  it('allows transfer when requested is less than onHand', () => {
    expect(validateTransfer(10, 5).valid).toBe(true);
  });

  it('rejects zero quantity', () => {
    const result = validateTransfer(100, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_QUANTITY');
  });

  it('rejects transfer from empty stock', () => {
    const result = validateTransfer(0, 1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INSUFFICIENT_STOCK');
  });
});

// ─── Reference number generation ─────────────────────────────────

function generateRefNum(type: 'RCV' | 'ISS' | 'TRF' | 'STC' | 'ADJ'): string {
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${type}-${yyyymmdd}-${rand}`;
}

describe('Inventory - Reference Number', () => {
  it('produces a correctly formatted reference number', () => {
    const ref = generateRefNum('RCV');
    expect(ref).toMatch(/^RCV-\d{8}-[A-Z0-9]{4}$/);
  });

  it('uses the correct type prefix', () => {
    expect(generateRefNum('ISS')).toMatch(/^ISS-/);
    expect(generateRefNum('TRF')).toMatch(/^TRF-/);
    expect(generateRefNum('STC')).toMatch(/^STC-/);
    expect(generateRefNum('ADJ')).toMatch(/^ADJ-/);
  });

  it('generates unique reference numbers', () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateRefNum('RCV')));
    // With 36^4 = ~1.7M possibilities, collision rate should be negligible
    expect(refs.size).toBeGreaterThan(90);
  });
});
