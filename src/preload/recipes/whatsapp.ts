import type { Counts } from '../../shared/types';
import { nameKey, nameMatches } from '../lib/conversation-open';
import { textWithEmoji } from './emoji-text';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

export interface WhatsAppChat {
  unreadCount?: number;
  archive?: boolean;
  muteExpiration?: number;
  isAutoMuted?: boolean;
}

/** Mirrors ferdium-recipes/whatsapp: unread from the page's own chat DB,
 *  muted chats count as indirect. */
export function countWhatsAppChats(chats: WhatsAppChat[]): Counts {
  let direct = 0;
  let indirect = 0;
  for (const chat of chats) {
    const unread = chat.unreadCount ?? 0;
    if (unread <= 0 || chat.archive) continue;
    if ((chat.muteExpiration ?? 0) !== 0 || chat.isAutoMuted) indirect += unread;
    else direct += unread;
  }
  return { direct, indirect };
}

let db: IDBDatabase | null = null;
let lastProbeAt = 0;
/** When no model-storage DB exists yet (logged out, fresh profile), the probe
 *  below would otherwise run every tick forever. A login creates the DB later
 *  in the same document, so the negative result is not cached outright — just
 *  rate-limited to a re-probe every 30s. */
const PROBE_MIN_INTERVAL_MS = 30_000;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (db) return resolve(db);
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
      return resolve(null);
    }
    const now = Date.now();
    if (now - lastProbeAt < PROBE_MIN_INTERVAL_MS) return resolve(null);
    lastProbeAt = now;
    indexedDB
      .databases()
      .then((dbs) => {
        if (!dbs.some((d) => d.name === 'model-storage')) return resolve(null);
        const req = indexedDB.open('model-storage');
        req.onsuccess = () => {
          db = req.result;
          db.onversionchange = () => {
            db?.close();
            db = null;
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
      })
      .catch(() => resolve(null));
  });
}

function readChats(database: IDBDatabase): Promise<WhatsAppChat[]> {
  return new Promise((resolve, reject) => {
    const store = database.transaction('chat', 'readonly').objectStore('chat');
    const q = store.getAll();
    q.onsuccess = () => resolve(q.result as WhatsAppChat[]);
    q.onerror = () => reject(q.error);
  });
}

/** The open chat's name, from the conversation header's chat-title span
 *  (live DOM, 2026-08-27 dump). It carries no title attribute — the
 *  span[title] beside it is the member list, which is what the first cut
 *  pinned. web.whatsapp.com has no per-thread URL and titles itself only
 *  "WhatsApp", so this is the one handle a pin can keep. Emoji in the name
 *  are `<img alt>` here but raw text in the row's title, so they are read
 *  back from the alt or the pin never matches its row. */
export function whatsAppConversation(doc: Document): string | null {
  const span =
    doc.querySelector('#main header [data-testid="conversation-info-header-chat-title"]') ??
    doc.querySelector('#main header [role="button"] span[dir="auto"]');
  const name = span ? textWithEmoji(span) : '';
  return name === '' ? null : name;
}

/** What WhatsApp's banner titler prints for an emoji it has no glyph for
 *  (WAWebEmoji.normalizeAllEmojis, read from the live bundle 2026-09-22). */
const UNKNOWN_EMOJI = '\u25A1';
/** One emoji as the row's raw title spells it: a pictograph with its skin
 *  tone or ZWJ-joined companions, a flag pair, or a keycap. */
const EMOJI =
  String.raw`(?:\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic})*` +
  String.raw`|\p{Regional_Indicator}{2}|[0-9#*]\u20E3)`;

/** Whether a chat-list row titled `title` is the chat the banner called
 *  `name`. The banner title is WhatsApp's rendering: every emoji it knows in
 *  its qualified form (nameMatches absorbs that) and every emoji it does not
 *  as "□", which here stands in for exactly one emoji in the row — never for
 *  text, so "Family □" still cannot open "Family chat". */
export function whatsAppNameMatches(title: string, name: string): boolean {
  if (nameMatches(title, name)) return true;
  if (!name.includes(UNKNOWN_EMOJI)) return false;
  const pattern = nameKey(name)
    .split(UNKNOWN_EMOJI)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(EMOJI);
  return new RegExp(`^${pattern}$`, 'u').test(nameKey(title));
}

/** Rows in view carry the name in the span[title] of cell-frame-title; the
 *  message preview beneath is a span[title] too, so the search is scoped to
 *  the title cell. The press is replayed as mousedown → mouseup → click on
 *  the name itself: the handler may sit on any wrapper between it and the
 *  row, and a bubbling event crosses all of them. */
function clickRow(doc: Document, name: string): boolean {
  for (const row of doc.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')) {
    const span =
      row.querySelector('[data-testid="cell-frame-title"] span[title]') ??
      row.querySelector('span[dir="auto"][title]');
    if (!span || !whatsAppNameMatches(span.getAttribute('title')?.trim() ?? '', name)) continue;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      span.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }),
      );
    }
    return true;
  }
  return false;
}

/** How long a scrolled page is given to render before its rows are read. */
const SCROLL_SETTLE_MS = 60;
/** Pages of the chat list walked before a name is declared gone — ~8 rows a
 *  page, so several hundred chats; bounded so a miss costs seconds, not a hang. */
const SCROLL_MAX_PAGES = 80;

/** Click the chat-list row named `name`. The list is virtualized — only the
 *  rows in view exist in the DOM — so a name with no row is walked for: the
 *  pane is scrolled from the top a page at a time, each page given a moment
 *  to render, until the row appears or the bottom is reached. A miss puts the
 *  pane back where it was. False when no row carries the name (archived,
 *  renamed, or beyond the page cap) — the caller decides then. */
export async function openWhatsAppConversation(
  doc: Document,
  name: string,
  opts: { settle?: () => Promise<void>; maxPages?: number } = {},
): Promise<boolean> {
  if (clickRow(doc, name)) return true;
  const pane = doc.querySelector('#pane-side') as HTMLElement | null;
  if (!pane || pane.clientHeight <= 0) return false;
  const settle = opts.settle ?? (() => new Promise<void>((r) => setTimeout(r, SCROLL_SETTLE_MS)));
  const maxPages = opts.maxPages ?? SCROLL_MAX_PAGES;
  const start = pane.scrollTop;
  pane.scrollTop = 0;
  for (let page = 0; page < maxPages; page++) {
    await settle();
    if (clickRow(doc, name)) return true;
    const before = pane.scrollTop;
    pane.scrollTop = before + pane.clientHeight;
    if (pane.scrollTop === before) break; // the bottom
  }
  pane.scrollTop = start;
  return false;
}

const whatsapp: Recipe = {
  id: 'whatsapp',
  intervalMs: 2000,
  conversation: whatsAppConversation,
  openConversation: openWhatsAppConversation,
  // #pane-side (chat-list pane) mounts only after the logo+progress boot
  // screen finishes
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector('#pane-side'));
  },
  async count(doc) {
    const database = await openDb();
    if (!database) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    return countWhatsAppChats(await readChats(database));
  },
  // the chat-list pane backs the DB the count reads: a quiet pane means a
  // quiet store, so the runner may skip the full getAll() until a row moves.
  // Null while logged out/booting (#pane-side absent) → count every tick.
  watch(doc) {
    return doc.querySelector('#pane-side');
  },
};
export default whatsapp;
