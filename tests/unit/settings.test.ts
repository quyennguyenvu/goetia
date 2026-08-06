import { mkdtempSync, rmSync } from 'node:fs';
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
});
