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
    expect(store.get().lightSleep).toBe(true);
    // Light Sleep makes sleeping safe, so nothing is kept awake by default
    expect(Object.values(store.get().neverHibernate).every((v) => v === false)).toBe(true);
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
    expect(s.neverHibernate.teams).toBe(false);
    expect(s.muted.slack).toBe(false);
    expect(s.disabled.slack).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.slack).toBe(false);
    expect(s.muted.instagram).toBe(false);
    expect(s.disabled.instagram).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.instagram).toBe(false);
    expect(s.muted.tiktok).toBe(false);
    expect(s.disabled.tiktok).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.tiktok).toBe(false);
    expect(s.muted.shopee).toBe(false);
    expect(s.disabled.shopee).toBe(true);
    expect(s.neverHibernate.shopee).toBe(false);
    expect(s.neverHibernate.messenger).toBe(true); // persisted choice untouched
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

  it('defaults quiet hours off, 22:00–07:00, every day', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.quietHours).toEqual({
      enabled: false,
      start: '22:00',
      end: '07:00',
      days: [true, true, true, true, true, true, true],
    });
    expect(s.quietOverrideWindowStart).toBeNull();
  });

  it('persists quiet hours edits and the override across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({
      quietHours: {
        enabled: true,
        start: '21:30',
        end: '06:00',
        days: [false, true, true, true, true, true, false],
      },
      quietOverrideWindowStart: 1_755_000_000_000,
    });
    const reread = new SettingsStore(dir).get();
    expect(reread.quietHours.enabled).toBe(true);
    expect(reread.quietHours.start).toBe('21:30');
    expect(reread.quietHours.days[0]).toBe(false);
    expect(reread.quietOverrideWindowStart).toBe(1_755_000_000_000);
  });

  it('coerces a mangled quietHours block field by field', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        quietHours: { enabled: 'yes', start: '25:99', end: '06:30', days: [true, false] },
        quietOverrideWindowStart: 'soon',
      }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.quietHours.enabled).toBe(false); // junk -> default
    expect(s.quietHours.start).toBe('22:00'); // invalid time -> default
    expect(s.quietHours.end).toBe('06:30'); // valid field survives
    expect(s.quietHours.days).toEqual([true, true, true, true, true, true, true]);
    expect(s.quietOverrideWindowStart).toBeNull();
  });

  it('defaults the summon hotkey off with the stock combo', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).get().summonHotkey).toEqual({
      enabled: false,
      accelerator: 'Alt+CmdOrCtrl+G',
    });
  });

  it('coerces an off-list summon accelerator back to the default', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ summonHotkey: { enabled: true, accelerator: 'CmdOrCtrl+Q' } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.summonHotkey.enabled).toBe(true); // valid field survives
    expect(s.summonHotkey.accelerator).toBe('Alt+CmdOrCtrl+G');
  });

  it('defaults zoom to 0 for every service', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const zoom = new SettingsStore(dir).get().zoom;
    expect(Object.keys(zoom)).toHaveLength(SERVICES.length);
    expect(Object.values(zoom).every((z) => z === 0)).toBe(true);
  });

  it('fills missing zoom keys and clamps corrupt values', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ zoom: { whatsapp: 99, telegram: 'big', discord: 1.5 } }),
    );
    const zoom = new SettingsStore(dir).get().zoom;
    expect(zoom.whatsapp).toBe(3.5); // clamped to ZOOM_MAX
    expect(zoom.telegram).toBe(0); // corrupt string coerced
    expect(zoom.discord).toBe(1.5);
    expect(zoom.zalo).toBe(0); // missing key filled
  });

  it('round-trips a zoom update across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.update({ zoom: { ...store.get().zoom, slack: 1 } });
    expect(new SettingsStore(dir).get().zoom.slack).toBe(1);
  });

  // R3: get() re-read and re-normalized settings.json on every call (27 µs of
  // synchronous readFileSync, ~5× per broadcast). Reads now come from memory.
  it('serves reads from memory instead of re-reading the file', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    expect(store.get().hibernationMinutes).toBe(30);
    // an edit made underneath a running store is not observed: the cache is
    // authoritative between writes, and this store is the only writer
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ hibernationMinutes: 99 }));
    expect(store.get().hibernationMinutes).toBe(30);
  });

  it('freezes what get() hands out, so a stray mutation cannot poison the cache', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    const s = store.get();
    // get() returns a shared reference now rather than a fresh normalize() per
    // call, so mutating it would silently corrupt every later read
    expect(() => {
      (s as { globalMuted: boolean }).globalMuted = true;
    }).toThrow(TypeError);
    expect(() => {
      (s.disabled as Record<string, boolean>).slack = false;
    }).toThrow(TypeError);
    expect(store.get().globalMuted).toBe(false);
    // the supported way to change it still works
    expect(store.update({ globalMuted: true }).globalMuted).toBe(true);
  });

  it('reflects its own writes immediately (read-your-writes)', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.update({ globalMuted: true });
    // setServiceMuted writes and then re-reads through applyAudioMute; a cache
    // that lagged a write would silently stop mute from taking effect
    expect(store.get().globalMuted).toBe(true);
    store.update({ muted: { ...store.get().muted, slack: true } });
    expect(store.get().muted.slack).toBe(true);
  });

  it('re-normalizes its own writes rather than trusting the patch', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    // the cap must still apply to a cached write, not just a file read
    const allOn = Object.fromEntries(SERVICES.map((s) => [s.id, false])) as Settings['disabled'];
    store.update({ disabled: allOn });
    const s = store.get();
    expect(s.order.filter((id) => !s.disabled[id])).toHaveLength(9);
  });

  it('invalidates the cache after the boot trim writes', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const allOn = Object.fromEntries(SERVICES.map((s) => [s.id, false]));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ disabled: allOn }));
    const store = new SettingsStore(dir);
    expect(store.bootTrimmed).toEqual(['zalo']);
    expect(store.get().disabled.zalo).toBe(true);
  });

  // R4': update() looped conf.set per key, and each key is a full atomic write
  // (4.96 ms measured). rememberSurface writes two keys on every service switch.
  it('persists a multi-key patch as one write', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    expect(store.writeCount).toBe(0);
    store.update({ lastActiveId: 'discord', lastHomeOpen: true });
    expect(store.writeCount).toBe(1);
    const reread = new SettingsStore(dir).get();
    expect(reread.lastActiveId).toBe('discord');
    expect(reread.lastHomeOpen).toBe(true);
  });

  // R4': zoom is the one setting on a key-repeat path (⌘+ held down), and
  // losing the last step to a hard kill is harmless — unlike the remembered
  // surface, which must stay immediate.
  it('defers a deferred write until flush, while reading it back immediately', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.updateDeferred({ zoom: { ...store.get().zoom, slack: 1 } });
    expect(store.get().zoom.slack).toBe(1); // read-your-writes from the cache
    expect(new SettingsStore(dir).get().zoom.slack).toBe(0); // not on disk yet
    store.flush();
    expect(new SettingsStore(dir).get().zoom.slack).toBe(1);
  });

  it('coalesces repeated deferred writes into a single flush', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    // ⌘+ held down: four steps within ZOOM_MAX, so nothing clamps here
    for (const level of [0.5, 1, 1.5, 2]) {
      store.updateDeferred({ zoom: { ...store.get().zoom, slack: level } });
    }
    expect(store.writeCount).toBe(0); // nothing has touched the disk yet
    store.flush();
    expect(store.writeCount).toBe(1);
    expect(new SettingsStore(dir).get().zoom.slack).toBe(2);
  });

  it('flushes a pending deferred write on dispose', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.updateDeferred({ zoom: { ...store.get().zoom, teams: 2 } });
    store.dispose();
    expect(new SettingsStore(dir).get().zoom.teams).toBe(2);
  });

  it('treats flush with nothing pending as a no-op', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.flush();
    store.flush();
    expect(store.writeCount).toBe(0);
  });

  it('lets an immediate update overtake a pending deferred one', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.updateDeferred({ zoom: { ...store.get().zoom, slack: 1 } });
    store.update({ lastActiveId: 'slack' });
    // the immediate write must carry the pending zoom with it, not drop it
    const reread = new SettingsStore(dir).get();
    expect(reread.lastActiveId).toBe('slack');
    expect(reread.zoom.slack).toBe(1);
  });

  it('defaults auto-banish off at 24 hours with no usage stamps', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.autoBanish).toEqual({ enabled: false, hours: 24 });
    expect(Object.keys(s.lastUsedAt)).toHaveLength(SERVICES.length);
    expect(Object.values(s.lastUsedAt).every((v) => v === 0)).toBe(true);
  });

  it('coerces a mangled autoBanish block field by field', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ autoBanish: { enabled: 'yes', hours: 9000 } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.autoBanish.enabled).toBe(false); // junk -> default
    expect(s.autoBanish.hours).toBe(720); // clamped to max
  });

  it('fills missing lastUsedAt keys and zeroes corrupt values', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ lastUsedAt: { zalo: 1000, discord: 'never', slack: -5 } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.lastUsedAt.zalo).toBe(1000); // valid stamp survives
    expect(s.lastUsedAt.discord).toBe(0); // corrupt string coerced
    expect(s.lastUsedAt.slack).toBe(0); // negative coerced
    expect(s.lastUsedAt.whatsapp).toBe(0); // missing key filled
  });

  it('round-trips lastUsedAt and autoBanish across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.update({
      autoBanish: { enabled: true, hours: 48 },
      lastUsedAt: { ...store.get().lastUsedAt, discord: 123_456 },
    });
    const reread = new SettingsStore(dir).get();
    expect(reread.autoBanish).toEqual({ enabled: true, hours: 48 });
    expect(reread.lastUsedAt.discord).toBe(123_456);
  });
});
