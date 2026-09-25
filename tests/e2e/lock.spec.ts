import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const PASSCODE = 'correct horse';
const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');
const isService = (p: Page) => p.url().startsWith('https://');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-lock-'));
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
      // Touch ID off so the run never waits on a prompt that cannot be driven
      appLock: { enabled: false, touchId: false },
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
  return { app, win };
}

test('the lock screen gates the app at launch and the passcode opens it', async () => {
  const profile = makeProfile();

  // first run: turn the lock on through the pane, the only writer of lock.json
  const first = await launch(profile);
  await first.win.getByTestId('settings-btn').click();
  await first.win.getByTestId('settings-nav-lock').click();
  await first.win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await first.win.getByTestId('lock-enable').click();
  await expect(first.win.getByTestId('lock-status')).toHaveText('Lock on.');
  await first.app.close();

  // second run: it must come up locked
  const { app, win } = await launch(profile);
  await expect(win.getByTestId('lock-screen')).toBeVisible();

  // Touch ID is off in this profile, so there is only one door and therefore
  // nothing to choose between — the passcode field is the screen
  await expect(win.getByTestId('lock-choose-passcode')).toHaveCount(0);
  await expect(win.getByTestId('lock-passcode')).toBeVisible();

  // The view is kept warm on purpose — it is never *presented*. Ask main
  // rather than counting windows: a hidden WebContentsView is still a page.
  const anyViewVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].contentView.children.some((v) => v.getVisible()),
    );
  expect(await anyViewVisible()).toBe(false);

  const warm =
    app.windows().find(isService) ?? (await app.waitForEvent('window', { predicate: isService }));

  // a wrong passcode is refused
  await win.getByTestId('lock-passcode').fill('not the passcode');
  await win.getByTestId('lock-submit').click();
  await expect(win.getByTestId('lock-message')).toHaveText('That is not the passcode.');
  await expect(win.getByTestId('lock-screen')).toBeVisible();

  // the command gate: a chord that would put a service on screen does nothing
  await win.keyboard.press('Meta+1');
  await expect(win.getByTestId('lock-screen')).toBeVisible();
  expect(await anyViewVisible()).toBe(false);

  // the backoff is checked before the credential, so the first attempt after a
  // failure is refused on time even when the passcode is right
  await win.getByTestId('lock-passcode').fill(PASSCODE);
  await win.getByTestId('lock-submit').click();
  await expect(win.getByTestId('lock-message')).toContainText('Too many attempts');

  // the right passcode opens it once the backoff clears
  await expect(win.getByTestId('lock-submit')).toBeEnabled({ timeout: 5000 });
  await win.getByTestId('lock-submit').click();
  await expect(win.getByTestId('lock-screen')).toHaveCount(0);
  await expect.poll(anyViewVisible).toBe(true);

  // the same page object, so the view was hidden rather than destroyed and
  // rebuilt — unlocking costs no reload
  const after = app.windows().filter(isService);
  expect(after).toHaveLength(1);
  expect(after[0]).toBe(warm);

  await app.close();
});

test('Settings → Lock reveals its controls only after the passcode is accepted', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);

  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');

  // with a passcode set the pane is a gate, and nothing else exists yet
  await expect(win.getByTestId('lock-current-passcode')).toBeVisible();
  await expect(win.getByTestId('lock-disable')).toHaveCount(0);
  await expect(win.getByTestId('lock-change')).toHaveCount(0);
  await expect(win.getByTestId('lock-touchid-row')).toHaveCount(0);

  // a wrong passcode reveals nothing — the failure lands before any control
  // is reachable, not on a rejected write after one was clicked
  await win.getByTestId('lock-current-passcode').fill('not the passcode');
  await win.getByTestId('lock-unlock').click();
  await expect(win.getByTestId('lock-error')).toHaveText('That is not your passcode.');
  await expect(win.getByTestId('lock-disable')).toHaveCount(0);
  await expect(win.getByTestId('lock-change')).toHaveCount(0);

  // the right one reveals them
  await win.getByTestId('lock-current-passcode').fill(PASSCODE);
  await win.getByTestId('lock-unlock').click();
  await expect(win.getByTestId('lock-unlocked')).toBeVisible();
  await expect(win.getByTestId('lock-disable')).toBeVisible();
  await expect(win.getByTestId('lock-change')).toBeVisible();

  // leaving the pane re-locks it
  await win.getByTestId('settings-nav-general').click();
  await win.getByTestId('settings-nav-lock').click();
  await expect(win.getByTestId('lock-current-passcode')).toBeVisible();
  await expect(win.getByTestId('lock-disable')).toHaveCount(0);

  await app.close();
});

// The documented escape for a forgotten passcode, and the only one: removing
// lock.json. It is the sole recovery path, so it is tested like one.
test('removing lock.json recovers a forgotten passcode without touching anything else', async () => {
  const profile = makeProfile();

  const first = await launch(profile);
  await first.win.getByTestId('settings-btn').click();
  await first.win.getByTestId('settings-nav-lock').click();
  await first.win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await first.win.getByTestId('lock-enable').click();
  await expect(first.win.getByTestId('lock-status')).toHaveText('Lock on.');
  await first.app.close();

  const locked = await launch(profile);
  await expect(locked.win.getByTestId('lock-screen')).toBeVisible();
  await locked.app.close();

  // the passcode is forgotten; the user deletes the one file that holds it
  rmSync(join(profile, 'lock.json'));

  const recovered = await launch(profile);
  await expect(recovered.win.getByTestId('lock-screen')).toHaveCount(0);

  // settings.json still says the lock is on, but with no credential behind it
  // nothing engages — and the pane offers to set a new passcode rather than
  // stranding the user on a gate no passcode can pass
  await recovered.win.getByTestId('settings-btn').click();
  await recovered.win.getByTestId('settings-nav-lock').click();
  await expect(recovered.win.getByTestId('lock-setup')).toBeVisible();
  await expect(recovered.win.getByTestId('lock-current-passcode')).toHaveCount(0);

  // and the profile is otherwise intact: the remembered service still loads
  const service =
    recovered.app.windows().find(isService) ??
    (await recovered.app.waitForEvent('window', { predicate: isService }));
  expect(service.url()).toContain('zalo');

  await recovered.app.close();
});

test('settings:update cannot switch the lock off — lock:configure is its only writer', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');

  // what the shell's own console could send: a patch that carries appLock
  await win.evaluate(() => {
    (window as unknown as { goetia: { send(c: string, p: unknown): void } }).goetia.send(
      'settings:update',
      {
        appLock: {
          enabled: false,
          touchId: false,
          guard: { summon: false, purge: false, downloads: false, passkeys: false },
        },
      },
    );
  });
  await win.getByTestId('settings-nav-diagnostics').click();
  await expect(
    win
      .getByTestId('diag-row')
      .filter({ hasText: '[ipc] settings:update carried appLock; dropped' }),
  ).toHaveCount(1);
  await app.close();

  expect(JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).appLock).toMatchObject({
    enabled: true,
    guard: { summon: true, purge: true, downloads: true, passkeys: true },
  });
  // and the next launch comes up locked
  const again = await launch(profile);
  await expect(again.win.getByTestId('lock-screen')).toBeVisible();
  await again.app.close();
});
