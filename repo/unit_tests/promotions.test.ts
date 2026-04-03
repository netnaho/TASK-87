import { describe, it, expect } from 'vitest';

// ─── Discount calculation (mirrors promotions.service) ───────────────────────

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

describe('Promotions - Discount Calculation', () => {
  it('calculates percentage discount correctly', () => {
    expect(calculateDiscount(100, 2, 'PERCENTAGE', 10)).toBe(20); // 10% of $200
  });

  it('calculates fixed amount discount correctly', () => {
    expect(calculateDiscount(50, 3, 'FIXED_AMOUNT', 25)).toBe(25);
  });

  it('caps fixed amount discount at line total', () => {
    expect(calculateDiscount(10, 2, 'FIXED_AMOUNT', 50)).toBe(20); // max is line total $20
  });

  it('handles 100% percentage discount', () => {
    expect(calculateDiscount(50, 1, 'PERCENTAGE', 100)).toBe(50);
  });

  it('handles 0% discount', () => {
    expect(calculateDiscount(50, 1, 'PERCENTAGE', 0)).toBe(0);
  });

  it('rounds percentage to 2 decimal places', () => {
    // 33.33% of $10 = $3.333 → rounds to $3.33
    expect(calculateDiscount(10, 1, 'PERCENTAGE', 33.33)).toBe(3.33);
  });
});

// ─── Promotion priority conflict resolution ───────────────────────────────────

interface MockPromotion {
  id: number;
  priority: number;
  discountType: string;
  discountValue: number;
  exclusionsFrom: { excludedPromotionId: number }[];
}

function resolveBestPromotion(
  promotions: MockPromotion[],
  unitPrice: number,
  quantity: number,
  appliedIds: Set<number>
): MockPromotion | null {
  let best: MockPromotion | null = null;
  let bestSavings = -1;

  for (const promo of promotions) {
    // Skip already-applied promotions
    if (appliedIds.has(promo.id)) continue;

    // Check exclusions
    const excludedIds = promo.exclusionsFrom.map((e) => e.excludedPromotionId);
    const conflicts = excludedIds.some((id) => appliedIds.has(id));
    const appliedExcludesThis = [...appliedIds].some((appliedId) => {
      const applied = promotions.find((p) => p.id === appliedId);
      return applied?.exclusionsFrom.some((e) => e.excludedPromotionId === promo.id) ?? false;
    });
    if (conflicts || appliedExcludesThis) continue;

    const savings = calculateDiscount(unitPrice, quantity, promo.discountType, promo.discountValue);
    if (
      best === null ||
      promo.priority > best.priority ||
      (promo.priority === best.priority && savings > bestSavings)
    ) {
      best = promo;
      bestSavings = savings;
    }
  }

  return best;
}

describe('Promotions - Conflict Resolution', () => {
  it('picks highest priority promotion', () => {
    const promos: MockPromotion[] = [
      { id: 1, priority: 1, discountType: 'PERCENTAGE', discountValue: 10, exclusionsFrom: [] },
      { id: 2, priority: 5, discountType: 'PERCENTAGE', discountValue: 5, exclusionsFrom: [] },
    ];
    const best = resolveBestPromotion(promos, 100, 1, new Set());
    expect(best?.id).toBe(2);
  });

  it('uses max savings as tiebreaker on equal priority', () => {
    const promos: MockPromotion[] = [
      { id: 1, priority: 3, discountType: 'PERCENTAGE', discountValue: 10, exclusionsFrom: [] },
      { id: 2, priority: 3, discountType: 'PERCENTAGE', discountValue: 20, exclusionsFrom: [] },
    ];
    const best = resolveBestPromotion(promos, 100, 1, new Set());
    expect(best?.id).toBe(2);
  });

  it('skips excluded promotions', () => {
    const promos: MockPromotion[] = [
      { id: 1, priority: 5, discountType: 'PERCENTAGE', discountValue: 10, exclusionsFrom: [] },
      {
        id: 2,
        priority: 3,
        discountType: 'PERCENTAGE',
        discountValue: 20,
        exclusionsFrom: [{ excludedPromotionId: 1 }],
      },
    ];
    const appliedIds = new Set<number>([1]);
    const best = resolveBestPromotion(promos, 100, 1, appliedIds);
    // promo 2 is excluded because it excludes promo 1 which is already applied
    expect(best).toBeNull();
  });

  it('returns null when no promotions available', () => {
    const best = resolveBestPromotion([], 100, 1, new Set());
    expect(best).toBeNull();
  });

  it('applies mutual exclusion correctly (applied excludes candidate)', () => {
    const promos: MockPromotion[] = [
      {
        id: 1,
        priority: 10,
        discountType: 'FIXED_AMOUNT',
        discountValue: 50,
        exclusionsFrom: [{ excludedPromotionId: 2 }],
      },
      { id: 2, priority: 5, discountType: 'PERCENTAGE', discountValue: 30, exclusionsFrom: [] },
    ];
    // promo 1 is already applied; promo 1 excludes promo 2 → promo 2 cannot be selected
    const appliedIds = new Set<number>([1]);
    const best = resolveBestPromotion(promos, 100, 1, appliedIds);
    expect(best).toBeNull();
  });
});

// ─── Checkout line totals ─────────────────────────────────────────────────────

describe('Promotions - Checkout Line Totals', () => {
  it('applies zero discount when no promotion matches', () => {
    const unitPrice = 49.99;
    const quantity = 3;
    const discount = 0;
    const finalTotal = unitPrice * quantity - discount;
    expect(finalTotal).toBeCloseTo(149.97, 1);
  });

  it('computes correct final total after percentage discount', () => {
    const discount = calculateDiscount(100, 2, 'PERCENTAGE', 15);
    expect(discount).toBe(30);
    expect(100 * 2 - discount).toBe(170);
  });
});
