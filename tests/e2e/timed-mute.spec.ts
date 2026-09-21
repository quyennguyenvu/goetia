import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

/** A native context menu cannot be driven, so the timed mute is seeded: zalo
 *  muted with an expiry a few seconds out. The tile's bell badge must lift on
 *  its own and the file must show the unmute. */
test('timed mute: a seeded expiry lifts the mute without a click', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-mute-'));
  const until = Date.now() + 6_000;
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'zalo',
      disabled: {
        whatsapp: true,
        messenger: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
      muted: { zalo: true },
      mutedUntil: { zalo: until },
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');

  const badge = win.locator('[data-testid="rail"] button[aria-label="Zalo"] [title^="Muted"]');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('title', /^Muted until \d\d:\d\d$/);

  // the expiry's own broadcast re-renders the tile; nothing is clicked
  await expect(badge).toHaveCount(0, { timeout: 15_000 });
  const s = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8'));
  expect(s.muted.zalo).toBe(false);
  expect(s.mutedUntil.zalo).toBe(0);

  await app.close();
});
