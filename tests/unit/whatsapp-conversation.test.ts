// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clampText, PIN_CONVERSATION_MAX } from '../../src/main/lib/pin-rules';
import { openWhatsAppConversation, whatsAppConversation } from '../../src/preload/recipes/whatsapp';

// the fixture mirrors the live web.whatsapp.com DOM (2026-08-27 dump); the
// open chat is the long-named group, so the header's member list sits right
// beside the name as the only span[title] in the header
const PAGE = readFileSync(join(__dirname, '../fixtures/whatsapp-chat.html'), 'utf8');
const LONG_NAME =
  'Weekend hikers — Sunday 6am carpool from the north gate, bring water and a headlamp';

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

/** click listeners on every row, keyed by the row's list-item index */
function watchRows() {
  const seen: string[] = [];
  document.querySelectorAll('[role="row"]').forEach((row, i) => {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      row.addEventListener(t, () => seen.push(`${i}:${t}`));
    }
  });
  return seen;
}

describe('whatsAppConversation', () => {
  it("reads the open chat's name, not its member list", () => {
    expect(whatsAppConversation(document)).toBe(LONG_NAME);
  });

  it('is null with no chat open', () => {
    document.querySelector('#main')?.remove();
    expect(whatsAppConversation(document)).toBeNull();
  });
});

describe('openWhatsAppConversation', () => {
  it('replays a press that bubbles through the named row', async () => {
    const seen = watchRows();
    await expect(openWhatsAppConversation(document, 'Alice Nguyen')).resolves.toBe(true);
    expect(seen).toEqual(['1:mousedown', '1:mouseup', '1:click']);
  });

  it('matches the chat title, never a message preview that reads the same', async () => {
    const seen = watchRows();
    await expect(openWhatsAppConversation(document, 'Design team')).resolves.toBe(true);
    expect(seen).toEqual(['0:mousedown', '0:mouseup', '0:click']);
  });

  it('finds a chat whose pinned name was clamped with an ellipsis', async () => {
    const pinned = clampText(LONG_NAME, PIN_CONVERSATION_MAX);
    expect(pinned.endsWith('…')).toBe(true);
    const seen = watchRows();
    await expect(openWhatsAppConversation(document, pinned)).resolves.toBe(true);
    expect(seen[0]).toBe('2:mousedown');
  });

  it('reports false for a name that is not a list row, clicking nothing', async () => {
    const seen = watchRows();
    const clicked = vi.fn();
    document.querySelector('header')?.addEventListener('click', clicked);
    await expect(openWhatsAppConversation(document, 'Alice, Bob, Chi, You')).resolves.toBe(false);
    await expect(openWhatsAppConversation(document, 'nobody')).resolves.toBe(false);
    expect(seen).toEqual([]);
    expect(clicked).not.toHaveBeenCalled();
  });
});

// the live chat list is virtualized: only the rows in view exist in the DOM,
// so a chat below the fold has no row to click until the pane is scrolled
// there — the 2026-09-04 "pins only work for the top chats" report
describe('openWhatsAppConversation on a virtualized list', () => {
  const ROW = 72;
  const PANE = 600;
  const TOTAL = 100;
  let pane: HTMLElement;
  let scrollTop = 0;
  const clicked: string[] = [];

  function render(): void {
    const grid = pane.querySelector('[role="grid"]') as HTMLElement;
    const first = Math.floor(scrollTop / ROW);
    const last = Math.min(TOTAL, first + Math.ceil(PANE / ROW));
    let html = '';
    for (let i = first; i < last; i++) {
      html += `<div role="row"><div data-testid="cell-frame-title"><span dir="auto" title="chat-${i}">chat-${i}</span></div></div>`;
    }
    grid.innerHTML = html;
    for (const row of grid.querySelectorAll('[role="row"]')) {
      row.addEventListener('click', () =>
        clicked.push(row.querySelector('span')?.getAttribute('title') ?? ''),
      );
    }
  }

  beforeEach(() => {
    clicked.length = 0;
    scrollTop = 0;
    pane = document.querySelector('#pane-side') as HTMLElement;
    Object.defineProperty(pane, 'clientHeight', { value: PANE, configurable: true });
    Object.defineProperty(pane, 'scrollHeight', { value: ROW * TOTAL, configurable: true });
    Object.defineProperty(pane, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.max(0, Math.min(v, ROW * TOTAL - PANE));
      },
    });
    render();
  });

  const settle = async () => render();

  it('scrolls until the named row renders, then clicks it', async () => {
    await expect(openWhatsAppConversation(document, 'chat-57', { settle })).resolves.toBe(true);
    expect(clicked).toEqual(['chat-57']);
  });

  it('reaches the last row', async () => {
    await expect(openWhatsAppConversation(document, 'chat-99', { settle })).resolves.toBe(true);
    expect(clicked).toEqual(['chat-99']);
  });

  it('a miss scrolls the whole list once and puts it back', async () => {
    pane.scrollTop = 3 * ROW;
    await expect(openWhatsAppConversation(document, 'nobody', { settle })).resolves.toBe(false);
    expect(clicked).toEqual([]);
    expect(pane.scrollTop).toBe(3 * ROW);
  });

  it('a row already in view needs no scrolling', async () => {
    const settleSpy = vi.fn(settle);
    await expect(openWhatsAppConversation(document, 'chat-2', { settle: settleSpy })).resolves.toBe(
      true,
    );
    expect(settleSpy).not.toHaveBeenCalled();
  });

  it('gives up after the page cap rather than scrolling forever', async () => {
    Object.defineProperty(pane, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v; // no bottom: a list that grows as it scrolls
      },
    });
    const settleSpy = vi.fn(async () => {});
    await expect(
      openWhatsAppConversation(document, 'nobody', { settle: settleSpy, maxPages: 5 }),
    ).resolves.toBe(false);
    expect(settleSpy.mock.calls.length).toBeLessThanOrEqual(6);
  });
});
