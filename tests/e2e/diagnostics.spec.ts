import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-diag-'));
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
    }),
  );
  return profile;
}

async function launch(profile: string, e2eHook: boolean) {
  const args = ['out/main/index.js', `--goetia-user-data=${profile}`];
  if (e2eHook) args.splice(1, 0, '--goetia-e2e');
  const app = await electron.launch({ args });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-diagnostics').click();
  return { app, win };
}

test('diagnostics: empty state, then a row and a pasteable report', async () => {
  const profile = makeProfile();

  // without the e2e hook nothing has gone wrong yet
  const quiet = await launch(profile, false);
  await expect(quiet.win.getByTestId('diag-empty')).toBeVisible();
  await expect(quiet.win.getByTestId('diag-row')).toHaveCount(0);
  await quiet.app.close();

  // the hook notes one recipe line 1.5s after boot; the pane fetches once on
  // open, so reopen it after the line has landed
  const { app, win } = await launch(profile, true);
  await win.waitForTimeout(2_000);
  await win.getByTestId('settings-nav-general').click();
  await win.getByTestId('settings-nav-diagnostics').click();
  const rows = win.getByTestId('diag-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('[recipe] zalo stale');

  await win.getByTestId('diag-copy').click();
  await expect(win.getByTestId('diag-copy')).toHaveText('Copied');
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  const lines = text.split('\n');
  expect(lines[0]).toMatch(/^Goetia \d+\.\d+\.\d+ · Electron \d+\.\d+\.\d+ · \w+ \w+$/);
  expect(lines[1]).toBe('Services: zalo');
  expect(lines[2]).toMatch(/^Settings: lightSleep=on /);
  expect(lines[3]).toBe('');
  expect(lines[4]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[recipe\] zalo stale$/);

  await app.close();
});
