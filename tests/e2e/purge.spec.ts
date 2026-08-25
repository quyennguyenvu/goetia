import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Locator, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

/** messenger + zalo summoned; the rest unbound */
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-purge-'));
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
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

const rgb = (el: Locator, prop: 'color' | 'backgroundColor') =>
  el.evaluate(
    (node, p) => (getComputedStyle(node)[p as 'color'].match(/\d+/g) ?? []).slice(0, 3).map(Number),
    prop,
  );

test('purge all: the confirm stays disabled until the sweep is acknowledged', async () => {
  const { app, win } = await launch();
  await win.locator('[data-testid="home-btn"]').click();
  await win.locator('[data-testid="purge-all-btn"]').click();

  const dialog = win.locator('[data-testid="purge-confirm"]');
  await expect(dialog).toBeVisible();
  // every service, not just the two summoned ones — the sweep is the only
  // path to an unbound service's credentials
  await expect(dialog.getByRole('heading')).toHaveText('Purge all 10 logins?');

  const confirm = win.locator('[data-testid="purge-confirm-btn"]');
  await expect(confirm).toBeDisabled();

  await win.locator('[data-testid="purge-ack"]').check();
  await expect(confirm).toBeEnabled();

  // red fill, white text — only once it is actually armed
  const [r, g, b] = await rgb(confirm, 'backgroundColor');
  expect(r).toBeGreaterThan(g + 40);
  expect(r).toBeGreaterThan(b + 40);
  const [tr, tg, tb] = await rgb(confirm, 'color');
  expect(Math.min(tr, tg, tb)).toBeGreaterThan(230);

  // unticking re-arms the gate
  await win.locator('[data-testid="purge-ack"]').uncheck();
  await expect(confirm).toBeDisabled();

  await win.locator('[data-testid="purge-cancel"]').click();
  await expect(dialog).toHaveCount(0);
  await app.close();
});

test('purge all: Escape closes the confirm without leaving Home', async () => {
  const { app, win } = await launch();
  await win.locator('[data-testid="home-btn"]').click();
  await win.locator('[data-testid="purge-all-btn"]').click();
  await expect(win.locator('[data-testid="purge-confirm"]')).toBeVisible();

  await win.keyboard.press('Escape');
  await expect(win.locator('[data-testid="purge-confirm"]')).toHaveCount(0);
  // Welcome's own Escape (leave Home) must not have fired underneath
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await app.close();
});

test('purge login: one service needs no acknowledgement, and Escape keeps Settings open', async () => {
  const { app, win } = await launch();
  await win.locator('[data-testid="settings-btn"]').click();
  await win.locator('[data-testid="settings-nav-services"]').click();
  await win.locator('[data-testid="purge-messenger"]').click();

  const dialog = win.locator('[data-testid="purge-confirm"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Purge the Messenger login?');
  // a single service is not the heavy action: no checkbox, armed immediately
  await expect(win.locator('[data-testid="purge-ack"]')).toHaveCount(0);
  await expect(win.locator('[data-testid="purge-confirm-btn"]')).toBeEnabled();

  await win.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // Settings' own Escape (close the modal) must not have fired underneath
  await expect(win.locator('[data-testid="settings"]')).toBeVisible();
  await app.close();
});
