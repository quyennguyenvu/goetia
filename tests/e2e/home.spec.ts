import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { SERVICES } from '../../src/shared/services';

/** the launch profile below enables messenger + zalo; the rest stay unbound */
const UNBOUND = SERVICES.length - 2;

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
      },
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('home: sigil toggles welcome and seeds the live selection', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');
  const home = win.locator('[data-testid="home-btn"]');

  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await expect(welcome).toHaveCount(0);

  await home.click();
  await expect(welcome).toBeVisible();
  // seeded: the two enabled services arrive already selected, so the confirm
  // button has nothing to do
  await expect(welcome.getByRole('button', { name: 'Messenger' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(welcome.getByRole('button', { name: 'Telegram' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  // toggling back off returns to the service
  await home.click();
  await expect(welcome).toHaveCount(0);
  await app.close();
});

test('home: banishing the active service leaves welcome on screen', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  await win.locator('[data-testid="home-btn"]').click();
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await summoned.getByRole('button', { name: 'Messenger' }).click();

  // the board is the edit: the tile flies back to its name slot in Unbound,
  // but nothing is committed yet — the rail behind Home still shows both
  await expect(unbound.getByRole('button', { name: 'Messenger' })).toBeVisible();
  await expect(summoned.getByRole('button', { name: 'Messenger' })).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);

  const confirm = win.getByRole('button', { name: 'Banish 1 service' });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // the regression this whole plan exists for: no service view may take over
  await expect(welcome).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(1);
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await expect(unbound.getByRole('button', { name: 'Messenger' })).toBeVisible();
  await app.close();
});

test('home: Discard abandons a staged edit without leaving the screen', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');
  const discard = win.getByRole('button', { name: 'Discard' });

  await win.locator('[data-testid="home-btn"]').click();

  // nothing staged: the hero shows one inert button and no Discard at all
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await expect(discard).toHaveCount(0);

  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await summoned.getByRole('button', { name: 'Messenger' }).click();
  await unbound.getByRole('button', { name: 'Telegram' }).click();
  // both tiles changed section on the spot, staged only
  await expect(unbound.getByRole('button', { name: 'Messenger' })).toBeVisible();
  await expect(summoned.getByRole('button', { name: 'Telegram' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'Summon 1 · Banish 1' })).toBeEnabled();
  await expect(discard).toBeVisible();

  await discard.click();

  // back to the live set, still on Home, nothing persisted
  await expect(welcome).toBeVisible();
  await expect(summoned.getByRole('button', { name: 'Messenger' })).toBeVisible();
  await expect(unbound.getByRole('button', { name: 'Telegram' })).toBeVisible();
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await expect(discard).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await app.close();
});

test('home: the ninth pick caps the rest, unpicking frees them', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await win.locator('[data-testid="home-btn"]').click();
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');

  // stage seven more on top of the two seeded picks → nine staged
  const seven = [
    'Discord',
    'Instagram',
    'Microsoft Teams',
    'Shopee',
    'Slack',
    'Telegram',
    'TikTok',
  ];
  for (const name of seven) {
    await unbound.getByRole('button', { name }).click();
  }
  await expect(summoned.locator('[data-testid="pick-tile"]')).toHaveCount(9);

  // the tenth tile goes inert: dimmed, aria-disabled, click does nothing.
  // force: Playwright itself refuses to click an aria-disabled control
  const whatsapp = unbound.getByRole('button', { name: 'WhatsApp' });
  await expect(whatsapp).toHaveAttribute('aria-disabled', 'true');
  await whatsapp.click({ force: true });
  await expect(summoned.locator('[data-testid="pick-tile"]')).toHaveCount(9);
  await expect(unbound).toContainText('unpick a summoned tile to make room');

  // clicking a summoned tile frees its slot within the same edit
  await summoned.getByRole('button', { name: 'Telegram' }).click();
  await expect(whatsapp).toHaveAttribute('aria-disabled', 'false');
  await whatsapp.click();
  await expect(summoned.getByRole('button', { name: 'WhatsApp' })).toBeVisible();

  await app.close();
});

test('home: search filters unbound, and Escape clears it before leaving', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await win.locator('[data-testid="home-btn"]').click();
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  const tiles = unbound.locator('[data-testid="pick-tile"]');
  await expect(tiles).toHaveCount(UNBOUND);

  const search = unbound.getByRole('textbox', { name: 'Search unbound services' });
  await search.fill('sho');
  await expect(tiles).toHaveCount(1);
  await expect(unbound.getByRole('button', { name: 'Shopee' })).toBeVisible();

  // substring, not fuzzy: "tg" is a subsequence of Instagram but not a substring
  await search.fill('tg');
  await expect(tiles).toHaveCount(0);
  await expect(unbound).toContainText('No service matches');

  // first Escape clears the query and stays on Home
  await search.press('Escape');
  await expect(tiles).toHaveCount(UNBOUND);
  await expect(welcome).toBeVisible();

  // second Escape leaves
  await win.keyboard.press('Escape');
  await expect(welcome).toHaveCount(0);

  await app.close();
});

test('home: ⌘/Ctrl+F focuses the unbound search', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await win.locator('[data-testid="home-btn"]').click();
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  const search = unbound.getByRole('textbox', { name: 'Search unbound services' });
  await expect(search).not.toBeFocused();

  await win.keyboard.press('ControlOrMeta+f');
  await expect(search).toBeFocused();

  // and it types straight into the filter
  await win.keyboard.type('tele');
  await expect(unbound.locator('[data-testid="pick-tile"]')).toHaveCount(1);

  await app.close();
});

test('home: reordering summoned tiles is staged until the confirm applies it', async () => {
  const { app, win } = await launch();
  const railTiles = win.locator('[data-testid="service-tile"]');
  const railOrder = () =>
    railTiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

  // evaluateAll resolves against whatever matches right now, so wait for the
  // rail to render before reading an order out of it
  await expect(railTiles).toHaveCount(2);
  expect(await railOrder()).toEqual(['Messenger', 'Zalo']);

  await win.locator('[data-testid="home-btn"]').click();
  const summoned = win.locator('[data-testid="welcome-section-summoned"]');
  // the tiles animate into place when Home opens — measure only once their
  // geometry has settled, or the drag grabs where a tile used to be
  const stableBox = async (name: string) => {
    const tile = summoned.getByRole('button', { name });
    let prev = await tile.boundingBox();
    for (let i = 0; i < 20; i++) {
      await win.waitForTimeout(100);
      const next = await tile.boundingBox();
      if (prev && next && prev.x === next.x && prev.y === next.y) return next;
      prev = next;
    }
    throw new Error(`tile ${name} never settled`);
  };
  // stepped drag, not dragTo: Motion tracks crossings from pointermove
  // events, and dragTo jumps to the target in a single move
  const zalo = await stableBox('Zalo');
  const target = await stableBox('Messenger');
  await win.mouse.move(zalo.x + zalo.width / 2, zalo.y + zalo.height / 2);
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await win.mouse.move(
      zalo.x + zalo.width / 2 + ((target.x - zalo.x) * i) / 10,
      zalo.y + zalo.height / 2,
    );
    await win.waitForTimeout(30);
  }
  await win.mouse.up();

  // the drop stages the order; the rail behind Home does not move yet
  const confirm = win.getByRole('button', { name: 'Apply new order' });
  await expect(confirm).toBeEnabled();
  expect(await railOrder()).toEqual(['Messenger', 'Zalo']);

  await confirm.click();

  // the commit is what reorders the rail, in the same patch as any summon
  await expect(async () => {
    expect(await railOrder()).toEqual(['Zalo', 'Messenger']);
  }).toPass();
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  await app.close();
});

test('settings: composition is gone, Manage services… lands on home', async () => {
  const { app, win } = await launch();

  await win.locator('[data-testid="settings-btn"]').click();
  await win.locator('[data-testid="settings-nav-services"]').click();

  const pane = win.locator('[data-testid="settings"]');
  await expect(pane.getByText('enabled')).toHaveCount(0);
  // only the two enabled services are listed
  await expect(pane.getByText('never hibernate')).toHaveCount(2);

  await win.locator('[data-testid="manage-services"]').click();
  await expect(pane).toHaveCount(0);
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await app.close();
});
