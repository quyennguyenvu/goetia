import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

/** messenger + zalo enabled; the rest banished */
const DISABLED = {
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
};

async function launch(extra: Record<string, unknown>, env?: { [key: string]: string }) {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify({ disabled: DISABLED, ...extra }));
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    ...(env ? { env } : {}),
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('sleep settings live in Services; the hours input follows the toggle', async () => {
  const { app, win } = await launch({});
  await win.locator('[data-testid="settings-btn"]').click();
  await win.locator('[data-testid="settings-nav-services"]').click();

  const pane = win.locator('[data-testid="settings"]');
  await expect(pane.getByText('Hibernate idle services after (minutes)')).toBeVisible();
  await expect(win.locator('[data-testid="light-sleep-enabled"]')).toBeVisible();

  // the per-service login purge lives here: one button per enabled service
  await expect(pane.getByRole('button', { name: 'Purge login…' })).toHaveCount(2);

  const hours = win.locator('[data-testid="auto-banish-hours"]');
  await expect(win.locator('[data-testid="auto-banish-enabled"]')).not.toBeChecked();
  await expect(hours).toBeDisabled();
  await expect(hours).toHaveValue('24');
  await win.locator('[data-testid="auto-banish-enabled"]').check();
  await expect(hours).toBeEnabled();

  // the rows really moved: General no longer carries them
  await win.locator('[data-testid="settings-nav-general"]').click();
  await expect(pane.getByText('Hibernate idle services after (minutes)')).toHaveCount(0);
  await expect(win.locator('[data-testid="light-sleep-enabled"]')).toHaveCount(0);
  await app.close();
});

test('a service unused past the threshold is banished to Home', async () => {
  // zalo was last used in 1970 (persisted clock, so the threshold spans
  // restarts); messenger boots active and is exempt. Light Sleep off keeps
  // peek views out of the assertion.
  const { app, win } = await launch(
    {
      lightSleep: false,
      autoBanish: { enabled: true, hours: 24 },
      lastUsedAt: { zalo: 1000 },
    },
    { ...process.env, GOETIA_SWEEP_MS: '1000' },
  );

  const rail = win.locator('[data-testid="rail"]');
  // the first compressed sweep banishes zalo before the shell even paints, so
  // assert the outcome, not the transient: one tile left, messenger untouched
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  // zalo sits in Home's banished (unbound) section, ready to re-summon
  await win.locator('[data-testid="home-btn"]').click();
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('button', { name: 'Zalo' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await app.close();
});
