import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

// The same two services home.spec drags, deliberately. Every extra enabled
// service is another real site loading in a real view, and three of them
// (discord and slack especially) made app.close() race the reorder's write
// often enough to hang teardown. The permutation arithmetic is covered by
// applySubsetOrder's unit tests; what these two need is the wiring.
const TWO_ENABLED = {
  discord: true,
  instagram: true,
  messenger: false,
  shopee: true,
  slack: true,
  telegram: true,
  tiktok: true,
  whatsapp: true,
  zalo: false,
};

/** A profile that survives between launches — the quit-and-reopen loop needs
 *  the same userData directory twice. */
function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify({ disabled: TWO_ENABLED }));
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

const railOrder = (win: Page) =>
  win
    .locator('[data-testid="service-tile"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));

/** Home's tiles animate into place when the board opens — measure only once
 *  the geometry settles, or the drag grabs where a tile used to be. */
async function stableBox(win: Page, selector: string) {
  const tile = win.locator(selector);
  let prev = await tile.boundingBox();
  for (let i = 0; i < 20; i++) {
    await win.waitForTimeout(100);
    const next = await tile.boundingBox();
    if (prev && next && prev.x === next.x && prev.y === next.y) return next;
    prev = next;
  }
  throw new Error(`tile ${selector} never settled`);
}

/** Motion needs real intermediate moves to cross its drag threshold and to
 *  register the crossing — a single jump from source to target does neither. */
async function drag(win: Page, source: string, target: string) {
  const a = await stableBox(win, source);
  const b = await stableBox(win, target);
  await win.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await win.mouse.down();
  await win.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 4 });
  await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await win.mouse.up();
}

// home.spec.ts already covers "a drop stages the order for the confirm". What
// is only testable here is that the committed order actually reached settings
// and survives a restart.
test('reorder: a committed Home drag persists across a restart', async () => {
  const profile = makeProfile();
  const first = await launch(profile);

  // the catalog ships in name order, so the two enabled services start here
  await expect(first.win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  expect(await railOrder(first.win)).toEqual(['Messenger', 'Zalo']);

  await first.win.locator('[data-testid="home-btn"]').click();
  await expect(first.win.locator('[data-testid="welcome"]')).toBeVisible();

  await drag(
    first.win,
    '[data-testid="pick-tile"][title="Zalo"]',
    '[data-testid="pick-tile"][title="Messenger"]',
  );

  // the drag must not have toggled the service it dragged — pointer drag does
  // not suppress the trailing click the way HTML5 DnD did. Banishing moves a
  // tile out of Summoned, so "still summoned" is the check.
  const summoned = first.win.locator('[data-testid="welcome-section-summoned"]');
  await expect(summoned.getByRole('button', { name: 'Zalo' })).toBeVisible();

  // the drop is staged; the commit is what writes settings
  const confirm = first.win.getByRole('button', { name: 'Apply new order' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(() => railOrder(first.win)).toEqual(['Zalo', 'Messenger']);
  await expect(first.win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  expect(await railOrder(second.win)).toEqual(['Zalo', 'Messenger']);
  await second.app.close();
});

test('reorder: a rail drag reorders without activating the tile it dragged', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);

  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  expect(await railOrder(win)).toEqual(['Messenger', 'Zalo']);

  // a cold start opens the first enabled service
  const active = '[data-testid="service-tile"][aria-current="page"]';
  await expect(win.locator(active)).toHaveAttribute('aria-label', 'Messenger');

  await drag(
    win,
    '[data-testid="service-tile"][aria-label="Zalo"]',
    '[data-testid="service-tile"][aria-label="Messenger"]',
  );

  await expect.poll(() => railOrder(win)).toEqual(['Zalo', 'Messenger']);
  // Zalo was dragged, not clicked: activation must not have followed it
  await expect(win.locator(active)).toHaveAttribute('aria-label', 'Messenger');

  await app.close();
});
