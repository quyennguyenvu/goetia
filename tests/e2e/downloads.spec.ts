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
      // Touch ID off so the guard test never waits on a prompt it cannot drive
      appLock: {
        enabled: false,
        touchId: false,
        guard: { summon: true, purge: true, downloads: true, passkeys: true },
      },
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

const PASSCODE = 'correct horse';

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** the service view's document exists and has finished loading */
async function waitForService(app: ElectronApplication) {
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
}

const trigger = (app: ElectronApplication) =>
  app.evaluate(({ webContents }, js) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    return wc.executeJavaScript(js);
  }, BLOB_DOWNLOAD);

async function openPane(win: Page) {
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
}

/** Turning the lock on is what arms the guard (guarded-actions.spec's helper). */
async function armLock(win: Page) {
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('settings')).toHaveCount(0);
}

/** After a wrong attempt the backoff is checked before the credential: wait
 *  it out and submit again, which is exactly what a person does. */
async function verifyAfterFailure(win: Page) {
  await win.getByTestId('credential-passcode').fill(PASSCODE);
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toContainText('Too many attempts');
  await expect(win.getByTestId('credential-passcode')).toBeEnabled({ timeout: 5000 });
  await win.getByTestId('credential-passcode').press('Enter');
}

test('a page download lands in the configured folder and de-duplicates', async () => {
  const { profile, downloads } = makeProfile();
  const { app, win } = await launch(profile);

  // the Settings rows now live on their own pane, and the list starts empty
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
  await expect(win.getByTestId('downloads-mode')).toHaveValue('folder');
  await expect(win.getByText(downloads, { exact: true })).toBeVisible();
  await expect(win.getByTestId('downloads-choose')).toBeEnabled();
  await expect(win.getByTestId('downloads-empty')).toContainText(`land in ${downloads}`);
  await win.keyboard.press('Escape');

  // wait for the service view's document to exist before scripting it
  await waitForService(app);

  await trigger(app);
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

  await trigger(app);
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

test('history survives a relaunch, rows leave with Undo, and the guard asks once the lock is on', async () => {
  const { profile, downloads } = makeProfile();
  const first = await launch(profile);
  await waitForService(first.app);
  await trigger(first.app);
  await expect.poll(() => existsSync(join(downloads, 'note.txt')), { timeout: 15_000 }).toBe(true);
  await trigger(first.app);
  await expect
    .poll(() => existsSync(join(downloads, 'note (1).txt')), { timeout: 15_000 })
    .toBe(true);
  // the file can exist before Chromium reports done, and the row is written
  // at done: wait for both rows to read saved before the app goes away
  await openPane(first.win);
  const firstRows = first.win.getByTestId('download-row');
  await expect(firstRows).toHaveCount(2);
  await expect(firstRows.nth(0)).toHaveAttribute('data-state', 'saved');
  await expect(firstRows.nth(1)).toHaveAttribute('data-state', 'saved');
  await first.app.close();

  // sealed at rest: the names are not in the file in clear
  const atRest = readFileSync(join(profile, 'downloads.json'), 'utf8');
  expect(atRest).toContain('"sealed"');
  expect(atRest).not.toContain('note.txt');

  // a file deleted between launches reads as gone, and both rows came back
  rmSync(join(downloads, 'note.txt'));
  const { app, win } = await launch(profile);
  await openPane(win);
  const rows = win.getByTestId('download-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('note (1).txt');
  await expect(rows.nth(1)).toHaveAttribute('data-state', 'missing');
  await expect(win.getByTestId('downloads-band')).toHaveCount(0);

  // the search narrows the rows and the header count; Escape clears it
  const search = win.getByTestId('downloads-search');
  await search.fill('note (1');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('note (1).txt');
  await expect(win.getByText('History · 1 of 2 files')).toBeVisible();
  await expect(win.getByTestId('downloads-remove-shown')).toContainText('Remove 1 file shown');
  await search.press('Escape');
  await expect(rows).toHaveCount(2);
  await expect(win.getByTestId('settings')).toBeVisible();

  // no lock yet: Remove acts at once, and Undo brings the row back
  await rows.nth(1).getByTestId('download-select').check();
  await expect(win.getByTestId('downloads-selection')).toContainText('1 selected');
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(win.getByTestId('downloads-undo')).toContainText('1 file removed');
  await expect(win.getByTestId('downloads-undo').getByTestId('toast-drain')).toHaveCount(1);
  // Clear all… sits beside the Undo, so it never waits out the 8 s
  await expect(win.getByTestId('downloads-clear')).toBeVisible();
  await win.getByTestId('downloads-undo').getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(2);

  // Clear all empties the list
  await win.getByTestId('downloads-clear').click();
  await expect(rows).toHaveCount(0);
  await expect(win.getByTestId('downloads-empty')).toBeVisible();
  await win.keyboard.press('Escape');

  // arm the lock: the guard now stands in front of Remove
  await armLock(win);
  await waitForService(app);
  await trigger(app);
  await expect.poll(() => existsSync(join(downloads, 'note.txt')), { timeout: 15_000 }).toBe(true);
  await openPane(win);
  await expect(rows).toHaveCount(1);
  await rows.first().getByTestId('download-select').check();
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toBeVisible();

  // a wrong passcode leaves the row; the right one removes it
  await win.getByTestId('credential-passcode').fill('not the passcode');
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toHaveText('That is not your passcode.');
  await expect(rows).toHaveCount(1);
  await verifyAfterFailure(win);
  await expect(rows).toHaveCount(0);

  // the removals are in the ring, as counts: one before the lock, one after.
  // The consent the second one spent is not — a grant is not evidence
  await win.getByTestId('settings-nav-diagnostics').click();
  const diag = win.getByTestId('diag-row');
  await expect(diag.filter({ hasText: '[downloads] history: removed 1 rows' })).toHaveCount(2);
  await expect(diag.filter({ hasText: '[downloads] history cleared (2 rows)' })).toHaveCount(1);
  await expect(diag.filter({ hasText: 'authorized' })).toHaveCount(0);
  await expect(diag.filter({ hasText: 'consent granted' })).toHaveCount(0);
  await expect(diag.filter({ hasText: 'note.txt' })).toHaveCount(0);

  await app.close();
});
