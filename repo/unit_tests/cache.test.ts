import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TTLCache } from '../backend/src/lib/cache';

describe('TTL Cache', () => {
  let cache: TTLCache;

  beforeEach(() => {
    cache = new TTLCache(15);
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('should expire entries after TTL', () => {
    cache.set('short', 'value', 1); // 1ms TTL

    // Use fake timers
    vi.useFakeTimers();
    vi.advanceTimersByTime(10);

    expect(cache.get('short')).toBeUndefined();
    vi.useRealTimers();
  });

  it('should not expire entries before TTL', () => {
    cache.set('long', 'value', 60000); // 60s TTL
    expect(cache.get('long')).toBe('value');
  });

  it('should delete entries', () => {
    cache.set('key', 'value');
    expect(cache.delete('key')).toBe(true);
    expect(cache.get('key')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('should track has correctly', () => {
    cache.set('exists', true);
    expect(cache.has('exists')).toBe(true);
    expect(cache.has('notexists')).toBe(false);
  });

  it('should handle complex objects', () => {
    const obj = { name: 'test', items: [1, 2, 3], nested: { a: true } };
    cache.set('complex', obj);
    expect(cache.get('complex')).toEqual(obj);
  });

  it('should overwrite existing keys', () => {
    cache.set('key', 'original');
    cache.set('key', 'updated');
    expect(cache.get('key')).toBe('updated');
  });
});
