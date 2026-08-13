import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { SERVICES } from '../../src/shared/services';

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

  // nothing is summoned yet: the intro carries the screen and the whole catalog
  // waits below
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await expect(welcome.locator('[data-testid="welcome-intro"]')).toBeVisible();
  await expect(unbound.locator('[data-testid="pick-tile"]')).toHaveCount(SERVICES.length);

  // confirm is disabled until something is selected
  const summon = win.getByRole('button', { name: /^Summon/ });
  await expect(summon).toBeDisabled();

  // selecting stages the change without moving the tile out of Unbound
  await unbound.getByRole('button', { name: 'Zalo' }).click();
  await expect(summon).toHaveText('Summon 1 service');
  await expect(unbound.getByRole('button', { name: 'Zalo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(summoned.getByRole('button', { name: 'Zalo' })).toHaveCount(0);

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

test('summoning appends to the end of the rail, not to catalog position', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  const { app, win } = await launch(profile);

  const welcome = win.locator('[data-testid="welcome"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  const railTiles = win.locator('[data-testid="service-tile"]');
  const railOrder = () =>
    railTiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

  // two at once arrive in name order
  await unbound.getByRole('button', { name: 'Telegram' }).click();
  await unbound.getByRole('button', { name: 'Discord' }).click();
  await win.getByRole('button', { name: 'Summon 2 services' }).click();
  await expect(railTiles).toHaveCount(2);
  expect(await railOrder()).toEqual(['Discord', 'Telegram']);

  // a later arrival goes last even though it sorts first
  await win.locator('[data-testid="home-btn"]').click();
  await welcome
    .locator('[data-testid="welcome-section-unbound"]')
    .getByRole('button', { name: 'Instagram' })
    .click();
  await win.getByRole('button', { name: 'Summon 1 service' }).click();
  await expect(railTiles).toHaveCount(3);
  expect(await railOrder()).toEqual(['Discord', 'Telegram', 'Instagram']);

  await app.close();
});
