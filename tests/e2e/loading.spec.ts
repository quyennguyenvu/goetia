import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('waking cover: overlay page exists, tiles breathe, timeout reveals', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  // fresh profiles now start all-disabled (welcome screen); this spec
  // assumes the pre-welcome defaults, so seed them explicitly
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
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });

  const isShell = (p: { url(): string }) =>
    p.url().startsWith('file://') && !p.url().includes('loading.html');
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));

  // the overlay page is its own webContents, present from startup
  const isOverlay = (p: { url(): string }) => p.url().includes('loading.html');
  const overlay =
    app.windows().find(isOverlay) ?? (await app.waitForEvent('window', { predicate: isOverlay }));
  await expect(overlay.locator('.portal')).toBeAttached();

  // messenger (active, logged out, waitForReady) breathes during the
  // wake, then the 10s timeout reveals and the breathing stops
  const tile = win.locator('[data-testid="rail"] button[aria-label="Messenger"]');
  await expect(tile).toHaveClass(/tile-breathe/);
  await expect(tile).not.toHaveClass(/tile-breathe/, { timeout: 15_000 });

  await app.close();
});
