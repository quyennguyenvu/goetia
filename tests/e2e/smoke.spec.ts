import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('launch, rail, badge propagation', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });

  // Every webContents (including service views and the loading overlay)
  // counts as a "window" — the shell renderer is the file:// page that
  // isn't the overlay.
  const isShell = (p: { url(): string }) =>
    p.url().startsWith('file://') && !p.url().includes('loading.html');
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));

  await expect(win.locator('[data-testid="rail"]')).toBeVisible();
  // only messenger and zalo are enabled by default
  await expect(win.locator('[data-testid="rail"] button[aria-label]')).toHaveCount(2);

  // glyph masks must resolve in the built bundle — Vite inlines the logo SVGs
  // as data URIs with single quotes, which break unquoted CSS url() tokens
  const maskImage = await win
    .locator('.glyph')
    .first()
    .evaluate((el) => getComputedStyle(el).maskImage);
  expect(maskImage).not.toBe('none');

  // fake unread fired by --goetia-e2e reaches the rail badge…
  await expect(win.locator('[data-testid="rail"]').getByText('3', { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // …and the dock badge on macOS
  if (process.platform === 'darwin') {
    const badge = await app.evaluate(({ app: electronApp }) => electronApp.getBadgeCount());
    expect(badge).toBe(3);
  }

  await app.close();
});
