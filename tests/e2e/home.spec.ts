import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
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

test('home: sigil toggles welcome and seeds the live selection', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');
  const home = win.locator('[data-testid="home-btn"]');

  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await expect(welcome).toHaveCount(0);

  await home.click();
  await expect(welcome).toBeVisible();
  // seeded: the two enabled services arrive already selected, so the confirm
  // button has nothing to do
  await expect(welcome.getByRole('button', { name: 'Messenger' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(welcome.getByRole('button', { name: 'Telegram' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  // toggling back off returns to the service
  await home.click();
  await expect(welcome).toHaveCount(0);
  await app.close();
});

test('home: banishing the active service leaves welcome on screen', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  await win.locator('[data-testid="home-btn"]').click();
  await welcome.getByRole('button', { name: 'Messenger' }).click();

  const confirm = win.getByRole('button', { name: 'Banish 1 service' });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // the regression this whole plan exists for: no service view may take over
  await expect(welcome).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(1);
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await app.close();
});

test('settings: composition is gone, Manage services… lands on home', async () => {
  const { app, win } = await launch();

  await win.locator('[data-testid="settings-btn"]').click();
  await win.locator('[data-testid="settings-nav-services"]').click();

  const pane = win.locator('[data-testid="settings"]');
  await expect(pane.getByText('enabled')).toHaveCount(0);
  // only the two enabled services are listed
  await expect(pane.getByText('never hibernate')).toHaveCount(2);

  await win.locator('[data-testid="manage-services"]').click();
  await expect(pane).toHaveCount(0);
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await app.close();
});
