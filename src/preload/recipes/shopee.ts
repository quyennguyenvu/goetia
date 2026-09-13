import type { Counts } from '../../shared/types';
import { nameMatches } from '../lib/conversation-open';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** The mini-chat widget on shopee.vn (buyer chat). Stable ids:
 *  #main (shopping site), #shopee-mini-chat-embedded (chat host).
 *  Everything below them is build-hashed — structural selectors only.
 *  Expanded: host > wrapper > [header, body]. Collapsed: 100x48 pill
 *  (wrapper has a single child). Calibrated 2026-08-06. */

/** Shopee sends a logged-out visitor to /verify/traffic/error?…&is_logged_in=false
 *  — a dead-end "Login Required" gate, not a sign-in form (live probe
 *  2026-08-31). Land on the buyer login page instead; `next` (a full URL, the
 *  form Shopee itself emits) brings the session back to the chat host on the
 *  home page. */
const LOGIN_URL = 'https://shopee.vn/buyer/login?next=https%3A%2F%2Fshopee.vn%2F';

/** Header row when expanded, whole wrapper when collapsed —
 *  the one place the unread badge text lives. */
function chatHeader(doc: Document): Element | null {
  const wrapper = doc.querySelector('#shopee-mini-chat-embedded')?.firstElementChild;
  if (!wrapper) return null;
  return wrapper.children.length >= 2 ? wrapper.children[0] : wrapper;
}

/** Body of the expanded widget: [overlay, list pane, chat pane] (live DOM,
 *  2026-09-13). Null while collapsed. */
function chatBody(doc: Document): Element | null {
  const wrapper = doc.querySelector('#shopee-mini-chat-embedded')?.firstElementChild;
  return wrapper && wrapper.children.length >= 2 ? wrapper.children[1] : null;
}

/** The two panes are told apart by Shopee's own component classes, the only
 *  unhashed handles below the host: the list pane owns the search box
 *  (shopee-react-input) and a filter dropdown; the chat pane owns the other
 *  shopee-react-dropdown, whose label is the open shop's name. */
function listPane(doc: Document): Element | null {
  for (const pane of chatBody(doc)?.children ?? []) {
    if (pane.querySelector('.shopee-react-input')) return pane;
  }
  return null;
}

function chatPane(doc: Document): Element | null {
  for (const pane of chatBody(doc)?.children ?? []) {
    if (pane.querySelector('.shopee-react-input')) continue;
    if (pane.querySelector('.shopee-react-dropdown')) return pane;
  }
  return null;
}

const flat = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? '';

/** The open conversation's name, from the chat pane's header dropdown.
 *  shopee.vn has one URL for the whole widget and titles itself after the
 *  shopping site, so this is the one handle a pin can keep. */
export function shopeeConversation(doc: Document): string | null {
  const label =
    chatPane(doc)?.querySelector('.shopee-react-dropdown')?.firstElementChild?.firstElementChild;
  if (label?.tagName !== 'DIV') return null;
  const name = flat(label.textContent);
  return name === '' ? null : name;
}

type Point = { x: number; y: number };

const SCROLL_SETTLE_MS = 60;
/** Rows are 63px in a ~700px grid, so 40 pages is over 400 shops. */
const SCROLL_MAX_PAGES = 40;

/** Locate the chat-list row named `name` and answer with its centre for main
 *  to click: Shopee ignores synthetic clicks (see keepAlive). Rows are the
 *  children of the list grid's rowgroup (ReactVirtualized — only the rows
 *  near the viewport exist), naming the shop in a div[title]; the preview
 *  beneath is a span[title] and may name another shop, so only the div
 *  counts. A row that is not rendered is looked for a page at a time from the
 *  top (bounded; the grid's scroll is restored on a miss), and a rendered row
 *  past the grid's edge is scrolled into view first — one still outside would
 *  put its centre over a neighbour, so it is given up on. */
export async function openShopeeConversation(
  doc: Document,
  name: string,
  opts: { settle?: () => Promise<void>; maxPages?: number } = {},
): Promise<false | Point> {
  const grid = listPane(doc)?.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) return false;
  let row = findRow(grid, name);
  if (!row && grid.clientHeight > 0) {
    const settle = opts.settle ?? (() => new Promise<void>((r) => setTimeout(r, SCROLL_SETTLE_MS)));
    const maxPages = opts.maxPages ?? SCROLL_MAX_PAGES;
    const start = grid.scrollTop;
    grid.scrollTop = 0;
    for (let page = 0; page < maxPages; page++) {
      await settle();
      row = findRow(grid, name);
      if (row) break;
      const before = grid.scrollTop;
      grid.scrollTop = before + grid.clientHeight;
      if (grid.scrollTop === before) break; // the bottom
    }
    if (!row) grid.scrollTop = start;
  }
  if (!row) return false;
  const pane = grid.getBoundingClientRect();
  let r = row.getBoundingClientRect();
  if (pane.height > 0 && !inside(r, pane)) {
    row.scrollIntoView({ block: 'nearest' });
    r = row.getBoundingClientRect();
    if (!inside(r, pane)) return false;
  }
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** A row's unread count, or null when read. The count sits in the slot after
 *  the preview line — `span[title]`'s parent's next sibling — which is empty
 *  on a read row; no unhashed class marks it. */
function rowUnread(row: Element): number | null {
  const slot = row.querySelector('span[title]')?.parentElement?.nextElementSibling;
  const m = /^\d+$/.exec(flat(slot?.textContent));
  return m ? Number.parseInt(m[0], 10) : null;
}

function findRow(grid: Element, name: string): Element | null {
  for (const row of grid.querySelector('[role="rowgroup"]')?.children ?? []) {
    const title = row.querySelector('div[title]')?.getAttribute('title');
    if (title && nameMatches(flat(title), name)) return row;
  }
  return null;
}

function inside(r: DOMRect, pane: DOMRect): boolean {
  const cy = r.y + r.height / 2;
  return cy >= pane.y && cy <= pane.y + pane.height;
}

const shopee: Recipe = {
  id: 'shopee',
  intervalMs: 2000,
  conversation: shopeeConversation,
  openConversation: openShopeeConversation,
  // the widget never calls the web Notification API (its chat bundles carry
  // no reference to it, 2026-09-13), so a Shopee message would never reach
  // the banner stream or recents — synthesize from the first unread row. The
  // title is the shop name, which is what opens it (bannerTitleNamesConversation).
  synthNotification(doc) {
    const grid = listPane(doc)?.querySelector('[role="grid"]');
    for (const row of grid?.querySelector('[role="rowgroup"]')?.children ?? []) {
      if (rowUnread(row) === null) continue;
      const title = flat(row.querySelector('div[title]')?.getAttribute('title'));
      if (title === '') continue;
      return { title, body: flat(row.querySelector('span[title]')?.getAttribute('title')) };
    }
    return null;
  },
  // chat only: once the mini-chat panel is EXPANDED it becomes the app —
  // hide the shopping site and fill the view. Every rule is gated on the
  // expanded state (:has body child): while collapsed the page must stay
  // untouched so login/captcha pages work and the pill keeps its real
  // rect for keepAlive. Hiding keeps textContent readable for count().
  css: `
    body:has(#shopee-mini-chat-embedded > div > div:nth-child(2))
      #main { display: none !important; }
    /* the widget is pinned to the viewport below, so the shopping page behind
       it must not keep its own scrollbar */
    html:has(#shopee-mini-chat-embedded > div > div:nth-child(2)),
    body:has(#shopee-mini-chat-embedded > div > div:nth-child(2)) {
      overflow: hidden !important;
    }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2)) {
      position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important;
      max-width: none !important; max-height: none !important;
    }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2)) > div {
      width: 100% !important; height: 100% !important;
      max-width: none !important; max-height: none !important;
    }
    #shopee-mini-chat-embedded > div:has(> div:nth-child(2))
      > div:first-child { display: none !important; }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2))
      > div > div:last-child {
      height: 100% !important; max-height: none !important;
    }
  `,
  // expanded mini-chat (header + body) — the keep-alive click landed
  ready(doc) {
    const wrapper = doc.querySelector('#shopee-mini-chat-embedded')?.firstElementChild;
    return (wrapper?.children.length ?? 0) >= 2;
  },
  // logged-out shell: only the /verify/traffic/error gate, which a logged-in
  // user never lands on — so no positive session marker is needed. Never the
  // login page itself (would loop). URL-based, so it is locale-independent.
  loginUrl(doc) {
    const { pathname, search } = doc.location;
    if (pathname.startsWith('/buyer/login')) return null;
    if (
      pathname === '/verify/traffic/error' &&
      new URLSearchParams(search).get('is_logged_in') === 'false'
    ) {
      return LOGIN_URL;
    }
    return null;
  },
  count(doc): Counts {
    const header = chatHeader(doc);
    if (!header) {
      return { direct: unreadFromTitle(doc.title), indirect: 0 };
    }
    const m = (header.textContent ?? '').match(/\d+/);
    return { direct: m ? Number.parseInt(m[0], 10) : 0, indirect: 0 };
  },
  // Collapsed pill needs a trusted click to open the chat panel —
  // page-JS synthetic clicks are untrusted (same machinery as zalo's
  // activation modal; runner rate-limits to one click per 30s).
  keepAlive(doc) {
    const wrapper = doc.querySelector('#shopee-mini-chat-embedded')?.firstElementChild;
    if (!wrapper) return null;
    if (wrapper.children.length >= 2) return null; // expanded: healthy
    // click the pill itself, not the host — the host may be restyled
    const pill = wrapper.firstElementChild ?? wrapper;
    const r = pill.getBoundingClientRect();
    // laid-out-but-tiny rect: view not really laid out, don't click
    if (r.width > 0 && r.width < 20) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
};

export default shopee;
