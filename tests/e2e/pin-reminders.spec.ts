import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isToast = (p: Page) => p.url().includes('toast.html');
// the toast layer is a file:// page too, and a reminder due at launch raises it early
const isShell = (p: Page) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html') && !isToast(p);

/** messenger + zalo summoned, two pins: zalo in progress, messenger queued.
 *  A native menu cannot be driven, so reminders are seeded by pin id. */
function seedProfile(remindAt: Record<number, number>): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-reminders-'));
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
    }),
  );
  writeFileSync(
    join(profile, 'pins.json'),
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
          remindAt: remindAt[1] ?? 0,
        },
        {
          id: 2,
          serviceId: 'messenger',
          text: 'review the release checklist',
          note: 'after lunch',
          conversation: '',
          href: 'https://www.facebook.com/messages/',
          at: 2,
          remindAt: remindAt[2] ?? 0,
        },
      ],
    }),
  );
  return profile;
}

/** In front always: focus cannot be relied on under Playwright, and the toast
 *  keeps a test run from posting real banners on this machine. */
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

test('pin reminders: a scheduled one turns due on its own and raises the toast', async () => {
  // far enough ahead that a loaded machine still sees it scheduled first
  const { app, win } = await launch(seedProfile({ 2: Date.now() + 20_000 }));
  await win.locator('[data-testid="home-btn"]').click();
  const row = win.locator('[data-testid="pin-row"]');
  const tally = win.locator('[data-testid="pin-tally"]');

  await expect(
    row.getByRole('button', { name: /^Reminder (tomorrow )?\d\d:\d\d, change$/ }),
  ).toBeVisible();
  await expect(tally).toHaveAttribute('title', '2 pinned — open Home');
  // the pin with no reminder offers one
  await expect(
    win.locator('[data-testid="pin-altar"]').getByRole('button', { name: 'Remind me' }),
  ).toBeVisible();

  // nothing is clicked: the fire's own broadcast re-renders the row and the tally
  await expect(row.getByRole('button', { name: /^Reminder due \d\d:\d\d, change$/ })).toBeVisible({
    timeout: 45_000,
  });
  await expect(tally).toHaveAttribute('title', '2 pinned · 1 due — open Home');

  await expect.poll(() => app.windows().some(isToast), { timeout: 15_000 }).toBe(true);
  const toast = app.windows().find(isToast) as Page;
  const card = toast.getByTestId('download-toast');
  await expect(card).toContainText('Reminder · Messenger');
  await expect(card).toContainText('after lunch — review the release checklist');
  await expect(toast.getByTestId('download-toast-action')).toHaveText('Open');
  await app.close();
});

test('pin reminders: one that came due while closed is due at launch, and opening the pin clears it', async () => {
  const { app, win } = await launch(seedProfile({ 1: Date.now() - 60_000 }));
  const tally = win.locator('[data-testid="pin-tally"]');
  await expect(tally).toHaveAttribute('title', '2 pinned · 1 due — open Home');

  // positive control for the lock spec: an unlocked launch does announce
  await expect.poll(() => app.windows().some(isToast), { timeout: 15_000 }).toBe(true);
  const toast = app.windows().find(isToast) as Page;
  const card = toast.getByTestId('download-toast');
  await expect(card).toContainText('Reminder · Nhóm Sale Q7');
  await expect(card).toContainText('Gửi lại báo giá cho khách bên Q7');
  await expect(toast.getByTestId('download-toast-action')).toHaveText('Open');

  await win.locator('[data-testid="home-btn"]').click();
  const altar = win.locator('[data-testid="pin-altar"]');
  await expect(altar.getByRole('button', { name: /^Reminder due .+, change$/ })).toBeVisible();

  // opening the pin is the acknowledgement
  await altar.getByRole('button', { name: 'Gửi lại báo giá cho khách bên Q7' }).click();
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await expect(tally).toHaveAttribute('title', '2 pinned — open Home');

  await win.locator('[data-testid="home-btn"]').click();
  await expect(altar.getByRole('button', { name: 'Remind me' })).toBeVisible();
  await app.close();
});
