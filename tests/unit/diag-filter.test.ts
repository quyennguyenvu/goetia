import { describe, expect, it } from 'vitest';
import {
  DIAG_QUERY_MAX,
  DIAG_TAGS,
  describeDiagFilter,
  diagFilterNarrows,
  EMPTY_DIAG_FILTER,
  isDiagTag,
  matchesDiagFilter,
  normalizeDiagFilter,
} from '../../src/shared/diag-filter';
import type { DiagEntry } from '../../src/shared/types';

const nav: DiagEntry = {
  at: 1,
  tag: 'nav',
  serviceId: 'zalo',
  line: 'contained: zalo id.zalo.me (/oauth)',
};
const stale: DiagEntry = {
  at: 2,
  tag: 'recipe',
  serviceId: 'zalo',
  line: 'zalo stale: count timeout',
};
const started: DiagEntry = { at: 3, tag: 'app', line: 'started 0.17.2' };

describe('DIAG_TAGS', () => {
  it('lists every tag once, in chip order', () => {
    expect(DIAG_TAGS).toEqual([
      'app',
      'nav',
      'open',
      'identity',
      'passkey',
      'lock',
      'ipc',
      'notifications',
      'downloads',
      'recipe',
      'view',
      'peek',
      'recents',
    ]);
    expect(isDiagTag('recipe')).toBe(true);
    expect(isDiagTag('bogus')).toBe(false);
    expect(isDiagTag(42)).toBe(false);
  });
});

describe('normalizeDiagFilter', () => {
  it('keeps known tags only, deduped, in DIAG_TAGS order', () => {
    expect(
      normalizeDiagFilter({ tags: ['view', 'bogus', 'nav', 'view', 7], query: '' }).tags,
    ).toEqual(['nav', 'view']);
  });

  it('trims and clips the query', () => {
    expect(normalizeDiagFilter({ tags: [], query: '  zalo  ' }).query).toBe('zalo');
    expect(normalizeDiagFilter({ tags: [], query: 'x'.repeat(500) }).query).toHaveLength(
      DIAG_QUERY_MAX,
    );
  });

  it('maps anything malformed to the empty filter', () => {
    for (const raw of [undefined, null, 'zalo', 42, [], { tags: 'nav', query: 3 }, {}]) {
      expect(normalizeDiagFilter(raw)).toEqual({ tags: [], query: '' });
    }
    expect(EMPTY_DIAG_FILTER).toEqual({ tags: [], query: '' });
  });
});

describe('matchesDiagFilter', () => {
  it('matches every row on the empty filter', () => {
    for (const e of [nav, stale, started]) {
      expect(matchesDiagFilter(e, EMPTY_DIAG_FILTER)).toBe(true);
    }
  });

  it('narrows by tag set', () => {
    const f = { tags: ['nav', 'app'] as const, query: '' };
    expect(matchesDiagFilter(nav, f)).toBe(true);
    expect(matchesDiagFilter(started, f)).toBe(true);
    expect(matchesDiagFilter(stale, f)).toBe(false);
  });

  it('matches the query case-insensitively against tag, service id and line', () => {
    expect(matchesDiagFilter(nav, { tags: [], query: 'ZALO.ME' })).toBe(true);
    expect(matchesDiagFilter(stale, { tags: [], query: '[recipe]' })).toBe(true);
    expect(matchesDiagFilter(nav, { tags: [], query: 'zalo' })).toBe(true); // the service id
    expect(matchesDiagFilter(started, { tags: [], query: 'zalo' })).toBe(false);
    expect(matchesDiagFilter(started, { tags: [], query: '  started ' })).toBe(true); // trimmed
  });

  it('requires both when both are set', () => {
    expect(matchesDiagFilter(stale, { tags: ['recipe'], query: 'timeout' })).toBe(true);
    expect(matchesDiagFilter(stale, { tags: ['recipe'], query: 'oauth' })).toBe(false);
    expect(matchesDiagFilter(nav, { tags: ['recipe'], query: 'oauth' })).toBe(false);
  });
});

describe('diagFilterNarrows', () => {
  it('is false for the empty filter and a whitespace query', () => {
    expect(diagFilterNarrows(EMPTY_DIAG_FILTER)).toBe(false);
    expect(diagFilterNarrows({ tags: [], query: '   ' })).toBe(false);
    expect(diagFilterNarrows({ tags: ['nav'], query: '' })).toBe(true);
    expect(diagFilterNarrows({ tags: [], query: 'x' })).toBe(true);
  });
});

describe('describeDiagFilter', () => {
  it('names the tags, the query and the count, omitting what is empty', () => {
    expect(describeDiagFilter({ tags: ['nav', 'recipe'], query: ' zalo ' }, 12, 87)).toBe(
      'tag=nav,recipe · "zalo" · 12 of 87 lines',
    );
    expect(describeDiagFilter({ tags: ['app'], query: '' }, 2, 3)).toBe('tag=app · 2 of 3 lines');
    expect(describeDiagFilter({ tags: [], query: 'nope' }, 0, 2)).toBe('"nope" · 0 of 2 lines');
  });
});
