import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const allFalse = {
  whatsapp: false,
  messenger: false,
  instagram: false,
  telegram: false,
  discord: false,
  zalo: false,
  tiktok: false,
  shopee: false,
  slack: false,
  teams: false,
};

test('a sleeping service peeks hidden and goes back to sleep', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  // messenger boots active (first enabled in catalog order); zalo sleeps
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        instagram: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        slack: true,
        teams: true,
      },
      neverHibernate: allFalse,
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    env: {
      ...process.env,
      GOETIA_SWEEP_MS: '1000',
      GOETIA_PEEK_INTERVAL_MS: '5000',
      GOETIA_PEEK_TIMEOUT_MS: '10000',
    },
  });

  const isShell = (p: { url(): string }) =>
    p.url().startsWith('file://') && !p.url().includes('loading.html');
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  const rail = win.locator('[data-testid="rail"]');
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  // the boot warm-up peek creates zalo's view hidden…
  const isZalo = (p: { url(): string }) => p.url().includes('zalo');
  const zalo =
    app.windows().find(isZalo) ??
    (await app.waitForEvent('window', { predicate: isZalo, timeout: 30_000 }));

  // …the rail highlight never moves off the active service…
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  // …and the peek tears the view down after its first report or the timeout
  await zalo.waitForEvent('close', { timeout: 30_000 });
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  await app.close();
});
