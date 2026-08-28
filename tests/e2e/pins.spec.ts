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

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function visibleServiceUrls(app: ElectronApplication): Promise<string[]> {
  const urls = await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0].contentView.children as Electron.WebContentsView[])
      .filter((v) => v.getVisible())
      .map((v) => v.webContents.getURL()),
  );
  return urls.filter((u) => !u.includes('loading.html'));
}

/** messenger + zalo summoned, two pins on disk: zalo in progress, messenger next.
 *  `long` swaps pin 1 for a paragraph-length message with a long conversation
 *  label — the 2026-08-27 recording's shape. */
function seedProfile({ long = false } = {}): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-pins-'));
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
          text: long ? LONG_TEXT : 'Gửi lại báo giá cho khách bên Q7',
          note: '',
          conversation: long ? LONG_CONVERSATION : 'Nhóm Sale Q7',
          href: 'https://chat.zalo.me/',
          at: 1,
        },
        {
          id: 2,
          serviceId: 'messenger',
          text: 'review the release checklist',
          note: 'after lunch',
          conversation: '',
          href: 'https://www.facebook.com/messages/',
          at: 2,
        },
      ],
    }),
  );
  return profile;
}

const LONG_TEXT =
  'Dạ 1 cây làm chẳng nên non 3 cây chụm lại mới xong 1 bài. Em cần thêm sự hỗ trợ của Minh Khôi và Phát Diệp nữa ạ, mọi người xem giúp em với';
const LONG_CONVERSATION =
  'a, a, An, e, Hong, Huy, Lê, Long, Mai, Minh, Mỹ, Ngo, Nguyễn, Phạm, Tú, You';

/** px the document is wider than the viewport — 0 means Home never grew to a pin */
const horizontalOverflow = (win: Page) =>
  win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Home's rows animate into place — measure only once the geometry settles */
async function stableBox(win: Page, selector: string) {
  const el = win.locator(selector);
  let prev = await el.boundingBox();
  for (let i = 0; i < 20; i++) {
    await win.waitForTimeout(100);
    const next = await el.boundingBox();
    if (prev && next && prev.x === next.x && prev.y === next.y) return next;
    prev = next;
  }
  throw new Error(`${selector} never settled`);
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('pins: the tally counts them, Home shows altar + queue', async () => {
  const { app, win } = await launch(seedProfile());
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveText('2');

  await win.locator('[data-testid="home-btn"]').click();
  const band = win.locator('[data-testid="welcome-section-pinned"]');
  await expect(band).toContainText('Pinned');
  const altar = band.locator('[data-testid="pin-altar"]');
  await expect(altar).toContainText('Gửi lại báo giá');
  await expect(altar).toContainText('In progress');
  await expect(altar).toContainText('Nhóm Sale Q7'); // the conversation it was pinned in
  await expect(band.locator('[data-testid="pin-row"]')).toHaveCount(1);
  await expect(band.locator('[data-testid="pin-row"]')).toContainText('after lunch');
  await app.close();
});

test('pins: Done promotes the next pin, Undo brings it back', async () => {
  const { app, win } = await launch(seedProfile());
  await win.locator('[data-testid="home-btn"]').click();
  const band = win.locator('[data-testid="welcome-section-pinned"]');
  const altar = band.locator('[data-testid="pin-altar"]');

  await altar.getByRole('button', { name: 'Done' }).click();
  await expect(altar).toContainText('review the release checklist');
  await expect(band.locator('[data-testid="pin-row"]')).toHaveCount(0);
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  const toast = win.locator('[data-testid="pin-toast"]');
  await expect(toast).toContainText('Done — nice.');
  await expect(toast).toContainText('Zalo'); // the pin's service labels the toast

  await win.locator('[data-testid="pin-undo"]').click();
  await expect(altar).toContainText('Gửi lại báo giá'); // back at index 0
  await expect(band.locator('[data-testid="pin-row"]')).toHaveCount(1);
  await expect(toast).toHaveCount(0);
  await app.close();
});

test('pins: Open leaves Home and lands on the service', async () => {
  const { app, win } = await launch(seedProfile());
  await win.locator('[data-testid="home-btn"]').click();
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();

  // the message text is the open affordance — there is no separate button
  await win
    .locator('[data-testid="pin-altar"]')
    .getByRole('button', { name: 'Gửi lại báo giá cho khách bên Q7' })
    .click();
  await expect(welcome).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Zalo',
  );
  // the view layer is the oracle for "a service took the screen"
  await expect(async () => {
    expect((await visibleServiceUrls(app)).some((u) => u.includes('zalo'))).toBe(true);
  }).toPass();
  await app.close();
});

test('pins: a removal survives a relaunch', async () => {
  const profile = seedProfile();
  const first = await launch(profile);
  await first.win.locator('[data-testid="home-btn"]').click();
  await first.win.locator('[data-testid="pin-row"]').getByRole('button', { name: 'Unpin' }).click();
  await expect(first.win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  await second.win.locator('[data-testid="home-btn"]').click();
  await expect(second.win.locator('[data-testid="pin-altar"]')).toContainText('Gửi lại báo giá');
  await expect(second.win.locator('[data-testid="pin-row"]')).toHaveCount(0);
  await second.app.close();
});

// the 2026-08-27 recording: a paragraph-length pin made Home wider than the
// window, and the drag then measured against a board that kept growing
test('pins: a long pin neither widens Home nor derails the drag', async () => {
  const profile = seedProfile({ long: true });
  const first = await launch(profile);
  const { win } = first;
  await win.locator('[data-testid="home-btn"]').click();
  const band = win.locator('[data-testid="welcome-section-pinned"]');
  const altar = band.locator('[data-testid="pin-altar"]');
  await expect(altar).toContainText('Dạ 1 cây làm chẳng');
  expect(await horizontalOverflow(win)).toBe(0);

  // stepped, like reorder.spec: Motion needs real intermediate moves
  const handle = await stableBox(win, '[data-testid="pin-altar"] [title="Drag to reprioritize"]');
  const row = await stableBox(win, '[data-testid="pin-row"]');
  await win.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await win.mouse.down();
  await win.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 8, { steps: 4 });
  await win.mouse.move(handle.x + handle.width / 2, row.y + row.height / 2 + 10, { steps: 12 });
  expect(await horizontalOverflow(win)).toBe(0); // mid-drag, the row re-styled as a queue row
  await win.mouse.up();

  await expect(altar).toContainText('review the release checklist');
  await expect(band.locator('[data-testid="pin-row"]')).toContainText('Dạ 1 cây làm chẳng');
  expect(await horizontalOverflow(win)).toBe(0);
  await first.app.close();

  // the drop reached main once and stuck
  const second = await launch(profile);
  await second.win.locator('[data-testid="home-btn"]').click();
  await expect(second.win.locator('[data-testid="pin-altar"]')).toContainText(
    'review the release checklist',
  );
  await second.app.close();
});
