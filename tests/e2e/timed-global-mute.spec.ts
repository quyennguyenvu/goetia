import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** A native menu cannot be driven, so the timed global mute is seeded, with
 *  quiet hours covering now: the expiry must lift the mute on its own AND
 *  leave quiet hours in force — a hand unmute would have dismissed the window. */
test('timed global mute: the expiry lifts the mute and quiet hours stay', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-gmute-'));
  const now = Date.now();
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
      globalMuted: true,
      globalMutedUntil: now + 6_000,
      quietHours: {
        enabled: true,
        start: hhmm(new Date(now - 3_600_000)),
        end: hhmm(new Date(now + 7_200_000)),
        days: [true, true, true, true, true, true, true],
      },
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');

  const bell = win.getByTestId('bell');
  await expect(bell).toHaveAttribute(
    'title',
    /^Unmute all notifications .*— muted until \d\d:\d\d$/,
  );

  // the expiry's own broadcast re-renders the bell; nothing is clicked
  await expect(bell).not.toHaveAttribute('title', /muted until/, { timeout: 15_000 });
  await expect(bell).toHaveAttribute('title', /^Unmute all notifications .*quiet hours until/);
  const s = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8'));
  expect(s.globalMuted).toBe(false);
  expect(s.globalMutedUntil).toBe(0);
  expect(s.quietOverrideWindowStart ?? null).toBeNull();

  await app.close();
});
