import { describe, expect, it } from 'vitest';
import { matchesDownloadQuery, normalizeDownloadQuery } from '../../src/shared/download-filter';

describe('normalizeDownloadQuery', () => {
  it('trims and lower-cases; whitespace alone is the empty query', () => {
    expect(normalizeDownloadQuery('  Bao-Gia ')).toBe('bao-gia');
    expect(normalizeDownloadQuery('   ')).toBe('');
  });
});

describe('matchesDownloadQuery', () => {
  const row = { filename: 'Q7-bao-gia-v3.pdf' };
  it('matches every row on the empty query', () => {
    expect(matchesDownloadQuery(row, 'Zalo', '')).toBe(true);
  });
  it('matches the file name and the service name, case-insensitively', () => {
    expect(matchesDownloadQuery(row, 'Zalo', 'bao-gia')).toBe(true);
    expect(matchesDownloadQuery(row, 'Zalo', '.PDF'.toLowerCase())).toBe(true);
    expect(matchesDownloadQuery(row, 'Zalo', 'zalo')).toBe(true);
    expect(matchesDownloadQuery(row, 'Zalo', 'slack')).toBe(false);
    expect(matchesDownloadQuery(row, 'Zalo', 'gia-v4')).toBe(false);
  });
  it('matches across Unicode normalization forms', () => {
    // macOS writes a file name decomposed (e + U+0301); a keyboard types the composed e-acute.
    const decomposed = { filename: 'te\u0301t4.jpeg' };
    const composed = { filename: 't\u00e9t4.jpeg' };
    expect(matchesDownloadQuery(decomposed, 'Messenger', normalizeDownloadQuery('té'))).toBe(true);
    expect(matchesDownloadQuery(composed, 'Messenger', normalizeDownloadQuery('te\u0301'))).toBe(
      true,
    );
    expect(matchesDownloadQuery(decomposed, 'Messenger', normalizeDownloadQuery('TÉT4'))).toBe(
      true,
    );
    expect(matchesDownloadQuery(decomposed, 'Messenger', normalizeDownloadQuery('tet'))).toBe(
      false,
    );
  });
});
