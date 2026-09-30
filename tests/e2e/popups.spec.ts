import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

/** zalo alone summoned: its logged-out page is a stable, real document */
function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-popups-'));
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

const LINK = 'https://example.com/goetia-e2e-link';

/** Zalo's link opener, as its bundle has it (2026-09-30): a blank window
 *  first, the URL assigned to it after — three clicks in a row. */
const ZALO_OPEN_LINKS = `
  (() => {
    const handles = [0, 1, 2].map((i) => {
      const w = window.open();
      if (!w) return false;
      w.opener = null;
      w.location = '${LINK}?n=' + i;
      setTimeout(() => w.close(), 200);
      return true;
    });
    return handles.every(Boolean);
  })()
`;

type Stash = { __goetiaOpened?: string[] };

test('a link Zalo opens blank-then-assign reaches the OS browser once, with no window', async () => {
  const app = await launch(makeProfile());
  await waitForService(app);

  // stand in for the OS browser: the spec must never open a real one
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as Stash).__goetiaOpened = opened;
    shell.openExternal = async (url: string) => {
      opened.push(url);
    };
  });
  const windows = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const baseline = await windows();

  const ok = await app.evaluate(({ webContents }, js) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    return wc.executeJavaScript(js);
  }, ZALO_OPEN_LINKS);
  // a null handle is what made Zalo toast "Có lỗi xảy ra khi mở popup mới"
  expect(ok).toBe(true);
  // read before Zalo's own 200ms close: the handle is a stand-in, never a window
  expect(await windows()).toBe(baseline);

  // the burst reached the browser once: the popup throttle still holds
  await expect
    .poll(() => app.evaluate(() => (globalThis as Stash).__goetiaOpened?.length), {
      timeout: 10_000,
    })
    .toBe(1);
  await new Promise((r) => setTimeout(r, 1_500)); // past the throttle window
  const opened = await app.evaluate(() => (globalThis as Stash).__goetiaOpened);
  expect(opened).toEqual([`${LINK}?n=0`]);
  expect(await windows()).toBe(baseline);

  await app.close();
});
