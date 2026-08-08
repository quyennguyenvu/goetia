/**
 * Regenerates the README screenshots in docs/media.
 *
 * Each shot launches the real app against a fresh throwaway profile, so no
 * account is ever signed in and nothing private can be in frame. Only the
 * shell renderer and the loading overlay are captured — service views are
 * separate webContents, so a third-party page cannot leak into a shot.
 *
 * Deliberately not a tests/e2e spec: CI runs that directory, and CI must not
 * repaint committed assets.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import { SHOTS, settingsFor } from './lib/shots.mjs';

const OUT = 'docs/media';

// 'device' keeps Retina crispness. Flip to 'css' if docs/media outgrows its
// 1.5 MB budget — it halves the pixel dimensions on a HiDPI display.
const SCALE = 'device';

const isShell = (p) => p.url().startsWith('file://') && !p.url().includes('loading.html');
const isOverlay = (p) => p.url().includes('loading.html');

/**
 * Padded union bounding box of every element matching `selectors`, clamped to
 * the viewport. Both boundingBox() and screenshot({ clip }) work in CSS
 * pixels, so these compose directly.
 */
async function clipAround(page, selectors, pad = 24) {
  const boxes = [];
  for (const sel of selectors) {
    for (const el of await page.locator(sel).all()) {
      const box = await el.boundingBox();
      if (box) boxes.push(box);
    }
  }
  if (boxes.length === 0) throw new Error(`nothing to clip: ${selectors.join(', ')}`);

  const view = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(view.w, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(view.h, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * One entry per surface. Each prepares the app and returns a function that
 * writes the PNG, so a surface can choose an element shot or a clipped page
 * shot as suits it.
 */
const SURFACES = {
  async welcome({ win }) {
    const welcome = win.locator('[data-testid="welcome"]');
    await welcome.waitFor();
    // pick a few so the confirm button is live rather than a greyed "Summon 0"
    for (const name of ['Telegram', 'WhatsApp', 'Zalo']) {
      await welcome.getByRole('button', { name, exact: true }).click();
    }
    await win.waitForTimeout(200);
    // the welcome pane is full-bleed; frame its content, not the empty margins
    const clip = await clipAround(win, ['[data-testid="welcome"] > *'], 40);
    return (path) => win.screenshot({ path, clip, scale: SCALE });
  },

  async rail({ win }) {
    const rail = win.locator('[data-testid="rail"]');
    await rail.waitFor();

    // --goetia-e2e injects unread 3 on zalo at ~1.5s. It persists because the
    // seeded profile turns neverHibernate off, so zalo has no view and no
    // runner to report {0,0} over it (see settingsFor).
    //
    // Full rail height, but only as wide as the tiles: the rail spans the
    // window, and the empty middle makes an unreadable sliver.
    const bar = await rail.boundingBox();
    const tiles = await clipAround(win, ['[data-testid="rail"] button[aria-label]'], 12);
    const clip = { x: 0, y: bar.y, width: tiles.x + tiles.width, height: bar.height };

    await rail.getByText('3', { exact: true }).waitFor({ timeout: 20_000 });
    return (path) => win.screenshot({ path, clip, scale: SCALE });
  },

  async switcher({ win }) {
    await win.locator('[data-testid="rail"]').waitFor();
    // same channel the ⌘K accelerator sends; menu accelerators do not reach
    // the page from Playwright's keyboard
    await win.evaluate(() => window.goetia.send('switcher:setOpen', { open: true }));
    const switcher = win.locator('[data-testid="switcher"]');
    await switcher.waitFor();
    // 's' matches Messenger, WhatsApp, Discord, Shopee — enough to show the
    // filtering actually filtering
    await switcher.locator('input').fill('s');
    await win.waitForTimeout(150);
    return (path) => switcher.screenshot({ path, scale: SCALE });
  },

  async settings({ win }) {
    await win.locator('[data-testid="settings-btn"]').click();
    await win.locator('[data-testid="settings"]').waitFor();
    // Appearance carries theme + menu position; General is nearly empty
    await win.locator('[data-testid="settings-nav-appearance"]').click();
    // the testid is on the full-screen backdrop — shoot the modal card inside
    const card = win.locator('[data-testid="settings"] > div');
    await card.waitFor();
    await win.waitForTimeout(250);
    // the card is a fixed 540px tall and its lower half is empty; crop just
    // below the last nav item, which sits deeper than the settings rows
    const box = await card.boundingBox();
    const lastNav = await win.locator('[data-testid="settings-nav-updates"]').boundingBox();
    const clip = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: lastNav.y + lastNav.height + 28 - box.y,
    };
    return (path) => win.screenshot({ path, clip, scale: SCALE });
  },

  async waking({ app }) {
    const overlay =
      app.windows().find(isOverlay) ??
      (await app.waitForEvent('window', { predicate: isOverlay, timeout: 15_000 }));
    await overlay.waitForLoadState('domcontentloaded');
    // the app honours reduced-motion, which parks the ring and embers instead
    // of catching them mid-sweep — a still frame, and the same one every run
    await overlay.emulateMedia({ reducedMotion: 'reduce' });
    await overlay.waitForTimeout(400);
    // clip to the drawn ring, not the <svg class="portal"> element — its box is
    // far larger than the artwork inside it
    const clip = await clipAround(overlay, ['.ring', '.core', '.caption'], 40);
    return (path) => overlay.screenshot({ path, clip, scale: SCALE });
  },
};

async function capture(shot) {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-media-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify(settingsFor(shot), null, 2));

  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));

  // Committed assets should not churn on every regeneration. The shell's
  // ember portal animates, so without this the same shot differs byte-wise
  // run to run; the app's reduced-motion override parks it on a still frame.
  await win.emulateMedia({ reducedMotion: 'reduce' });

  // the renderer stamps the effective theme on <html>; wait for it so a shot
  // can never be captured mid-swap
  await win.waitForFunction(
    (theme) => document.documentElement.dataset.theme === theme,
    shot.theme,
  );

  const file = join(OUT, `${shot.stem}-${shot.theme}.png`);
  try {
    const shoot = await SURFACES[shot.surface]({ app, win });
    await shoot(file);
    console.log(`✓ ${file}`);
  } finally {
    await app.close();
  }
}

mkdirSync(OUT, { recursive: true });
for (const shot of SHOTS) {
  await capture(shot);
}
console.log(`\n${SHOTS.length} shots written to ${OUT}/`);
