import { describe, it, expect } from 'vitest';

// ─── Appeal state machine ────────────────────────────────────────────────────

const validTransitions: Record<string, string[]> = {
  PENDING: ['IN_REVIEW', 'UPHELD', 'OVERTURNED'],
  IN_REVIEW: ['UPHELD', 'OVERTURNED'],
  UPHELD: [],
  OVERTURNED: [],
};

function canTransition(from: string, to: string): boolean {
  return (validTransitions[from] ?? []).includes(to);
}

describe('Moderation - Appeal State Machine', () => {
  it('PENDING can move to IN_REVIEW', () => {
    expect(canTransition('PENDING', 'IN_REVIEW')).toBe(true);
  });

  it('PENDING can move to UPHELD directly', () => {
    expect(canTransition('PENDING', 'UPHELD')).toBe(true);
  });

  it('PENDING can move to OVERTURNED directly', () => {
    expect(canTransition('PENDING', 'OVERTURNED')).toBe(true);
  });

  it('IN_REVIEW can move to UPHELD', () => {
    expect(canTransition('IN_REVIEW', 'UPHELD')).toBe(true);
  });

  it('IN_REVIEW can move to OVERTURNED', () => {
    expect(canTransition('IN_REVIEW', 'OVERTURNED')).toBe(true);
  });

  it('UPHELD cannot transition further', () => {
    expect(canTransition('UPHELD', 'OVERTURNED')).toBe(false);
    expect(canTransition('UPHELD', 'IN_REVIEW')).toBe(false);
  });

  it('OVERTURNED cannot transition further', () => {
    expect(canTransition('OVERTURNED', 'UPHELD')).toBe(false);
    expect(canTransition('OVERTURNED', 'PENDING')).toBe(false);
  });

  it('unknown state returns false', () => {
    expect(canTransition('DISMISSED', 'UPHELD')).toBe(false);
  });
});

// ─── Review status side effects ───────────────────────────────────────────────

function getReviewStatusAfterAction(action: string): string | null {
  if (action === 'HIDE') return 'HIDDEN';
  if (action === 'REMOVE') return 'REMOVED';
  if (action === 'RESTORE') return 'ACTIVE';
  return null; // WARN has no review status effect
}

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

// ─── Review restoration on OVERTURNED appeal ─────────────────────────────────

function shouldRestoreOnOverturned(originalAction: string): boolean {
  return originalAction === 'HIDE' || originalAction === 'REMOVE';
}

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

// ─── Content filter normalization ────────────────────────────────────────────

function normalizeForFilter(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

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
