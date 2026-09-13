// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clampText, PIN_CONVERSATION_MAX } from '../../src/main/lib/pin-rules';
import shopee, {
  openShopeeConversation,
  shopeeConversation,
} from '../../src/preload/recipes/shopee';
import { SERVICES } from '../../src/shared/services';

// the fixture mirrors the expanded shopee.vn mini-chat (2026-09-13 dump); the
// open conversation is "lego2shop", the list has five rows, and one row's
// preview names the shop whose own row sits below it
const PAGE = readFileSync(join(__dirname, '../fixtures/shopee-chat.html'), 'utf8');

type Rect = { x: number; y: number; width: number; height: number };
const rect = (r: Rect) => () => ({
  ...r,
  top: r.y,
  left: r.x,
  right: r.x + r.width,
  bottom: r.y + r.height,
});

const ROW = 64;
const PANE = 400;

/** lay the list out: 224px wide from y=80, each row 64px tall */
function layout(): HTMLElement[] {
  const grid = listGrid();
  grid.getBoundingClientRect = rect({ x: 0, y: 80, width: 224, height: PANE }) as never;
  const rows = [...grid.querySelectorAll<HTMLElement>('[role="rowgroup"] > div')];
  rows.forEach((row, i) => {
    row.getBoundingClientRect = rect({ x: 0, y: 80 + i * ROW, width: 224, height: ROW }) as never;
  });
  return rows;
}

function listGrid(): HTMLElement {
  // the list pane's grid is the one under the search box, not the messages'
  const grid = document
    .querySelector('.shopee-react-input')
    ?.closest('#shopee-mini-chat-embedded > div > div > div')
    ?.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error('no list grid');
  return grid;
}

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

describe('shopeeConversation', () => {
  it('reads the open conversation from the chat header dropdown', () => {
    expect(shopeeConversation(document)).toBe('lego2shop');
  });

  it('never reads the list filter dropdown ("All") for it', () => {
    document.querySelectorAll('.shopee-react-dropdown')[1]?.remove();
    expect(shopeeConversation(document)).toBeNull();
  });

  it('is null while the mini-chat is collapsed or absent', () => {
    document.querySelector('#shopee-mini-chat-embedded > div > div:nth-child(2)')?.remove();
    expect(shopeeConversation(document)).toBeNull();
    document.querySelector('#shopee-mini-chat-embedded')?.remove();
    expect(shopeeConversation(document)).toBeNull();
  });
});

describe('openShopeeConversation', () => {
  it("answers the named row's centre for main to click — Shopee ignores synthetic clicks", async () => {
    layout();
    // row 1 spans y 144..208
    await expect(openShopeeConversation(document, 'mayhome89')).resolves.toEqual({
      x: 112,
      y: 176,
    });
  });

  it('matches a long shop name against its clamped pin label', async () => {
    layout();
    const long = `Chatu Baby - Ăn Dặm Cùng Bé - ${'Chi Nhánh Miền Nam Chuyên Đồ Sơ Sinh '.repeat(4)}`;
    const pinned = clampText(long, PIN_CONVERSATION_MAX);
    expect(pinned.endsWith('…')).toBe(true);
    const row = layout()[3];
    row.querySelector('div[title]')?.setAttribute('title', long);
    await expect(openShopeeConversation(document, pinned)).resolves.toEqual({ x: 112, y: 304 });
  });

  it('never matches a message preview, only the row title', async () => {
    layout();
    // "gl_anhduc" is also the preview of Chatu Baby's row (index 3, y 272..336),
    // which sits above gl_anhduc's own row (index 4, y 336..400)
    await expect(openShopeeConversation(document, 'gl_anhduc')).resolves.toEqual({
      x: 112,
      y: 368,
    });
    await expect(openShopeeConversation(document, 'dạ chọn phân loại ab ạ')).resolves.toBe(false);
  });

  it('never matches a product card title in the message list', async () => {
    layout();
    await expect(
      openShopeeConversation(document, 'Ghế Ngồi Cho Bé Đi Xe Máy Có Gác Chân (Ghế Đôn)'),
    ).resolves.toBe(false);
  });

  it('scrolls a rendered-but-offscreen row into the list before measuring', async () => {
    const rows = layout();
    const gl = rows[4];
    gl.getBoundingClientRect = rect({ x: 0, y: 700, width: 224, height: ROW }) as never;
    gl.scrollIntoView = vi.fn(() => {
      gl.getBoundingClientRect = rect({ x: 0, y: 400, width: 224, height: ROW }) as never;
    });
    await expect(openShopeeConversation(document, 'gl_anhduc')).resolves.toEqual({
      x: 112,
      y: 432,
    });
    expect(gl.scrollIntoView).toHaveBeenCalled();
  });

  it('gives up on a row that cannot be brought inside the list', async () => {
    const rows = layout();
    const gl = rows[4];
    gl.getBoundingClientRect = rect({ x: 0, y: 700, width: 224, height: ROW }) as never;
    gl.scrollIntoView = vi.fn();
    await expect(openShopeeConversation(document, 'gl_anhduc')).resolves.toBe(false);
  });

  it('trusts an unlaid-out page (zero rects) the way keepAlive does', async () => {
    await expect(openShopeeConversation(document, 'lego2shop')).resolves.toEqual({ x: 0, y: 0 });
  });

  it('is false for a name no row carries', async () => {
    layout();
    await expect(openShopeeConversation(document, 'nobody')).resolves.toBe(false);
  });
});

// the live list is a ReactVirtualized grid: only the rows near the viewport
// exist in the DOM (31 of 40 in the 2026-09-13 dump), so a shop further down
// has no row until the grid is scrolled there
describe('openShopeeConversation on a virtualized list', () => {
  const TOTAL = 100;
  let grid: HTMLElement;
  let scrollTop = 0;

  function render(): void {
    const first = Math.floor(scrollTop / ROW);
    const last = Math.min(TOTAL, first + Math.ceil(PANE / ROW));
    let html = '';
    for (let i = first; i < last; i++) {
      html += `<div class="row"><div class="AgkH0mKhkS" title="shop-${i}">shop-${i}</div><span title="preview ${i}">preview ${i}</span></div>`;
    }
    const group = grid.querySelector('[role="rowgroup"]') as HTMLElement;
    group.innerHTML = html;
    grid.getBoundingClientRect = rect({ x: 0, y: 80, width: 224, height: PANE }) as never;
    // the first rendered row is scrolled partly out, as in a real grid
    const offset = scrollTop - first * ROW;
    [...group.children].forEach((row, i) => {
      (row as HTMLElement).getBoundingClientRect = rect({
        x: 0,
        y: 80 - offset + i * ROW,
        width: 224,
        height: ROW,
      }) as never;
    });
  }

  beforeEach(() => {
    scrollTop = 0;
    grid = listGrid();
    Object.defineProperty(grid, 'clientHeight', { value: PANE, configurable: true });
    Object.defineProperty(grid, 'scrollHeight', { value: ROW * TOTAL, configurable: true });
    Object.defineProperty(grid, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(0, Math.min(v, ROW * TOTAL - PANE));
      },
    });
    render();
  });

  const settle = async () => render();

  it('scrolls until the named row renders, then answers its centre', async () => {
    await expect(openShopeeConversation(document, 'shop-57', { settle })).resolves.toMatchObject({
      x: 112,
    });
    expect(scrollTop).toBeGreaterThan(0);
  });

  it('reaches the last row', async () => {
    await expect(openShopeeConversation(document, 'shop-99', { settle })).resolves.toMatchObject({
      x: 112,
    });
  });

  it('a miss scrolls the whole list once and puts it back', async () => {
    grid.scrollTop = 3 * ROW;
    render();
    await expect(openShopeeConversation(document, 'nobody', { settle })).resolves.toBe(false);
    expect(grid.scrollTop).toBe(3 * ROW);
  });

  it('a row already in view needs no scrolling', async () => {
    const settleSpy = vi.fn(settle);
    await expect(
      openShopeeConversation(document, 'shop-2', { settle: settleSpy }),
    ).resolves.toMatchObject({ x: 112 });
    expect(settleSpy).not.toHaveBeenCalled();
  });

  it('gives up after the page cap rather than scrolling forever', async () => {
    Object.defineProperty(grid, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v; // no bottom: a list that grows as it scrolls
      },
    });
    const settleSpy = vi.fn(async () => {});
    await expect(
      openShopeeConversation(document, 'nobody', { settle: settleSpy, maxPages: 5 }),
    ).resolves.toBe(false);
    expect(settleSpy.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

// Shopee's widget never calls the web Notification API (its chat bundles carry
// no reference to it, checked 2026-09-13), so without a synthesized banner a
// Shopee message never reaches the banner stream or the recents list
describe('shopee.synthNotification', () => {
  it('names the first row carrying an unread count, with its preview as the body', () => {
    expect(shopee.synthNotification?.(document)).toEqual({
      title: 'DINOMO Franchise Store',
      body: 'Đánh giá để nhận Shopee Xu!',
    });
  });

  it('skips read rows, whose badge slot is empty', () => {
    const rows = [...document.querySelectorAll('[role="rowgroup"] > div')];
    rows[0].remove();
    rows[1].remove();
    expect(shopee.synthNotification?.(document)).toEqual({
      title: 'Chatu Baby - Ăn Dặm Cùng Bé',
      body: 'gl_anhduc',
    });
  });

  it('is null once every badge is gone', () => {
    for (const badge of document.querySelectorAll('.yDbk3kb9hA')) badge.remove();
    expect(shopee.synthNotification?.(document)).toBeNull();
  });

  it('never reads the message list for a badge', () => {
    for (const badge of document.querySelectorAll('.yDbk3kb9hA')) badge.remove();
    const msg = document.querySelectorAll('[role="rowgroup"]')[1]?.firstElementChild;
    msg?.insertAdjacentHTML('beforeend', '<span title="x">x</span><div><div>7</div></div>');
    expect(shopee.synthNotification?.(document)).toBeNull();
  });

  it('is null while the mini-chat is collapsed or absent', () => {
    document.querySelector('#shopee-mini-chat-embedded > div > div:nth-child(2)')?.remove();
    expect(shopee.synthNotification?.(document)).toBeNull();
    document.documentElement.innerHTML = '';
    expect(shopee.synthNotification?.(document)).toBeNull();
  });
});

describe('recipe wiring', () => {
  it('exposes the conversation hooks', () => {
    expect(shopee.conversation).toBe(shopeeConversation);
    expect(shopee.openConversation).toBe(openShopeeConversation);
  });

  it('is flagged so a synthesized banner title opens the shop by name', () => {
    expect(SERVICES.find((s) => s.id === 'shopee')?.bannerTitleNamesConversation).toBe(true);
  });
});
