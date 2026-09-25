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

function makeProfile(o: { active?: string; enabled?: string[] } = {}): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-keys-'));
  const enabled = new Set(o.enabled ?? ['zalo']);
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: o.active ?? 'zalo',
      disabled: Object.fromEntries(
        [
          'whatsapp',
          'messenger',
          'telegram',
          'discord',
          'zalo',
          'tiktok',
          'shopee',
          'instagram',
          'slack',
          'teams',
        ].map((id) => [id, !enabled.has(id)]),
      ),
    }),
  );
  return profile;
}

async function launch(profile = makeProfile()) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
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
async function chord(app: ElectronApplication, key: string, code = `Key${key}`): Promise<void> {
  await app.evaluate(
    ({ webContents }, [k, c]) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
      if (!wc) throw new Error('no service view');
      wc.emit(
        'before-input-event',
        { preventDefault() {} },
        {
          type: 'keyDown',
          key: k,
          code: c,
          meta: process.platform === 'darwin',
          control: process.platform !== 'darwin',
          shift: true,
          alt: false,
          isAutoRepeat: false,
        },
      );
    },
    [key, code] as const,
  );
}

const cmd = process.platform === 'darwin' ? { meta: true } : { control: true };
const mac = process.platform === 'darwin';

/** A key arriving at the SHELL window's before-input-event — where the
 *  recorder listens while Settings → Shortcuts has a cap pressed. */
async function shellKey(
  app: ElectronApplication,
  key: string,
  code: string,
  mods: { meta?: boolean; control?: boolean; shift?: boolean; alt?: boolean } = {},
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [k, c, m]) => {
      BrowserWindow.getAllWindows()[0].webContents.emit(
        'before-input-event',
        { preventDefault() {} },
        {
          type: 'keyDown',
          key: k,
          code: c,
          meta: false,
          control: false,
          shift: false,
          alt: false,
          isAutoRepeat: false,
          ...m,
        },
      );
    },
    [key, code, mods] as const,
  );
}

test('shortcuts: a key is rebound by pressing it, the page honours it, Reset all restores', async () => {
  const { app, win } = await launch();
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-shortcuts').click();

  // record: click the cap, press the new chord on the shell window
  const home = win.getByTestId('shortcut-cap-home');
  await expect(home).toHaveText(mac ? '⇧⌘G' : 'Ctrl+Shift+G');
  await home.click();
  await expect(home).toContainText('Press a shortcut');
  await shellKey(app, 'E', 'KeyE', { ...cmd, shift: true });
  await expect(home).toHaveText(mac ? '⇧⌘E' : 'Ctrl+Shift+E');
  await expect(win.getByTestId('shortcut-reset-home')).toContainText(mac ? '⇧⌘G' : 'Ctrl+Shift+G');

  // a collision names its holder and keeps listening; Escape gives up
  const pin = win.getByTestId('shortcut-cap-pinSelection');
  await pin.click();
  await shellKey(app, 'k', 'KeyK', cmd);
  await expect(win.getByTestId('shortcut-row-pinSelection')).toContainText(
    'taken by Quick Switcher',
  );
  await shellKey(app, 'Escape', 'Escape');
  await expect(pin).toHaveText(mac ? '⇧⌘S' : 'Ctrl+Shift+S');

  // the conversation pair records from one arrow
  const pair = win.getByTestId('shortcut-cap-nextConversation');
  await pair.click();
  await shellKey(app, 'ArrowRight', 'ArrowRight', cmd);
  await expect(pair).toHaveText(mac ? '⌘→ / ⌘←' : 'Ctrl+→ / Ctrl+←');
  await expect(win.getByTestId('shortcuts-reset-all')).toBeVisible();
  await win.keyboard.press('Escape');

  // inside a service page the new Home chord works and the old one is the page's
  await chord(app, 'E');
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await win.keyboard.press('Escape'); // Welcome's Escape leaves Home
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await chord(app, 'G');
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);

  // Reset all
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-shortcuts').click();
  await win.getByTestId('shortcuts-reset-all').click();
  await expect(home).toHaveText(mac ? '⇧⌘G' : 'Ctrl+Shift+G');
  await expect(pair).toHaveText(mac ? '⇧⌘] / ⇧⌘[' : 'Ctrl+Shift+] / Ctrl+Shift+[');
  await expect(win.getByTestId('shortcuts-reset-all')).toHaveCount(0);
  await app.close();
});

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

// the e2e boot hook gives zalo three direct unread and one Recent row (a
// conversation); telegram is where we start with nothing of its own in the
// list, so ⌘⇧] opens the newest row — zalo has no view yet, so the row
// resolves to plain activation and the tile still lands on zalo
test('shortcuts: ⌘/Ctrl ⇧ ] opens the most recent conversation, once', async () => {
  const { app, win } = await launch(
    makeProfile({ active: 'telegram', enabled: ['telegram', 'zalo'] }),
  );
  const rail = win.locator('[data-testid="rail"]');
  await expect(rail.locator('button[aria-label="Telegram"]')).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(rail.locator('button[aria-label="Zalo"]')).toContainText('3');
  await chord(app, '}', 'BracketRight');
  await expect(rail.locator('button[aria-label="Zalo"]')).toHaveAttribute('aria-current', 'page');
  // the zalo row is the only target and the walk's cursor already sits on it: nowhere to go
  await chord(app, '}', 'BracketRight');
  await expect(rail.locator('button[aria-label="Zalo"]')).toHaveAttribute('aria-current', 'page');
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
