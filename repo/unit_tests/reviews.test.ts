import { describe, it, expect } from 'vitest';

// ─── Review timing rules (inline logic mirrors service) ──────────────────────

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function canFollowUp(parentCreatedAt: Date): boolean {
  return daysSince(parentCreatedAt) <= 7;
}

function canHostReply(reviewCreatedAt: Date): boolean {
  return daysSince(reviewCreatedAt) <= 14;
}

describe('Reviews - Timing Rules', () => {
  it('allows follow-up within 7 days', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    expect(canFollowUp(sixDaysAgo)).toBe(true);
  });

  it('blocks follow-up after 7 days', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(canFollowUp(eightDaysAgo)).toBe(false);
  });

  it('allows host reply within 14 days', () => {
    const thirteenDaysAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    expect(canHostReply(thirteenDaysAgo)).toBe(true);
  });

  it('blocks host reply after 14 days', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(canHostReply(fifteenDaysAgo)).toBe(false);
  });

  it('exactly at 7 days is still allowed for follow-up', () => {
    const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(canFollowUp(exactlySevenDays)).toBe(true);
  });
});

// ─── Overall rating calculation ───────────────────────────────────────────────

function calcOverall(cleanliness: number, communication: number, accuracy: number): number {
  return Math.round(((cleanliness + communication + accuracy) / 3) * 10) / 10;
}

describe('Reviews - Rating Calculation', () => {
  it('averages three equal ratings', () => {
    expect(calcOverall(4, 4, 4)).toBe(4.0);
  });

  it('correctly averages mixed ratings', () => {
    expect(calcOverall(5, 3, 4)).toBe(4.0);
  });

  it('rounds to one decimal place', () => {
    expect(calcOverall(5, 4, 3)).toBe(4.0);
    expect(calcOverall(5, 5, 4)).toBe(4.7);
    expect(calcOverall(1, 1, 2)).toBe(1.3);
  });

  it('handles all-5 ratings', () => {
    expect(calcOverall(5, 5, 5)).toBe(5.0);
  });

  it('handles all-1 ratings', () => {
    expect(calcOverall(1, 1, 1)).toBe(1.0);
  });
});

// ─── Anti-spam / self-review prevention ───────────────────────────────────────

function isSelfReview(reviewerId: number, revieweeId: number | undefined): boolean {
  return revieweeId !== undefined && revieweeId === reviewerId;
}

describe('Reviews - Anti-spam', () => {
  it('flags self-review when revieweeId equals reviewerId', () => {
    expect(isSelfReview(42, 42)).toBe(true);
  });

  it('allows review when revieweeId differs', () => {
    expect(isSelfReview(42, 99)).toBe(false);
  });

  it('allows review when no revieweeId provided', () => {
    expect(isSelfReview(42, undefined)).toBe(false);
  });
});

// ─── Tag count limit ──────────────────────────────────────────────────────────

function tagCountValid(tagIds?: number[]): boolean {
  return !tagIds || tagIds.length <= 10;
}

describe('Reviews - Tag Limit', () => {
  it('allows up to 10 tags', () => {
    expect(tagCountValid([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(true);
  });

  it('rejects more than 10 tags', () => {
    expect(tagCountValid([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe(false);
  });

  it('allows no tags', () => {
    expect(tagCountValid(undefined)).toBe(true);
    expect(tagCountValid([])).toBe(true);
  });
});
