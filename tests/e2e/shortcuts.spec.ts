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

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');
const isService = (p: Page) => p.url().startsWith('https://');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-keys-'));
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

async function launch() {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${makeProfile()}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  const page =
    app.windows().find(isService) ?? (await app.waitForEvent('window', { predicate: isService }));
  return { app, win, page };
}

/** A chord arriving at the service view's `before-input-event`. Playwright's
 *  keyboard goes through CDP, which hands the key straight to the renderer
 *  and never through Electron's pre-dispatch hook (verified 2026-08-28: the
 *  page logs the keydown, the listener sees nothing) — so the event is
 *  emitted on the view's webContents, and the test covers everything from
 *  the listener down: matcher → hook → command → state → shell. */
async function chord(app: ElectronApplication, key: string): Promise<void> {
  await app.evaluate(({ webContents }, k) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    wc.emit(
      'before-input-event',
      { preventDefault() {} },
      {
        type: 'keyDown',
        key: k,
        code: `Key${k}`,
        meta: process.platform === 'darwin',
        control: process.platform !== 'darwin',
        shift: true,
        alt: false,
        isAutoRepeat: false,
      },
    );
  }, key);
}

// Discord bound the old ⌘⇧H itself, and a page sees a key before the menu
// does — the chord has to be taken in before-input-event or it never reaches
// Goetia. Both chords are left-hand: the right hand is on the mouse.
test('shortcuts: ⌘/Ctrl ⇧ G inside a service page opens Home', async () => {
  const { app, win } = await launch();
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await chord(app, 'G');
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await app.close();
});

test('shortcuts: ⌘/Ctrl ⇧ S inside a service page pins the selection', async () => {
  const { app, win, page } = await launch();
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveCount(0);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'gọi lại khách hàng lúc 3 giờ';
    document.body.append(p);
    document.getSelection()?.selectAllChildren(p);
  });
  await chord(app, 'S');
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  await win.locator('[data-testid="home-btn"]').click();
  await expect(win.locator('[data-testid="pin-altar"]')).toContainText('gọi lại khách hàng');
  await app.close();
});
