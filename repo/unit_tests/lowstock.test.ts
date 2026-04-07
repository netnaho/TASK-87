import { describe, it, expect } from 'vitest';
import {
  computeLowStockThreshold,
  LOW_STOCK_DAYS_COVER,
} from '@/modules/inventory/inventory.utils';

/**
 * Unit tests for the shared low-stock threshold formula.
 *
 * These tests serve two purposes:
 *  1. Verify the JS implementation is arithmetically correct.
 *  2. Act as a sentinel: if LOW_STOCK_DAYS_COVER changes, the test that
 *     hard-codes 7 will fail and remind the developer to update the raw SQL
 *     in scheduler.ts as well.
 */

describe('computeLowStockThreshold', () => {
  // ── Core formula ───────────────────────────────────────────────

  it('returns safetyThreshold when it exceeds avgDailyUsage × DAYS_COVER', () => {
    // safetyThreshold=20, avgDailyUsage=2 → 7×2=14 < 20 → threshold=20
    expect(computeLowStockThreshold(20, 2)).toBe(20);
  });

  it('returns avgDailyUsage × DAYS_COVER when it exceeds safetyThreshold', () => {
    // safetyThreshold=5, avgDailyUsage=3 → 7×3=21 > 5 → threshold=21
    expect(computeLowStockThreshold(5, 3)).toBe(21);
  });

  it('returns the same value when safetyThreshold equals avgDailyUsage × DAYS_COVER', () => {
    // safetyThreshold=14, avgDailyUsage=2 → 7×2=14 = 14 → threshold=14
    expect(computeLowStockThreshold(14, 2)).toBe(14);
  });

  it('returns safetyThreshold when avgDailyUsage is zero', () => {
    expect(computeLowStockThreshold(10, 0)).toBe(10);
  });

  it('returns 0 when both inputs are zero', () => {
    expect(computeLowStockThreshold(0, 0)).toBe(0);
  });

  it('handles fractional avgDailyUsage correctly', () => {
    // safetyThreshold=3, avgDailyUsage=0.5 → 7×0.5=3.5 > 3 → threshold=3.5
    expect(computeLowStockThreshold(3, 0.5)).toBe(3.5);
  });

  it('handles large safetyThreshold values', () => {
    expect(computeLowStockThreshold(1000, 1)).toBe(1000);
  });

  // ── isLowStock logic (mirrors the service filter) ──────────────

  it('onHand below threshold → isLowStock = true', () => {
    const threshold = computeLowStockThreshold(10, 1); // max(10, 7) = 10
    expect(5 < threshold).toBe(true);
  });

  it('onHand equal to threshold → isLowStock = false (not strictly below)', () => {
    const threshold = computeLowStockThreshold(10, 1); // 10
    expect(10 < threshold).toBe(false);
  });

  it('onHand above threshold → isLowStock = false', () => {
    const threshold = computeLowStockThreshold(10, 1); // 10
    expect(15 < threshold).toBe(false);
  });

  // ── Sentinel: verify DAYS_COVER constant matches the SQL in scheduler.ts ──

  it('LOW_STOCK_DAYS_COVER is 7 — matches GREATEST(…, avg_daily_usage * 7) in scheduler SQL', () => {
    // If this test fails after changing the constant, also update the raw SQL
    // in the "nightly-low-stock-reorder" job in scheduler.ts.
    expect(LOW_STOCK_DAYS_COVER).toBe(7);
  });

  it('formula output matches manual GREATEST(safetyThreshold, avgDailyUsage * 7) computation', () => {
    // Cross-verify JS implementation against the SQL expression semantics
    const cases: Array<[number, number]> = [
      [0, 0],
      [10, 1],
      [5, 3],
      [14, 2],
      [100, 0.5],
    ];
    for (const [safety, usage] of cases) {
      const jsResult = computeLowStockThreshold(safety, usage);
      const sqlEquivalent = Math.max(safety, usage * 7); // mirrors GREATEST(…, … * 7)
      expect(jsResult).toBe(sqlEquivalent);
    }
  });
});
