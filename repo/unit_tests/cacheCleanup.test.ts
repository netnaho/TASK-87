/**
 * Tests for TTLCache.cleanup() and TTLCache.size which are not exercised
 * by the existing cache.test.ts suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { TTLCache } from '@/lib/cache';

describe('TTLCache - cleanup()', () => {
  it('removes only expired entries and leaves valid entries intact', () => {
    const c = new TTLCache(999);
    c.set('live', 'value', 60_000); // 60s TTL — not expired
    c.set('dead', 'gone', 1);       // 1ms TTL — will expire

    // Advance time past the 1ms TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(10);
    c.cleanup();
    vi.useRealTimers();

    expect(c.get('live')).toBe('value');
    expect(c.get('dead')).toBeUndefined();
  });

  it('cleanup() is idempotent on an empty cache', () => {
    const c = new TTLCache(999);
    expect(() => c.cleanup()).not.toThrow();
  });
});

describe('TTLCache - size', () => {
  it('returns the number of non-expired entries', () => {
    const c = new TTLCache(999);
    c.set('a', 1, 60_000);
    c.set('b', 2, 1); // expires almost immediately

    vi.useFakeTimers();
    vi.advanceTimersByTime(10);
    const sz = c.size; // calls cleanup() internally
    vi.useRealTimers();

    expect(sz).toBe(1); // 'b' cleaned up, 'a' remains
  });

  it('returns 0 for empty cache', () => {
    const c = new TTLCache(999);
    expect(c.size).toBe(0);
  });
});
