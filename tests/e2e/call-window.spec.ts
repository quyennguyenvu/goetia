import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

/** messenger alone summoned: its logged-out page is a stable, real document
 *  on the service origin, and messenger is the one service that declares
 *  call popups, so its blank window.open is admitted as the call guest */
function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-call-window-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'messenger',
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: true,
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

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return app;
}

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

const CALL_URL = 'https://www.facebook.com/groupcall/ROOM:goetia-e2e/';

/** Messenger's opener, as its bundle has it: a blank window first, the call
 *  URL assigned to it once resolved. */
const OPEN_CALL = `
  (() => {
    const w = window.open('about:blank');
    if (!w) return false;
    w.location = '${CALL_URL}';
    return true;
  })()
`;

type DiagEntry = { tag: string; line: string; serviceId?: string };

test('a call window whose page will not load is retried once, then closed, and the ring says so', async () => {
  const profile = makeProfile();
  const app = await launch(profile);
  await waitForService(app);

  // the call page is unreachable for this run: the adopted window's load
  // must fail the way a resolver hiccup fails it, deterministically
  await app.evaluate(({ session }, url) => {
    session
      .fromPartition('persist:messenger')
      .webRequest.onBeforeRequest({ urls: [`${url}*`] }, (_d, cb) => cb({ cancel: true }));
  }, CALL_URL);

  const visibleWindows = () =>
    app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length,
    );
  expect(await visibleWindows()).toBe(1);

  const opened = await app.evaluate(({ webContents }, js) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    return wc.executeJavaScript(js);
  }, OPEN_CALL);
  expect(opened).toBe(true);

  // the adopted window appears (the hidden guest never counts), then goes
  // once its retry has failed too
  await expect.poll(visibleWindows, { timeout: 10_000 }).toBe(2);
  await expect.poll(visibleWindows, { timeout: 15_000 }).toBe(1);

  // the ring is flushed on quit; both attempts left their line
  await app.close();
  const entries = JSON.parse(
    readFileSync(join(profile, 'diagnostics.json'), 'utf8'),
  ) as DiagEntry[];
  const lines = entries
    .filter((e) => e.tag === 'view' && e.serviceId === 'messenger')
    .map((e) => e.line);
  expect(lines).toEqual([
    expect.stringMatching(
      /^messenger call window load failed: -20 ERR_BLOCKED_BY_CLIENT, retrying · on /,
    ),
    expect.stringMatching(
      /^messenger call window load failed: -20 ERR_BLOCKED_BY_CLIENT, closed · on /,
    ),
  ]);
});

/** The guest facebook opens first and navigates later. Here it never
 *  navigates, which is exactly its state after any adopted call: alive,
 *  hidden, and the newest window in the process. */
const OPEN_GUEST = "Boolean(window.open('about:blank'))";

test('a dock activation after a call shows the shell, never the hidden call guest', async () => {
  const app = await launch(makeProfile());
  await waitForService(app);

  const opened = await app.evaluate(({ webContents }, js) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    return wc.executeJavaScript(js);
  }, OPEN_GUEST);
  expect(opened).toBe(true);

  const windows = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({ id: w.id, visible: w.isVisible() })),
    );
  await expect.poll(async () => (await windows()).length).toBe(2);
  const guestId = Math.max(...(await windows()).map((w) => w.id));
  const guestVisible = async () => (await windows()).find((w) => w.id === guestId)?.visible;
  const shellVisible = async () => (await windows()).find((w) => w.id !== guestId)?.visible;
  expect(await guestVisible()).toBe(false);

  // the Dock click, as macOS delivers it, with the shell on screen
  await app.evaluate(({ app }) => app.emit('activate'));
  await new Promise((r) => setTimeout(r, 400));
  expect(await guestVisible()).toBe(false);
  expect(await shellVisible()).toBe(true);

  // and with the shell away (close-to-tray), the same click brings the shell back
  await app.evaluate(
    ({ BrowserWindow }, id) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.id !== id)
        ?.hide(),
    guestId,
  );
  expect(await shellVisible()).toBe(false);
  await app.evaluate(({ app }) => app.emit('activate'));
  await expect.poll(shellVisible, { timeout: 5_000 }).toBe(true);
  expect(await guestVisible()).toBe(false);

  await app.close();
});
