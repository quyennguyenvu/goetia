import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-calls-off-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'messenger',
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: true,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
    }),
  );
  return profile;
}

// the e2e messenger page is logged out, so ready never fires and the watcher
// never runs: the seeded state is all the tile has
test('calls off: the Messenger tile carries the mark and says how to turn calls on', async () => {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e-calls-off', `--goetia-user-data=${makeProfile()}`],
  });
  try {
    const win =
      app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
    await win.waitForLoadState('domcontentloaded');
    const tile = win.locator('[data-testid="service-tile"][aria-label="Messenger"]');
    const mark = tile.getByTestId('calls-off-mark');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute(
      'title',
      'Incoming calls are off on Facebook — right-click to turn on',
    );
  } finally {
    await app.close();
  }
});
