import { describe, it, expect } from 'vitest';
import {
  computeVarianceResult,
  isLowStock,
  validateTransferQty,
  validateReceiveInput,
  generateRefNum,
} from '@/modules/inventory/inventory.utils';

// ─── Variance Calculation ──────────────────────────────────────────────────

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

// ─── Low Stock Threshold ───────────────────────────────────────────────────

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

// ─── Transfer Quantity Validation ─────────────────────────────────────────

describe('Inventory - Transfer Quantity Validation', () => {
  it('rejects when requested quantity exceeds onHand', () => {
    const result = validateTransferQty(10, 15);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_STOCK');
  });

  it('allows transfer when requested equals onHand', () => {
    expect(validateTransferQty(10, 10).valid).toBe(true);
  });

  it('allows transfer when requested is less than onHand', () => {
    expect(validateTransferQty(10, 5).valid).toBe(true);
  });

  it('rejects zero quantity', () => {
    const result = validateTransferQty(100, 0);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INVALID_QUANTITY');
  });

  it('rejects transfer from empty stock', () => {
    const result = validateTransferQty(0, 1);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('INSUFFICIENT_STOCK');
  });
});

// ─── Lot-controlled Receiving Validation ──────────────────────────────────

describe('Inventory - Lot-controlled Receiving Validation', () => {
  it('rejects lot-controlled item with missing lotNumber', () => {
    const err = validateReceiveInput(
      { isLotControlled: true, requiresExpiration: false },
      { lotNumber: undefined }
    );
    expect(err).toBe('LOT_REQUIRED');
  });

  it('rejects item with requiresExpiration when expirationDate is missing', () => {
    const err = validateReceiveInput(
      { isLotControlled: true, requiresExpiration: true },
      { lotNumber: 'LOT-001', expirationDate: undefined }
    );
    expect(err).toBe('EXPIRATION_REQUIRED');
  });

  it('accepts lot-controlled + requiresExpiration item with both fields present', () => {
    const err = validateReceiveInput(
      { isLotControlled: true, requiresExpiration: true },
      { lotNumber: 'LOT-001', expirationDate: '2025-12-31T00:00:00.000Z' }
    );
    expect(err).toBeNull();
  });

  it('accepts lot-controlled item without expiration when requiresExpiration is false', () => {
    const err = validateReceiveInput(
      { isLotControlled: true, requiresExpiration: false },
      { lotNumber: 'LOT-001', expirationDate: undefined }
    );
    expect(err).toBeNull();
  });

  it('accepts non-lot-controlled item with neither field', () => {
    const err = validateReceiveInput(
      { isLotControlled: false, requiresExpiration: false },
      {}
    );
    expect(err).toBeNull();
  });

  it('requiresExpiration enforcement applies even when not lot-controlled', () => {
    // Edge case: item requires expiration tracking but is not lot-controlled
    const err = validateReceiveInput(
      { isLotControlled: false, requiresExpiration: true },
      { expirationDate: undefined }
    );
    expect(err).toBe('EXPIRATION_REQUIRED');
  });

  it('LOT_REQUIRED is checked before EXPIRATION_REQUIRED', () => {
    // Both fields missing on item that requires both — first error should be LOT_REQUIRED
    const err = validateReceiveInput(
      { isLotControlled: true, requiresExpiration: true },
      {}
    );
    expect(err).toBe('LOT_REQUIRED');
  });
});

// ─── Reference Number ─────────────────────────────────────────────────────

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
