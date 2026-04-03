import prisma from './prisma';
import { cache } from './cache';

const CACHE_KEY = 'sensitive_words';

export async function loadSensitiveWords(): Promise<string[]> {
  const cached = cache.get<string[]>(CACHE_KEY);
  if (cached) return cached;

  const words = await prisma.sensitiveWord.findMany();
  const wordList = words.map((w) => w.word.toLowerCase());
  cache.set(CACHE_KEY, wordList, 30 * 60 * 1000); // 30 min cache
  return wordList;
}

export async function filterContent(text: string): Promise<{ clean: boolean; flaggedWords: string[] }> {
  const sensitiveWords = await loadSensitiveWords();
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const flaggedWords: string[] = [];

  for (const word of sensitiveWords) {
    // Use word-boundary matching to avoid false positives (e.g., "class" matching "ass")
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalized)) {
      flaggedWords.push(word);
    }
  }

  return {
    clean: flaggedWords.length === 0,
    flaggedWords,
  };
}
