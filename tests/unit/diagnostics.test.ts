import { describe, expect, it } from 'vitest';
import {
  DIAG_CAP,
  Diagnostics,
  formatReport,
  recipeTransition,
  redactUrl,
  restoreEntries,
  sanitizeDetail,
  serviceSnapshotLine,
  settingsSummary,
  withPage,
} from '../../src/main/lib/diagnostics';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

function harness(start = 1_000_000) {
  let now = start;
  const mirrored: string[] = [];
  const diag = new Diagnostics({ now: () => now, mirror: (l) => void mirrored.push(l) });
  const tick = (ms: number) => {
    now += ms;
  };
  return { diag, mirrored, tick };
}

const header = {
  version: '0.17.2',
  electron: '43.3.0',
  platform: 'darwin',
  arch: 'arm64',
  os: '25.6.0',
  startedAt: Date.UTC(2026, 8, 19, 9, 0, 0),
  now: Date.UTC(2026, 8, 19, 10, 1, 0),
  enabled: ['zalo', 'messenger'] as const,
  settings: 'lightSleep=on',
  services: ['zalo: live · chat.zalo.me/ · unread 3/0', 'messenger: asleep'],
};

describe('Diagnostics ring', () => {
  it('returns newest first with the time it was noted', () => {
    const { diag, tick } = harness();
    diag.note('nav', 'contained: zalo a.example (/x)', 'zalo');
    tick(5_000);
    diag.note('open', 'zalo miss: lanes=href', 'zalo');
    const r = diag.recent();
    expect(r.map((e) => e.tag)).toEqual(['open', 'nav']);
    expect(r[1]).toEqual({
      at: 1_000_000,
      tag: 'nav',
      serviceId: 'zalo',
      line: 'contained: zalo a.example (/x)',
    });
  });

  it('omits serviceId when none is given', () => {
    const { diag } = harness();
    diag.note('ipc', 'settings:update handler failed: boom');
    expect('serviceId' in diag.recent()[0]).toBe(false);
  });

  it('mirrors every note as the old console line', () => {
    const { diag, mirrored } = harness();
    diag.note('nav', 'popup denied: zalo:popup x.example (/oauth)');
    expect(mirrored).toEqual(['[nav] popup denied: zalo:popup x.example (/oauth)']);
  });

  it('keeps the newest DIAG_CAP entries and drops the oldest', () => {
    const { diag } = harness();
    for (let i = 0; i < DIAG_CAP + 1; i++) diag.note('view', `line ${i}`);
    const r = diag.recent();
    expect(r).toHaveLength(DIAG_CAP);
    expect(r[0].line).toBe(`line ${DIAG_CAP}`);
    expect(r[DIAG_CAP - 1].line).toBe('line 1');
  });

  it('builds the report oldest first under the header', () => {
    const { diag, tick } = harness(Date.UTC(2026, 8, 19, 10, 0, 0));
    diag.note('nav', 'contained: zalo a.example (/x)', 'zalo');
    tick(60_000);
    diag.note('recipe', 'zalo stale', 'zalo');
    const text = diag.report(header);
    expect(text.split('\n')).toEqual([
      'Goetia 0.17.2 · Electron 43.3.0 · darwin arm64 · OS 25.6.0',
      'Started 2026-09-19T09:00:00.000Z · up 1h 1m',
      'Services: zalo, messenger',
      'Settings: lightSleep=on',
      'Now:',
      '  zalo: live · chat.zalo.me/ · unread 3/0',
      '  messenger: asleep',
      '',
      '2026-09-19T10:00:00.000Z [nav] contained: zalo a.example (/x)',
      '2026-09-19T10:01:00.000Z [recipe] zalo stale',
    ]);
  });

  it('clips an over-long line so a page-fed detail cannot bloat the ring', () => {
    const { diag } = harness();
    diag.note('recipe', `zalo stale: ${'x'.repeat(1000)}`, 'zalo');
    expect(diag.recent()[0].line.length).toBeLessThanOrEqual(300);
  });
});

describe('persistence', () => {
  it('flushes the ring through save and restores it through load', () => {
    let disk: unknown;
    const a = new Diagnostics({
      now: () => 5,
      mirror: () => {},
      load: () => disk,
      save: (entries) => {
        disk = entries;
      },
    });
    a.note('view', 'messenger crashed', 'messenger');
    a.flush();
    const b = new Diagnostics({ now: () => 6, mirror: () => {}, load: () => disk, save: () => {} });
    expect(b.recent()).toEqual([
      { at: 5, tag: 'view', serviceId: 'messenger', line: 'messenger crashed' },
    ]);
  });
});

describe('restoreEntries', () => {
  it('keeps only well-formed entries with known tags and services, newest DIAG_CAP', () => {
    const good = { at: 1, tag: 'nav', serviceId: 'zalo', line: 'ok' };
    const raw = [
      good,
      { at: 'x', tag: 'nav', line: 'bad at' },
      { at: 2, tag: 'bogus', line: 'bad tag' },
      { at: 3, tag: 'view', serviceId: 'nope', line: 'bad service' },
      { at: 4, tag: 'view', line: 42 },
      'junk',
    ];
    expect(restoreEntries(raw)).toEqual([good]);
    expect(restoreEntries('not an array')).toEqual([]);
    expect(restoreEntries(undefined)).toEqual([]);
    const many = Array.from({ length: DIAG_CAP + 10 }, (_, i) => ({
      at: i,
      tag: 'view',
      line: `l${i}`,
    }));
    const kept = restoreEntries(many);
    expect(kept).toHaveLength(DIAG_CAP);
    expect(kept[0].at).toBe(10);
  });
});

describe('sanitizeDetail', () => {
  it('accepts only a string, flattens whitespace and clips', () => {
    expect(sanitizeDetail('count\n  timeout\t now')).toBe('count timeout now');
    expect(sanitizeDetail('x'.repeat(500)).length).toBe(160);
    expect(sanitizeDetail(42)).toBe('');
    expect(sanitizeDetail('a\u0000b\u001bc')).toBe('abc');
  });
});

describe('withPage', () => {
  it('appends the page location when known', () => {
    expect(withPage('zalo stale', 'https://chat.zalo.me/')).toBe('zalo stale · on chat.zalo.me/');
    expect(withPage('zalo stale', null)).toBe('zalo stale');
  });
});

describe('serviceSnapshotLine', () => {
  it('describes a live service and an asleep one', () => {
    expect(
      serviceSnapshotLine({
        id: 'zalo',
        page: 'https://chat.zalo.me/',
        unread: { direct: 3, indirect: 1 },
        stale: true,
        crashed: false,
        muted: true,
      }),
    ).toBe('zalo: live · chat.zalo.me/ · unread 3/1 · STALE · muted');
    expect(
      serviceSnapshotLine({
        id: 'slack',
        page: null,
        unread: { direct: 0, indirect: 0 },
        stale: false,
        crashed: true,
        muted: false,
      }),
    ).toBe('slack: asleep · unread 0/0 · CRASHED');
  });
});

describe('formatReport', () => {
  it('says so when the ring is empty', () => {
    expect(formatReport(header, []).split('\n').at(-1)).toBe('(nothing recorded)');
  });
});

describe('redactUrl', () => {
  it('keeps origin and path, drops query and hash', () => {
    expect(redactUrl('https://id.zalo.me/oauth/cb?code=SECRET&state=1#frag')).toBe(
      'https://id.zalo.me/oauth/cb',
    );
  });
  it('returns an unparseable value verbatim — it is still evidence', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('recipeTransition', () => {
  it('fires only on a change of the flag', () => {
    expect(recipeTransition(false, true)).toBe('stale');
    expect(recipeTransition(true, false)).toBe('recovered');
    expect(recipeTransition(true, true)).toBeNull();
    expect(recipeTransition(false, false)).toBeNull();
  });
});

describe('settingsSummary', () => {
  it('names the settings that explain most behaviour differences', () => {
    expect(settingsSummary(DEFAULT_SETTINGS)).toBe(
      'lightSleep=on peekSaver=off autoBanish=off/24h quietHours=off appLock=off downloads=folder',
    );
    expect(
      settingsSummary({
        ...DEFAULT_SETTINGS,
        peekSaver: true,
        autoBanish: { enabled: true, hours: 48 },
        downloads: { ask: true, dir: null },
      }),
    ).toBe('lightSleep=on peekSaver=on autoBanish=on/48h quietHours=off appLock=off downloads=ask');
  });
});
