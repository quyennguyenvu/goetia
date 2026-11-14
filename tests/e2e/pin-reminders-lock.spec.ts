import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from '@playwright/test';

const PASSCODE = 'correct horse';
const isShell = (p: Page) =>
  p.url().startsWith('file://') &&
  !p.url().includes('loading.html') &&
  !p.url().includes('toast.html');
const isToast = (p: Page) => p.url().includes('toast.html');

const toastVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((w) =>
      w.contentView.children.some((v) => {
        const wc = (v as unknown as { webContents?: { getURL(): string } }).webContents;
        return (wc?.getURL().includes('toast.html') ?? false) && v.getVisible();
      }),
    ),
  );

const pinsFile = (remindAt: number) =>
  JSON.stringify({
    pins: [
      {
        id: 1,
        serviceId: 'zalo',
        text: 'Gửi lại báo giá cho khách bên Q7',
        note: '',
        conversation: 'Nhóm Sale Q7',
        href: 'https://chat.zalo.me/',
        at: 1,
        remindAt,
      },
      {
        id: 2,
        serviceId: 'messenger',
        text: 'review the release checklist',
        note: 'after lunch',
        conversation: '',
        href: 'https://www.facebook.com/messages/',
        at: 2,
        remindAt: 0,
      },
    ],
  });

function seedProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-pin-reminders-lock-'));
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
        instagram: true,
        slack: true,
        teams: true,
      },
      appLock: { enabled: false, touchId: false },
    }),
  );
  writeFileSync(join(profile, 'pins.json'), pinsFile(0));
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    env: { ...(process.env as Record<string, string>), GOETIA_E2E_IN_FRONT: '1' },
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

test('a reminder that came due while closed raises no toast at a locked launch', async () => {
  test.setTimeout(60_000);
  const profile = seedProfile();

  const first = await launch(profile);
  await first.win.getByTestId('settings-btn').click();
  await first.win.getByTestId('settings-nav-lock').click();
  await first.win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await first.win.getByTestId('lock-enable').click();
  await expect(first.win.getByTestId('lock-status')).toHaveText('Lock on.');
  await first.app.close();

  // a plaintext pins file is accepted and re-sealed at the next launch
  writeFileSync(join(profile, 'pins.json'), pinsFile(Date.now() - 60_000));

  const { app, win } = await launch(profile);
  await expect(win.getByTestId('lock-passcode')).toBeVisible();
  for (let i = 0; i < 8; i++) {
    expect(app.windows().some(isToast)).toBe(false);
    expect(await toastVisible(app)).toBe(false);
    await new Promise((r) => setTimeout(r, 500));
  }

  // the overwritten file was read: once unlocked, the pin shows as due
  await win.getByTestId('lock-passcode').fill(PASSCODE);
  await win.getByTestId('lock-submit').click();
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveAttribute(
    'title',
    '2 pinned · 1 due — open Home',
  );
  await app.close();
});
