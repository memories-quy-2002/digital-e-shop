import { describe, expect, it } from 'vitest';
import { dictionaries } from './dictionaries';
import { englishDictionary, loadAdminDictionary } from './index';
import vi from './vi';

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

  it('keeps Admin-owned namespaces out of the storefront dictionary', () => {
    for (const namespace of [
      'adminAudit',
      'adminAlertTriage',
      'adminCodSettlements',
      'adminEmailOperations',
      'adminManualRefund',
      'adminPromotions',
    ]) {
      expect(englishDictionary).not.toHaveProperty(namespace);
      expect(vi).not.toHaveProperty(namespace);
    }

    for (const key of [
      'adminActionError',
      'adminDescription',
      'adminDetailError',
      'adminErrorTitle',
      'adminLoadError',
      'adminTitle',
    ]) {
      expect(englishDictionary.shipping).not.toHaveProperty(key);
      expect(vi.shipping).not.toHaveProperty(key);
    }

    expect(englishDictionary).toHaveProperty('header.backToAdmin');
    expect(vi).toHaveProperty('header.backToAdmin');
    expect(englishDictionary).toHaveProperty('common.skipToMainContent');
    expect(vi).toHaveProperty('common.skipToMainContent');
    expect(englishDictionary).toHaveProperty('afterSales');
  });

  it('loads complete Admin translations for both locales on demand', async () => {
    const [englishAdmin, vietnameseAdmin] = await Promise.all([
      loadAdminDictionary('en'),
      loadAdminDictionary('vi'),
    ]);

    expect(englishAdmin.adminAudit.title).toBe('Audit log');
    expect(vietnameseAdmin.adminAudit.title).toBe('Nhật ký kiểm toán');
    expect(englishAdmin.shipping.adminTitle).toBe('Fulfillment');
    expect(vietnameseAdmin.shipping.adminTitle).toBe('Xử lý giao hàng');
  });
});
