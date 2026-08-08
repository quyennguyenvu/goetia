import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

// one enabled service: the welcome screen would otherwise fill the content
// region the toast is anchored to
function seedProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
      },
    }),
  );
  return profile;
}

async function launchWithUpdate(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e-update', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('update toast expires on its own and leaves a dot that opens Updates', async () => {
  const { app, win } = await launchWithUpdate(seedProfile());

  const toast = win.locator('[data-testid="update-toast"]');
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toContainText('Goetia 99.0.0 is available');

  // nobody clicks or hovers it — the whole point is that it leaves anyway
  await expect(toast).toHaveCount(0, { timeout: 15_000 });

  // the dot is what the toast leaves behind
  await expect(win.locator('[data-testid="gear-dot"]')).toBeVisible();

  // the gear lands on the Updates pane, not wherever settings was last left
  await win.locator('[data-testid="settings-btn"]').click();
  await expect(win.locator('[data-testid="settings"]')).toBeVisible();
  await expect(win.locator('[data-testid="settings-nav-updates"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(win.locator('[data-testid="nav-update-dot"]')).toBeVisible();
  const action = win.locator('[data-testid="update-action"]');
  await expect(action).toHaveText('Download');
  await expect(action).toBeInViewport();

  // and the panes are genuinely separate: switching hides the Updates content
  await win.locator('[data-testid="settings-nav-appearance"]').click();
  await expect(action).toHaveCount(0);
  await expect(win.getByText('Menu position')).toBeVisible();

  await app.close();
});

// tokens.css kills every animation under reduced motion. A dismissal driven
// by the drain bar's animationend would strand the toast on screen forever,
// so this asserts the timer — not the animation — is what ends it.
test('update toast still dismisses under reduced motion', async () => {
  const { app, win } = await launchWithUpdate(seedProfile());
  await win.emulateMedia({ reducedMotion: 'reduce' });

  const toast = win.locator('[data-testid="update-toast"]');
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toHaveCount(0, { timeout: 15_000 });
  await expect(win.locator('[data-testid="gear-dot"]')).toBeVisible();

  await app.close();
});
