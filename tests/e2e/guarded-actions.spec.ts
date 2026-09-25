import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const PASSCODE = 'correct horse';
const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-guard-'));
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
      // Touch ID off so the run never waits on a prompt it cannot drive
      appLock: {
        enabled: false,
        touchId: false,
        guard: { summon: true, purge: true, downloads: true, passkeys: true },
      },
    }),
  );
  // one ended row for the Downloads pane; the file itself never existed, so
  // the row reads `missing` — still an ended row with a checkbox
  writeFileSync(
    join(profile, 'downloads.json'),
    JSON.stringify({
      downloads: [
        {
          id: 1,
          serviceId: 'zalo',
          filename: 'note.txt',
          path: join(profile, 'note.txt'),
          state: 'saved',
          received: 17,
          total: 17,
          at: Date.now(),
        },
      ],
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

/** Turning the lock on is what arms the guard — with no passcode stored there
 *  is nothing to ask for, so `actionGuarded` is false until this runs. */
async function armLock(win: Page) {
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('settings')).toHaveCount(0);
}

/** The pane relocks whenever it unmounts, so every visit passes the gate. */
async function openLockPane(win: Page) {
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-current-passcode').fill(PASSCODE);
  await win.getByTestId('lock-unlock').click();
  await expect(win.getByTestId('lock-unlocked')).toBeVisible();
}

/** After a wrong attempt the backoff is armed, and it is checked *before* the
 *  credential — so the next try is refused on time however correct it is.
 *  Wait it out and submit again, which is exactly what a person does. */
async function verifyAfterFailure(win: Page) {
  await win.getByTestId('credential-passcode').fill(PASSCODE);
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toContainText('Too many attempts');
  await expect(win.getByTestId('credential-passcode')).toBeEnabled({ timeout: 5000 });
  await win.getByTestId('credential-passcode').press('Enter');
}

test('banishing commits silently; summoning back asks for the passcode', async () => {
  const { app, win } = await launch(makeProfile());
  await armLock(win);

  await win.getByTestId('home-btn').click();
  const welcome = win.locator('[data-testid="welcome"]');
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');

  // hiding is the safe direction: a banish-only commit must never prompt
  await summoned.getByRole('button', { name: 'Zalo' }).click();
  await win.getByRole('button', { name: 'Banish 1 service' }).click();
  await expect(win.getByTestId('summon-confirm')).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(0);

  // bringing it back is the direction that exposes, so it asks
  await unbound.getByRole('button', { name: 'Zalo' }).click();
  await win.getByRole('button', { name: 'Summon 1 service' }).click();
  await expect(win.getByTestId('summon-confirm')).toBeVisible();

  // a wrong passcode leaves it banished
  await win.getByTestId('credential-passcode').fill('not the passcode');
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toHaveText('That is not your passcode.');
  await expect(win.getByTestId('summon-confirm')).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(0);

  // the right one commits the frame
  await verifyAfterFailure(win);
  await expect(win.getByTestId('summon-confirm')).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(1, { timeout: 30_000 });

  await app.close();
});

test('purging one login asks, and the confirm stays dead until the passcode passes', async () => {
  const { app, win } = await launch(makeProfile());
  await armLock(win);

  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-services').click();
  await win.getByTestId('purge-zalo').click();

  await expect(win.getByTestId('purge-confirm')).toBeVisible();
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();

  await win.getByTestId('credential-passcode').fill('not the passcode');
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toHaveText('That is not your passcode.');
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();

  await verifyAfterFailure(win);
  await expect(win.getByTestId('purge-confirm-btn')).toBeEnabled();

  await app.close();
});

test('the sweep asks too, and its acknowledgement is not enough on its own', async () => {
  const { app, win } = await launch(makeProfile());
  await armLock(win);

  await win.getByTestId('home-btn').click();
  await win.getByTestId('purge-all-btn').click();
  await expect(win.getByTestId('purge-confirm')).toBeVisible();

  // ticking the acknowledgement alone leaves it dead — the credential is a
  // second, independent condition
  await win.getByTestId('purge-ack').check();
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();

  await win.getByTestId('credential-passcode').fill(PASSCODE);
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('purge-confirm-btn')).toBeEnabled();

  await app.close();
});

test('a group switched off stops asking; the others still do; on again asks again', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);
  await armLock(win);

  await win.getByTestId('settings-btn').click();
  await openLockPane(win);
  await expect(win.getByTestId('lock-guard-rows')).toBeVisible();
  // click, not uncheck(): change() sets `busy` before the scrypt round trip
  // lands, so React re-renders the controlled box to its old prop value and
  // Playwright's immediate post-click assertion would see it still checked
  await win.getByTestId('lock-guard-downloads').click();
  await expect(win.getByTestId('lock-guard-downloads')).not.toBeChecked();
  await expect(win.getByTestId('lock-status')).toHaveText(
    'No longer asking before removing download history.',
  );
  await expect(win.getByTestId('lock-guard-purge')).toBeChecked();

  // the downloads group is off: Remove acts at once, with Undo and no card
  await win.getByTestId('settings-nav-downloads').click();
  const rows = win.getByTestId('download-row');
  await expect(rows).toHaveCount(1);
  await rows.first().getByTestId('download-select').check();
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toHaveCount(0);
  await expect(rows).toHaveCount(0);
  await expect(win.getByTestId('downloads-undo')).toContainText('1 file removed');
  await win.getByTestId('downloads-undo').getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(1);

  // the purge group is still on: the confirm stays dead without the credential
  await win.getByTestId('settings-nav-services').click();
  await win.getByTestId('purge-zalo').click();
  await expect(win.getByTestId('purge-confirm')).toBeVisible();
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('purge-confirm')).toHaveCount(0);

  // back on: Remove asks again
  await openLockPane(win);
  await win.getByTestId('lock-guard-downloads').click();
  await expect(win.getByTestId('lock-guard-downloads')).toBeChecked();
  await expect(win.getByTestId('lock-status')).toHaveText(
    'Asking before removing download history.',
  );
  await win.getByTestId('settings-nav-downloads').click();
  await rows.first().getByTestId('download-select').check();
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toBeVisible();
  await expect(rows).toHaveCount(1);

  // both switches are in the ring, and the record on disk has the new shape only
  await win.keyboard.press('Escape');
  await win.getByTestId('settings-nav-diagnostics').click();
  const diag = win.getByTestId('diag-row');
  await expect(diag.filter({ hasText: '[lock] configured: guard downloads off' })).toHaveCount(1);
  await expect(diag.filter({ hasText: '[lock] configured: guard downloads on' })).toHaveCount(1);
  await app.close();

  const appLock = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).appLock;
  expect(appLock.guard).toEqual({ summon: true, purge: true, downloads: true, passkeys: true });
  expect('guardActions' in appLock).toBe(false);
});
