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
});
