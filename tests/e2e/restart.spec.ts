import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

const TWO_ENABLED = {
  whatsapp: true,
  messenger: false,
  telegram: false,
  discord: true,
  zalo: true,
  tiktok: true,
  shopee: true,
};

/** A profile that survives between launches — the quit-and-reopen loop needs
 *  the same userData directory twice. */
function makeProfile(settings: Record<string, unknown>): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify(settings));
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

const activeTile = '[data-testid="service-tile"][aria-current="page"]';

test('restart: reopens on the service that was active at quit', async () => {
  const profile = makeProfile({ disabled: TWO_ENABLED });
  const first = await launch(profile);

  // messenger leads the default order, so it is what a cold start picks
  await expect(first.win.locator(activeTile)).toHaveAttribute('aria-label', 'Messenger');
  // the tile renders an icon, so the name is only on aria-label — never hasText
  await first.win.locator('[data-testid="service-tile"][aria-label="Telegram"]').click();
  await expect(first.win.locator(activeTile)).toHaveAttribute('aria-label', 'Telegram');
  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator(activeTile)).toHaveAttribute('aria-label', 'Telegram');
  await expect(second.win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await second.app.close();
});

test('restart: reopens on Home when Home was the surface at quit', async () => {
  const profile = makeProfile({ disabled: TWO_ENABLED });
  const first = await launch(profile);

  await first.win.locator('[data-testid="home-btn"]').click();
  await expect(first.win.locator('[data-testid="welcome"]')).toBeVisible();
  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="welcome"]')).toBeVisible();
  // both services are still enabled: Home was restored over a live service,
  // not shown because everything was disabled
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(2);

  // the view was resolved but held hidden under Home, so leaving reveals it
  await second.win.keyboard.press('Escape');
  await expect(second.win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await expect(second.win.locator(activeTile)).toHaveAttribute('aria-label', 'Messenger');
  await second.app.close();
});

test('restart: a recorded service that is now disabled opens Home', async () => {
  // unreachable by driving the UI — only a hand-edited or synced settings.json
  // gets here, so it is written directly
  const profile = makeProfile({ disabled: TWO_ENABLED, lastActiveId: 'shopee' });
  const { app, win } = await launch(profile);

  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await app.close();
});
