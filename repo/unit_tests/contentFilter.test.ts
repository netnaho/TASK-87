import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    sensitiveWord: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => {
  const store = new Map<string, any>();
  return {
    cache: {
      get: vi.fn((key: string) => store.get(key) ?? null),
      set: vi.fn((key: string, val: any) => store.set(key, val)),
      delete: vi.fn((key: string) => store.delete(key)),
    },
    _store: store,
  };
});

import prisma from '@/lib/prisma';
import { cache } from '@/lib/cache';
import { loadSensitiveWords, filterContent, normalizeForFilter } from '@/lib/contentFilter';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the internal store between tests
  (cache as any)._store?.clear?.();
  vi.mocked(cache.get).mockReturnValue(null);
});

// ─── normalizeForFilter ───────────────────────────────────────────────────────

describe('normalizeForFilter', () => {
  it('lowercases text', () => {
    expect(normalizeForFilter('Hello World')).toBe('hello world');
  });

  it('strips non-alphanumeric characters (except spaces)', () => {
    expect(normalizeForFilter("it's great!")).toBe('its great');
  });

  it('preserves spaces', () => {
    expect(normalizeForFilter('foo bar baz')).toBe('foo bar baz');
  });

  it('removes punctuation', () => {
    expect(normalizeForFilter('hello, world!')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(normalizeForFilter('')).toBe('');
  });
});

// ─── loadSensitiveWords ───────────────────────────────────────────────────────

describe('loadSensitiveWords', () => {
  it('fetches from DB and returns lowercased words when cache is cold', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'BadWord', category: null, createdAt: new Date() },
    ] as any);

    const words = await loadSensitiveWords();

    expect(prisma.sensitiveWord.findMany).toHaveBeenCalledOnce();
    expect(words).toContain('badword');
  });

  it('returns cached words without hitting DB when cache is warm', async () => {
    vi.mocked(cache.get).mockReturnValue(['cached_word']);

    const words = await loadSensitiveWords();

    expect(prisma.sensitiveWord.findMany).not.toHaveBeenCalled();
    expect(words).toContain('cached_word');
  });

  it('stores fetched words in cache', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 2, word: 'spamword', category: null, createdAt: new Date() },
    ] as any);

    await loadSensitiveWords();

    expect(cache.set).toHaveBeenCalledWith('sensitive_words', ['spamword'], expect.any(Number));
  });
});

// ─── filterContent ────────────────────────────────────────────────────────────

describe('filterContent', () => {
  it('returns clean:true when no sensitive words match', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'badword', category: null, createdAt: new Date() },
    ] as any);

    const result = await filterContent('This is a great review');
    expect(result.clean).toBe(true);
    expect(result.flaggedWords).toHaveLength(0);
  });

  it('returns clean:false and flagged words when text contains sensitive word', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'badword', category: null, createdAt: new Date() },
    ] as any);

    const result = await filterContent('This has a badword in it');
    expect(result.clean).toBe(false);
    expect(result.flaggedWords).toContain('badword');
  });

  it('uses word-boundary matching to avoid false positives', async () => {
    // "class" should not match "ass"
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'ass', category: null, createdAt: new Date() },
    ] as any);

    const result = await filterContent('I attended the class today');
    expect(result.clean).toBe(true);
  });

  it('matches word at start of string', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'spam', category: null, createdAt: new Date() },
    ] as any);

    const result = await filterContent('spam is everywhere');
    expect(result.clean).toBe(false);
  });

  it('is case-insensitive in matching', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'badword', category: null, createdAt: new Date() },
    ] as any);

    const result = await filterContent('This has a BADWORD in it');
    expect(result.clean).toBe(false);
    expect(result.flaggedWords).toContain('badword');
  });

  it('reports multiple flagged words', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([
      { id: 1, word: 'spam', category: null, createdAt: new Date() },
      { id: 2, word: 'junk', category: null, createdAt: new Date() },
    ] as any);

    const result = await filterContent('this is spam and junk');
    expect(result.clean).toBe(false);
    expect(result.flaggedWords).toContain('spam');
    expect(result.flaggedWords).toContain('junk');
  });

  it('returns clean:true when sensitive words list is empty', async () => {
    vi.mocked(prisma.sensitiveWord.findMany).mockResolvedValue([] as any);

    const result = await filterContent('anything at all');
    expect(result.clean).toBe(true);
  });
});
