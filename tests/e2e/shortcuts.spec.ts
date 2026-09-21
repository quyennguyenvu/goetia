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

// the e2e boot hook gives zalo three direct unread and one recents row (its
// conversation); telegram is where we start, and zalo has no view yet, so the
// row resolves to plain activation — the tile still lands on zalo
test('shortcuts: ⌘/Ctrl ⇧ ] jumps to the next unread conversation, once', async () => {
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
  // the zalo row is the only target and the cursor already sits on it: nowhere to go
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
