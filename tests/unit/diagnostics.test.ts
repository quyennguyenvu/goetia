import { describe, expect, it } from 'vitest';
import {
  DIAG_CAP,
  Diagnostics,
  formatReport,
  recipeTransition,
  redactUrl,
  settingsSummary,
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
  enabled: ['zalo', 'messenger'] as const,
  settings: 'lightSleep=on',
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
      'Goetia 0.17.2 · Electron 43.3.0 · darwin arm64',
      'Services: zalo, messenger',
      'Settings: lightSleep=on',
      '',
      '2026-09-19T10:00:00.000Z [nav] contained: zalo a.example (/x)',
      '2026-09-19T10:01:00.000Z [recipe] zalo stale',
    ]);
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
