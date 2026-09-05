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
  // a cold create is a wake, and the cover says so
  await expect(overlay.locator('#caption')).toHaveText('Waking Messenger…');

  // ⌘K hides the view and the cover; the shell placeholder behind the
  // switcher carries the same caption while the wake is on…
  await app.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    wc.emit(
      'before-input-event',
      { preventDefault() {} },
      {
        type: 'keyDown',
        key: 'K',
        code: 'KeyK',
        meta: process.platform === 'darwin',
        control: process.platform !== 'darwin',
        shift: false,
        alt: false,
        isAutoRepeat: false,
      },
    );
  });
  await expect(win.locator('[data-testid="switcher"]')).toBeVisible();
  await expect(win.getByText('Waking Messenger…')).toBeVisible();

  // …and goes blank when the wake ends, even though the logged-out page may
  // still be loading subframes: the placeholder is keyed on waking, never on
  // loading (a live Discord read "Waking Discord…" behind ⌘K, 2026-09-05)
  await expect(tile).not.toHaveClass(/tile-breathe/, { timeout: 15_000 });
  await expect(win.getByText(/^Waking /)).toHaveCount(0);

  await app.close();
});
