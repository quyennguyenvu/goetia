import { describe, expect, it } from 'vitest';
import { ALL_SERVICE_IDS, SHOTS, settingsFor, THEMES } from '../../scripts/lib/shots.mjs';
import { SERVICES } from '../../src/shared/services';

describe('capture matrix', () => {
  it('pairs every surface with every theme, with unique filenames', () => {
    const stems = [...new Set(SHOTS.map((s) => s.stem))];
    expect(SHOTS).toHaveLength(stems.length * THEMES.length);
    for (const theme of THEMES) {
      const forTheme = SHOTS.filter((s) => s.theme === theme).map((s) => s.stem);
      expect([...forTheme].sort()).toEqual([...stems].sort());
    }
    const files = SHOTS.map((s) => `${s.stem}-${s.theme}.png`);
    expect(new Set(files).size).toBe(files.length);
  });

  it('stays in sync with the app service catalog', () => {
    expect([...ALL_SERVICE_IDS].sort()).toEqual(SERVICES.map((s) => s.id).sort());
  });

  it('disables exactly the services a shot does not enable', () => {
    // settings enables zalo, telegram, whatsapp — the rest must be disabled
    const shot = SHOTS.find((s) => s.stem === 'settings' && s.theme === 'dark');
    if (!shot) throw new Error('settings/dark missing from the matrix');
    const seeded = settingsFor(shot);
    expect(seeded.theme).toBe('dark');
    expect(seeded.railPosition).toBe('top');
    expect(seeded.disabled.zalo).toBe(false);
    expect(seeded.disabled.whatsapp).toBe(false);
    expect(seeded.disabled.discord).toBe(true);
    expect(seeded.disabled.shopee).toBe(true);
    expect(Object.keys(seeded.disabled).sort()).toEqual([...ALL_SERVICE_IDS].sort());
    expect(Object.keys(seeded.muted).sort()).toEqual([...ALL_SERVICE_IDS].sort());
  });

  it('shows a full rail with one muted service for the badge shot', () => {
    const shot = SHOTS.find((s) => s.stem === 'rail-badges' && s.theme === 'dark');
    if (!shot) throw new Error('rail-badges/dark missing from the matrix');
    const seeded = settingsFor(shot);
    expect(Object.values(seeded.disabled).every((d) => d === false)).toBe(true);
    expect(seeded.muted.whatsapp).toBe(true);
    expect(seeded.muted.zalo).toBe(false);
  });

  it('never pre-loads hidden views, so the injected badge is not raced', () => {
    // neverHibernate defaults to true for every service; a hidden zalo view
    // would run its recipe and overwrite the count --goetia-e2e injects
    for (const shot of SHOTS) {
      expect(Object.values(settingsFor(shot).neverHibernate).every((v) => v === false)).toBe(true);
    }
  });

  it('leaves every service disabled for the welcome shot', () => {
    const shot = SHOTS.find((s) => s.stem === 'welcome');
    if (!shot) throw new Error('welcome missing from the matrix');
    expect(Object.values(settingsFor(shot).disabled).every(Boolean)).toBe(true);
  });

  it('enables zalo for any shot that needs the injected unread badge', () => {
    // --goetia-e2e fires the fake count on zalo only (src/main/index.ts)
    const badgeShots = SHOTS.filter((s) => s.surface === 'rail');
    expect(badgeShots.length).toBeGreaterThan(0);
    for (const s of badgeShots) expect(s.enabled).toContain('zalo');
  });
});
