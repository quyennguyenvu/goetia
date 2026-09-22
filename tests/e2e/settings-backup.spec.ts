import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

const ONLY_ZALO = {
  whatsapp: true,
  messenger: true,
  telegram: true,
  discord: true,
  zalo: false,
  tiktok: true,
  shopee: true,
  instagram: true,
  slack: true,
  teams: true,
};

function seed(profile: string, extra: Record<string, unknown>): string {
  mkdirSync(profile, { recursive: true });
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({ lastActiveId: 'zalo', disabled: ONLY_ZALO, ...extra }),
  );
  return profile;
}

async function launch(profile: string, backup: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    // a native dialog cannot be driven; under the e2e flag this path stands in
    env: { ...process.env, GOETIA_E2E_BACKUP_PATH: backup },
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  await win.getByTestId('settings-btn').click();
  return { app, win };
}

test('settings backup: export carries preferences only, import restores them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'goetia-e2e-backup-'));
  const backup = join(dir, 'backup.json');
  // a full permutation: the store slots any missing id back in at boot
  const order = [
    'zalo',
    'slack',
    'discord',
    'instagram',
    'messenger',
    'teams',
    'shopee',
    'telegram',
    'tiktok',
    'whatsapp',
  ];

  // profile A: a dark theme and a custom rail order, exported
  const a = seed(join(dir, 'a'), { theme: 'dark', order });
  const { app: appA, win: winA } = await launch(a, backup);
  await winA.getByTestId('backup-export').click();
  await expect(winA.getByTestId('backup-status')).toHaveText(/^Saved to /);
  expect(existsSync(backup)).toBe(true);
  const file = JSON.parse(readFileSync(backup, 'utf8'));
  expect(file.format).toBe('goetia-settings');
  expect(file.settings.theme).toBe('dark');
  expect(file.settings.order).toEqual(order);
  expect('lastActiveId' in file.settings).toBe(false);
  expect('mutedUntil' in file.settings).toBe(false);
  expect('appLock' in file.settings).toBe(false);
  await appA.close();

  // profile B: light, default order, its own remembered surface — imports A
  const b = seed(join(dir, 'b'), { theme: 'light' });
  const { app: appB, win: winB } = await launch(b, backup);
  await winB.getByTestId('backup-import').click();
  await expect(winB.getByTestId('backup-status')).toHaveText(/^Restored from /);
  await appB.close();
  const s = JSON.parse(readFileSync(join(b, 'settings.json'), 'utf8'));
  expect(s.theme).toBe('dark');
  expect(s.order).toEqual(order);
  expect(s.lastActiveId).toBe('zalo'); // B's own state, untouched
});
