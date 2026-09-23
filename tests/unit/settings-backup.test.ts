import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_KEYS,
  BACKUP_MAX_BYTES,
  BACKUP_VERSION,
  backupFileName,
  buildBackup,
  parseBackup,
} from '../../src/main/lib/settings-backup';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types';

const now = new Date(2026, 8, 22, 10, 30);
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  theme: 'dark',
  lastActiveId: 'zalo',
  mutedUntil: { ...DEFAULT_SETTINGS.mutedUntil, zalo: 1_800_000_000_000 },
  appLock: { enabled: true, touchId: false, guardActions: true },
  downloads: { ask: true, dir: '/Users/me/Chat' },
};

describe('buildBackup', () => {
  const file = buildBackup(settings, '0.18.0', now);

  it('carries exactly the allowlisted keys, and nothing of the moment or the lock', () => {
    expect(Object.keys(file.settings).sort()).toEqual([...BACKUP_KEYS].sort());
    const s = file.settings as Record<string, unknown>;
    for (const k of [
      'lastActiveId',
      'lastHomeOpen',
      'lastNotifiedVersion',
      'lastUsedAt',
      'mutedUntil',
      'globalMutedUntil',
      'quietOverrideWindowStart',
      'appLock',
    ]) {
      expect(k in s).toBe(false);
    }
    expect(file.settings.theme).toBe('dark');
  });

  it('keeps the download mode but never this machine’s folder', () => {
    expect(file.settings.downloads).toEqual({ ask: true, dir: null });
  });

  it('writes the header', () => {
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.app).toBe('0.18.0');
    expect(file.exportedAt).toBe(now.toISOString());
  });

  it('names the file by the day', () => {
    expect(backupFileName(now)).toBe('goetia-settings-2026-09-22.json');
  });
});

describe('parseBackup', () => {
  const wrap = (s: unknown) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: s });

  it('refuses text that is not JSON', () => {
    expect(parseBackup('{ nope')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('refuses anything that is not a Goetia backup object', () => {
    expect(parseBackup(JSON.stringify({ theme: 'dark' }))).toEqual({
      ok: false,
      reason: 'not-goetia',
    });
    expect(parseBackup(JSON.stringify([1, 2]))).toEqual({ ok: false, reason: 'not-goetia' });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, settings: 'x' }))).toEqual({
      ok: false,
      reason: 'not-goetia',
    });
  });

  it('refuses an oversize file before parsing it', () => {
    expect(parseBackup('x'.repeat(BACKUP_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('refuses a backup with nothing it knows', () => {
    expect(parseBackup(wrap({ lastActiveId: 'zalo', appLock: { enabled: true } }))).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('keeps allowlisted keys and ignores the rest of the file', () => {
    const r = parseBackup(
      wrap({ theme: 'light', closeToTray: false, lastActiveId: 'zalo', mutedUntil: { zalo: 5 } }),
    );
    expect(r).toEqual({ ok: true, patch: { theme: 'light', closeToTray: false } });
  });

  it('drops a mistyped scalar and keeps its neighbours', () => {
    const r = parseBackup(
      wrap({
        closeToTray: 'yes',
        theme: 'neon',
        railPosition: 'bottom',
        hibernationMinutes: 0,
        launchAtLogin: true,
        order: ['zalo', 'slack'],
      }),
    );
    expect(r).toEqual({ ok: true, patch: { launchAtLogin: true, order: ['zalo', 'slack'] } });
  });

  it('never lets a folder path in through downloads', () => {
    const r = parseBackup(wrap({ downloads: { ask: true, dir: '/tmp/x' } }));
    expect(r).toEqual({ ok: true, patch: { downloads: { ask: true, dir: null } } });
  });

  it('normalises shortcuts on the way in and drops a non-object outright', () => {
    expect(
      parseBackup(wrap({ shortcuts: { home: 'CmdOrCtrl+C', switcher: 'CmdOrCtrl+Shift+E' } })),
    ).toEqual({ ok: true, patch: { shortcuts: { switcher: 'CmdOrCtrl+Shift+E' } } });
    expect(parseBackup(wrap({ shortcuts: 'CmdOrCtrl+K', theme: 'light' }))).toEqual({
      ok: true,
      patch: { theme: 'light' },
    });
  });

  it('round-trips what buildBackup wrote', () => {
    const text = JSON.stringify(buildBackup(settings, '0.18.0', now));
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.patch).sort()).toEqual([...BACKUP_KEYS].sort());
    expect(r.patch.theme).toBe('dark');
  });
});
