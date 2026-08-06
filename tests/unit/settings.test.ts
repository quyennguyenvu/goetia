import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/settings';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('returns defaults on first run', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    expect(store.get().hibernationMinutes).toBe(30);
    expect(store.get().order[0]).toBe('messenger');
  });

  it('persists partial updates across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({ globalMuted: true, hibernationMinutes: 10 });
    const reread = new SettingsStore(dir).get();
    expect(reread.globalMuted).toBe(true);
    expect(reread.hibernationMinutes).toBe(10);
    expect(reread.closeToTray).toBe(true); // untouched key keeps default
  });

  it('surfaces services added after settings.json was written', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    // settings.json from an install that predates shopee: conf persists whole
    // top-level objects, so these fully shadow the new defaults
    const five = {
      messenger: false,
      telegram: false,
      zalo: false,
      whatsapp: false,
      discord: false,
    };
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        order: ['messenger', 'telegram', 'zalo', 'whatsapp', 'discord'],
        muted: { ...five, messenger: true }, // user pref that must survive
        disabled: { ...five, whatsapp: true, telegram: true, discord: true },
        neverHibernate: {
          ...five,
          messenger: true,
          telegram: true,
          zalo: true,
          whatsapp: true,
          discord: true,
        },
      }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.order).toEqual(['messenger', 'telegram', 'zalo', 'whatsapp', 'discord', 'shopee']);
    expect(s.muted.shopee).toBe(false);
    expect(s.disabled.shopee).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.shopee).toBe(true);
    expect(s.muted.messenger).toBe(true); // existing prefs untouched
  });

  it('drops unknown service ids from a persisted order', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ order: ['messenger', 'skype', 'zalo'] }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.order).toEqual(['messenger', 'zalo', 'telegram', 'whatsapp', 'discord', 'shopee']);
  });
});
