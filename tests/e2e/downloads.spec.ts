import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** zalo alone summoned (its logged-out page is a stable, real document);
 *  downloads pointed at a folder inside the profile so nothing touches the
 *  machine's real Downloads. */
function makeProfile(): { profile: string; downloads: string } {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-downloads-'));
  const downloads = join(profile, 'saved');
  mkdirSync(downloads);
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
      downloads: { ask: false, dir: downloads },
    }),
  );
  return { profile, downloads };
}

/** Start a download from inside the service page the way a chat's "save"
 *  button does: an anchor with `download` on a blob URL, clicked. */
const BLOB_DOWNLOAD = `
  (() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['hello from goetia'], { type: 'text/plain' }));
    a.download = 'note.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  })()
`;

/** ⌘⇧<key> arriving at the service view's before-input-event — CDP keys bypass
 *  it, so the event is emitted on the webContents (shortcuts.spec's technique). */
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

test('a page download lands in the configured folder and de-duplicates', async () => {
  const { profile, downloads } = makeProfile();
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');

  // the Settings rows now live on their own pane, and the list starts empty
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
  await expect(win.getByTestId('downloads-mode')).toHaveValue('folder');
  await expect(win.getByText(downloads, { exact: true })).toBeVisible();
  await expect(win.getByTestId('downloads-choose')).toBeEnabled();
  await expect(win.getByTestId('downloads-empty')).toContainText(`land in ${downloads}`);
  await win.keyboard.press('Escape');

  // wait for the service view's document to exist before scripting it
  await expect
    .poll(
      () =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((w) => w.getURL().startsWith('https://') && !w.isLoading()),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  const trigger = () =>
    app.evaluate(({ webContents }, js) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
      if (!wc) throw new Error('no service view');
      return wc.executeJavaScript(js);
    }, BLOB_DOWNLOAD);

  await trigger();
  await expect.poll(() => existsSync(join(downloads, 'note.txt')), { timeout: 15_000 }).toBe(true);
  expect(readFileSync(join(downloads, 'note.txt'), 'utf8')).toBe('hello from goetia');

  // one row, saved, with the reveal action; nothing else on it
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
  const rows = win.getByTestId('download-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('note.txt');
  await expect(rows.first()).toHaveAttribute('data-state', 'saved');
  await expect(rows.first().getByTestId('download-reveal')).toBeVisible();
  await win.keyboard.press('Escape');

  await trigger();
  await expect
    .poll(() => existsSync(join(downloads, 'note (1).txt')), { timeout: 15_000 })
    .toBe(true);

  // ⌘⇧D opens Settings on the pane; the list is newest first, and a file
  // deleted behind Goetia's back reads as gone rather than offering a reveal
  rmSync(join(downloads, 'note.txt'));
  await chord(app, 'D');
  await expect(win.getByTestId('settings-nav-downloads')).toHaveAttribute('aria-current', 'page');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('note (1).txt');
  await expect(rows.nth(1)).toContainText('note.txt');
  await expect(rows.nth(1)).toContainText('moved or deleted since');
  await expect(rows.nth(1)).toHaveAttribute('data-state', 'missing');
  await expect(rows.nth(1).getByTestId('download-reveal')).toHaveCount(0);
  await win.keyboard.press('Escape');

  // last, since it points later downloads at the real OS folder: the reset
  // link shows only while a custom folder is set, and returns to the default
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
  await win.getByTestId('downloads-reset').click();
  await expect(win.getByText('Your Downloads folder', { exact: true })).toBeVisible();
  await expect(win.getByTestId('downloads-reset')).toHaveCount(0);
  expect(JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).downloads).toEqual({
    ask: false,
    dir: null,
  });

  await app.close();
});
