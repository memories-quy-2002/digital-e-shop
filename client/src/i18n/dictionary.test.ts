import { describe, expect, it } from 'vitest';
import { dictionaries } from './index';

const collectKeyPaths = (value: unknown, prefix = ''): string[] => {
  if (typeof value === 'function' || value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
};

describe('translation dictionaries', () => {
  it('keeps English and Vietnamese key paths in sync', () => {
    const englishKeys = new Set(collectKeyPaths(dictionaries.en));
    const vietnameseKeys = new Set(collectKeyPaths(dictionaries.vi));

    expect([...englishKeys].filter((key) => !vietnameseKeys.has(key))).toEqual([]);
    expect([...vietnameseKeys].filter((key) => !englishKeys.has(key))).toEqual([]);
  });
});
