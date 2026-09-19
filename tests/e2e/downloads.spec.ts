import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

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

test('a page download lands in the configured folder and de-duplicates', async () => {
  const { profile, downloads } = makeProfile();
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');

  // the Settings rows reflect the seeded block
  await win.getByTestId('settings-btn').click();
  await expect(win.getByTestId('downloads-mode')).toHaveValue('folder');
  await expect(win.getByText(downloads, { exact: true })).toBeVisible();
  await expect(win.getByTestId('downloads-choose')).toBeEnabled();
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

  await trigger();
  await expect
    .poll(() => existsSync(join(downloads, 'note (1).txt')), { timeout: 15_000 })
    .toBe(true);

  // last, since it points later downloads at the real OS folder: the reset
  // link shows only while a custom folder is set, and returns to the default
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('downloads-reset').click();
  await expect(win.getByText('Your Downloads folder', { exact: true })).toBeVisible();
  await expect(win.getByTestId('downloads-reset')).toHaveCount(0);
  expect(JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).downloads).toEqual({
    ask: false,
    dir: null,
  });

  await app.close();
});
