import { describe, expect, it } from 'vitest';
import { contentKey, slugKey } from './content';

describe('editable text keys', () => {
  it('builds page-scoped keys that satisfy the site_content key check', () => {
    const k = contentKey('overview', 'Wards audited this year');
    expect(k).toBe('overview.wards-audited-this-year');
    expect(k).toMatch(/^[a-z0-9._-]{1,120}$/);
  });
  it('keeps the same text on different pages separate', () => {
    expect(contentKey('shell', 'Overview')).not.toBe(contentKey('overview', 'Overview'));
  });
  it('handles punctuation, length and empty text', () => {
    expect(slugKey('Ward / unit')).toBe('ward-unit');
    expect(slugKey('Simulation with sample data. Not for clinical or operational use.').length).toBeLessThanOrEqual(60);
    expect(slugKey('—')).toBe('text');
  });
});
