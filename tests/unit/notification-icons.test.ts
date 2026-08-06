import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { iconFileName, resolveIcons } from '../../src/main/lib/notification-icons';
import { SERVICES } from '../../src/shared/services';

const ICON_DIR = fileURLToPath(new URL('../../resources/notification-icons', import.meta.url));

/** PNG signature then IHDR: width at byte 16, height at byte 20. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('notification icon assets', () => {
  it.each(SERVICES.map((s) => s.id))('%s has both variants at 128px', (id) => {
    for (const name of [`${id}.png`, `${id}-mac.png`]) {
      expect(pngSize(join(ICON_DIR, name))).toEqual({ width: 128, height: 128 });
    }
  });
});

describe('iconFileName', () => {
  it('uses the inset variant on macOS', () => {
    expect(iconFileName('zalo', 'darwin')).toBe('zalo-mac.png');
  });

  it('uses the full-bleed variant elsewhere', () => {
    expect(iconFileName('zalo', 'win32')).toBe('zalo.png');
    expect(iconFileName('zalo', 'linux')).toBe('zalo.png');
  });
});

describe('resolveIcons', () => {
  const dir = join('/tmp', 'icons');

  it('maps only the ids whose file is present', () => {
    const present = new Set([join(dir, 'zalo-mac.png')]);
    const found = resolveIcons(dir, ['zalo', 'telegram'], 'darwin', (p) => present.has(p));
    expect([...found.keys()]).toEqual(['zalo']);
    expect(found.get('zalo')).toBe(join(dir, 'zalo-mac.png'));
  });

  it('returns an empty map when nothing is present', () => {
    expect(resolveIcons(dir, ['zalo'], 'darwin', () => false).size).toBe(0);
  });

  it('resolves every committed asset for real', () => {
    const ids = SERVICES.map((s) => s.id);
    expect([...resolveIcons(ICON_DIR, ids, 'darwin', existsSync).keys()]).toEqual(ids);
  });
});
