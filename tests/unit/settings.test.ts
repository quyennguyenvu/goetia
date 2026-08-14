import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/settings';
import { SERVICES } from '../../src/shared/services';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  it('returns defaults on first run', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    expect(store.get().hibernationMinutes).toBe(30);
    expect(store.get().order[0]).toBe('discord');
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
    // an unseen id lands after its nearest catalog predecessor, so against a
    // legacy order the new ids scatter. Harmless: they all arrive disabled, and
    // summoning moves a service to the end of the rail regardless (summonOrder).
    expect(s.order).toEqual([
      'messenger',
      'teams',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'zalo',
      'whatsapp',
      'discord',
      'instagram',
    ]);
    expect(s.muted.teams).toBe(false);
    expect(s.disabled.teams).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.teams).toBe(true);
    expect(s.muted.slack).toBe(false);
    expect(s.disabled.slack).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.slack).toBe(true);
    expect(s.muted.instagram).toBe(false);
    expect(s.disabled.instagram).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.instagram).toBe(true);
    expect(s.muted.tiktok).toBe(false);
    expect(s.disabled.tiktok).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.tiktok).toBe(true);
    expect(s.muted.shopee).toBe(false);
    expect(s.disabled.shopee).toBe(true);
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
    expect(s.order).toEqual([
      'discord',
      'instagram',
      'messenger',
      'teams',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
    ]);
  });

  it('loads a settings.json that still carries the removed visited record', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ globalMuted: true, visited: { slack: true, whatsapp: false } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.globalMuted).toBe(true); // real prefs survive the dead key
    expect(s.order).toEqual(DEFAULT_SETTINGS.order);
    expect(s.disabled).toEqual(DEFAULT_SETTINGS.disabled);
  });

  it('keeps a user reordering when a new service arrives', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    // user moved messenger to the end; that must survive, wherever instagram lands
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        order: ['telegram', 'zalo', 'whatsapp', 'discord', 'tiktok', 'shopee', 'messenger'],
      }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.order).toEqual([
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'instagram',
      'tiktok',
      'shopee',
      'slack',
      'messenger',
      'teams',
    ]);
    // the property the user can actually see: their arrangement is intact
    const arrived = new Set(['instagram', 'slack', 'teams']);
    expect(s.order.filter((id) => !arrived.has(id))).toEqual([
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'tiktok',
      'shopee',
      'messenger',
    ]);
  });

  it('defaults automatic update checks on, with nothing announced yet', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.checkForUpdates).toBe(true);
    expect(s.lastNotifiedVersion).toBeNull();
  });

  it('adds the update fields to a settings.json written before they existed', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ globalMuted: true }));
    const s = new SettingsStore(dir).get();
    expect(s.checkForUpdates).toBe(true);
    expect(s.lastNotifiedVersion).toBeNull();
    expect(s.globalMuted).toBe(true); // existing pref survives
  });

  it('persists the last announced version', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({ lastNotifiedVersion: '0.3.0' });
    expect(new SettingsStore(dir).get().lastNotifiedVersion).toBe('0.3.0');
  });

  it('starts with no remembered surface', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.lastActiveId).toBeNull();
    expect(s.lastHomeOpen).toBe(false);
  });

  it('persists the remembered surface across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({ lastActiveId: 'discord', lastHomeOpen: true });
    const reread = new SettingsStore(dir).get();
    expect(reread.lastActiveId).toBe('discord');
    expect(reread.lastHomeOpen).toBe(true);
  });

  it('keeps an unknown lastActiveId rather than nulling it', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastActiveId: 'skype' }));
    // normalize() scrubs order and the boolean records but must not touch this:
    // resolveStartupSurface needs "recorded but gone" to read differently from
    // "never recorded", and only the raw value carries that difference
    expect(new SettingsStore(dir).get().lastActiveId as string).toBe('skype');
  });

  it('coerces a corrupt settings.json instead of throwing on startup', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    // hand-mangled file: order is a string, records are wrong types
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ order: 'oops', muted: 42, disabled: null }),
    );
    const store = new SettingsStore(dir);
    expect(() => store.get()).not.toThrow();
    const s = store.get();
    expect(s.order).toEqual(DEFAULT_SETTINGS.order);
    expect(s.disabled).toEqual(DEFAULT_SETTINGS.disabled);
  });

  it('trims an over-cap install to nine on first read and persists the trim', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const allOn = Object.fromEntries(SERVICES.map((s) => [s.id, false]));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ disabled: allOn }));

    const store = new SettingsStore(dir);
    const s = store.get();
    const enabled = s.order.filter((id) => !s.disabled[id]);
    expect(enabled).toHaveLength(9);
    // default order ends with zalo — the tenth enabled position is the trim
    expect(store.bootTrimmed).toEqual(['zalo']);
    expect(s.disabled.zalo).toBe(true);

    // persisted: a second instance reads a legal file and trims nothing
    const again = new SettingsStore(dir);
    expect(again.bootTrimmed).toEqual([]);
    expect(again.get().disabled.zalo).toBe(true);
  });

  it('reports no boot trim for a legal install', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).bootTrimmed).toEqual([]);
  });

  it('caps a hostile update payload on read', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    const allOn = Object.fromEntries(SERVICES.map((s) => [s.id, false])) as Settings['disabled'];
    const s = store.update({ disabled: allOn });
    expect(s.order.filter((id) => !s.disabled[id])).toHaveLength(9);
  });
});
