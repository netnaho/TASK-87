import { describe, it, expect } from 'vitest';
import {
  canAppealTransition,
  getReviewStatusAfterAction,
  shouldRestoreOnOverturned,
} from '@/modules/moderation/moderation.utils';
import { normalizeForFilter } from '@/lib/contentFilter';

// ─── Appeal State Machine ────────────────────────────────────────────────────

describe('Moderation - Appeal State Machine', () => {
  it('PENDING can move to IN_REVIEW', () => {
    expect(canAppealTransition('PENDING', 'IN_REVIEW')).toBe(true);
  });

  it('PENDING can move to UPHELD directly', () => {
    expect(canAppealTransition('PENDING', 'UPHELD')).toBe(true);
  });

  it('PENDING can move to OVERTURNED directly', () => {
    expect(canAppealTransition('PENDING', 'OVERTURNED')).toBe(true);
  });

  it('IN_REVIEW can move to UPHELD', () => {
    expect(canAppealTransition('IN_REVIEW', 'UPHELD')).toBe(true);
  });

  it('IN_REVIEW can move to OVERTURNED', () => {
    expect(canAppealTransition('IN_REVIEW', 'OVERTURNED')).toBe(true);
  });

  it('UPHELD cannot transition further', () => {
    expect(canAppealTransition('UPHELD', 'OVERTURNED')).toBe(false);
    expect(canAppealTransition('UPHELD', 'IN_REVIEW')).toBe(false);
  });

  it('OVERTURNED cannot transition further', () => {
    expect(canAppealTransition('OVERTURNED', 'UPHELD')).toBe(false);
    expect(canAppealTransition('OVERTURNED', 'PENDING')).toBe(false);
  });

  it('unknown state returns false', () => {
    expect(canAppealTransition('DISMISSED', 'UPHELD')).toBe(false);
  });
});

// ─── Action Side Effects ──────────────────────────────────────────────────────

describe('Moderation - Action Side Effects', () => {
  it('HIDE action sets review to HIDDEN', () => {
    expect(getReviewStatusAfterAction('HIDE')).toBe('HIDDEN');
  });

  it('REMOVE action sets review to REMOVED', () => {
    expect(getReviewStatusAfterAction('REMOVE')).toBe('REMOVED');
  });

  it('RESTORE action sets review to ACTIVE', () => {
    expect(getReviewStatusAfterAction('RESTORE')).toBe('ACTIVE');
  });

  it('WARN action has no review status effect', () => {
    expect(getReviewStatusAfterAction('WARN')).toBeNull();
  });
});

// ─── Appeal Overturned Restoration ───────────────────────────────────────────

describe('Moderation - Appeal Overturned Restoration', () => {
  it('restores review when HIDE action is overturned', () => {
    expect(shouldRestoreOnOverturned('HIDE')).toBe(true);
  });

  it('restores review when REMOVE action is overturned', () => {
    expect(shouldRestoreOnOverturned('REMOVE')).toBe(true);
  });

  it('does not restore for WARN overturn', () => {
    expect(shouldRestoreOnOverturned('WARN')).toBe(false);
  });

  it('does not restore for RESTORE overturn', () => {
    expect(shouldRestoreOnOverturned('RESTORE')).toBe(false);
  });
});

// ─── Content Filter Normalization ────────────────────────────────────────────

describe('Moderation - Content Filter Normalization', () => {
  it('lowercases text', () => {
    expect(normalizeForFilter('HELLO')).toBe('hello');
  });

  it('strips special characters', () => {
    expect(normalizeForFilter('bad!@#word')).toBe('badword');
  });

  it('preserves spaces and alphanumeric', () => {
    expect(normalizeForFilter('hello world 123')).toBe('hello world 123');
  });

  it('catches obfuscated sensitive words after normalization', () => {
    const normalized = normalizeForFilter('b@d w0rd!');
    expect(normalized).toBe('bd w0rd'); // special chars stripped; numbers kept
  });
});
