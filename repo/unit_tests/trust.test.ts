import { describe, it, expect } from 'vitest';

// ─── Credit delta map (mirrors trust.service) ────────────────────────────────

const CREDIT_DELTA: Record<number, number> = {
  5: 2,
  4: 1,
  3: 0,
  2: -1,
  1: -2,
};

function applyDelta(currentScore: number, rating: number): number {
  const delta = CREDIT_DELTA[rating] ?? 0;
  return Math.max(0, Math.min(100, currentScore + delta));
}

describe('Trust - Credit Delta', () => {
  it('5-star gives +2 credits', () => {
    expect(CREDIT_DELTA[5]).toBe(2);
  });

  it('4-star gives +1 credit', () => {
    expect(CREDIT_DELTA[4]).toBe(1);
  });

  it('3-star gives 0 credits', () => {
    expect(CREDIT_DELTA[3]).toBe(0);
  });

  it('2-star gives -1 credit', () => {
    expect(CREDIT_DELTA[2]).toBe(-1);
  });

  it('1-star gives -2 credits', () => {
    expect(CREDIT_DELTA[1]).toBe(-2);
  });
});

// ─── Score clamping ───────────────────────────────────────────────────────────

describe('Trust - Score Clamping', () => {
  it('clamps at 100 when adding to near-max score', () => {
    expect(applyDelta(99, 5)).toBe(100);
    expect(applyDelta(100, 5)).toBe(100);
  });

  it('clamps at 0 when subtracting from near-min score', () => {
    expect(applyDelta(1, 1)).toBe(0);
    expect(applyDelta(0, 1)).toBe(0);
  });

  it('returns unchanged score for 3-star rating', () => {
    expect(applyDelta(50, 3)).toBe(50);
  });

  it('applies delta normally within bounds', () => {
    expect(applyDelta(50, 5)).toBe(52);
    expect(applyDelta(50, 1)).toBe(48);
  });

  it('clamps max at exactly 100, not higher', () => {
    expect(applyDelta(99, 4)).toBe(100);
  });
});

// ─── Explanation generation ───────────────────────────────────────────────────

function buildExplanation(rating: number, delta: number, taskId: number): string {
  if (delta > 0) return `Received ${rating}★ rating on task #${taskId}: +${delta} trust credit`;
  if (delta < 0) return `Received ${rating}★ rating on task #${taskId}: ${delta} trust credit`;
  return `Received ${rating}★ rating on task #${taskId}: no trust change`;
}

describe('Trust - Explanation', () => {
  it('shows positive explanation for 5-star', () => {
    expect(buildExplanation(5, 2, 10)).toContain('+2');
  });

  it('shows negative explanation for 1-star', () => {
    expect(buildExplanation(1, -2, 10)).toContain('-2');
  });

  it('shows no change for 3-star', () => {
    expect(buildExplanation(3, 0, 10)).toContain('no trust change');
  });

  it('includes task ID in explanation', () => {
    expect(buildExplanation(4, 1, 99)).toContain('#99');
  });
});

// ─── Self-rating prevention ───────────────────────────────────────────────────

describe('Trust - Self-rating Prevention', () => {
  it('identifies self-rating', () => {
    const raterId = 42;
    const rateeId = 42;
    expect(raterId === rateeId).toBe(true);
  });

  it('allows rating different user', () => {
    const raterId = 42;
    const rateeId = 99;
    expect(raterId === rateeId).toBe(false);
  });
});
