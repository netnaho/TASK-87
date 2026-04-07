/**
 * Pure domain functions for moderation logic.
 * No Prisma dependency — enables fast, isolated unit tests.
 */

// ─── Appeal state machine ────────────────────────────────────────────────────

export const APPEAL_VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_REVIEW', 'UPHELD', 'OVERTURNED'],
  IN_REVIEW: ['UPHELD', 'OVERTURNED'],
  UPHELD: [],
  OVERTURNED: [],
};

/** Return true when transitioning from → to is a valid appeal state change. */
export function canAppealTransition(from: string, to: string): boolean {
  return (APPEAL_VALID_TRANSITIONS[from] ?? []).includes(to);
}

// ─── Action side effects ─────────────────────────────────────────────────────

/**
 * Return the review status that should be set after a moderation action,
 * or null if the action has no review-status side effect (e.g. WARN).
 */
export function getReviewStatusAfterAction(action: string): string | null {
  if (action === 'HIDE') return 'HIDDEN';
  if (action === 'REMOVE') return 'REMOVED';
  if (action === 'RESTORE') return 'ACTIVE';
  return null;
}

// ─── Appeal overturn restoration ─────────────────────────────────────────────

/**
 * Return true when overturning this action should restore the review to ACTIVE.
 * Only HIDE and REMOVE suppress a review — WARN and RESTORE do not.
 */
export function shouldRestoreOnOverturned(originalAction: string): boolean {
  return originalAction === 'HIDE' || originalAction === 'REMOVE';
}
