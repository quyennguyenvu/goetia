import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('fresh install: welcome picker → summon → rail', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  const { app, win } = await launch(profile);

  // fresh profile: welcome shows, no rail tiles, no service views
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();
  const tiles = win.locator('[data-testid="service-tile"]');
  await expect(tiles).toHaveCount(0);

  // confirm is disabled until something is selected
  const summon = win.getByRole('button', { name: /^Summon/ });
  await expect(summon).toBeDisabled();

  await welcome.getByRole('button', { name: 'Zalo' }).click();
  await expect(summon).toHaveText('Summon 1 service');
  await summon.click();

  // welcome gone, one tile, zalo active
  await expect(welcome).toHaveCount(0);
  await expect(tiles).toHaveCount(1);
  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Zalo',
  );
  await app.close();

  // the choice persisted: a relaunch skips the welcome
  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(1);
  await expect(second.win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await second.app.close();
});
