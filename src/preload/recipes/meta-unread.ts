import type { Counts } from '../../shared/types';
import { urlKey } from '../lib/conversation-open';
import { textWithEmoji } from './emoji-text';
import { unreadFromTitle } from './title';

/** Unread markers shared by Meta chat lists, calibrated against
 *  facebook.com/messages (2026-08-05, Vietnamese locale) and matching
 *  instagram.com/direct's DOM language: the unread conversation row has
 *  font-weight 600 text (read rows max at 500), a small blue dot
 *  (facebook rgb(0,100,209), instagram rgb(0,149,246)) with border-radius
 *  999px sitting in the row (not the link), and a literal "Unread"
 *  screen-reader string. Green presence dots ("Active now") must not count. */
export function isUnreadRow(row: Element, win: Window & typeof globalThis): boolean {
  if (row.textContent?.includes('Unread')) return true;
  // A style read can flush a pending recalc, and this loop runs per row per
  // tick — so read one only for elements that could actually carry a signal.
  // Bold text is only ever on a span; the dot carries no text at all. That
  // skips every text-bearing wrapper, which is the bulk of a row, without
  // changing which elements can return true.
  for (const el of row.querySelectorAll('span, div, i')) {
    const isSpan = el.tagName === 'SPAN';
    const couldBeDot = !el.textContent;
    if (!isSpan && !couldBeDot) continue;
    const style = win.getComputedStyle(el);
    if (isSpan && Number.parseInt(style.fontWeight, 10) >= 600) {
      return true;
    }
    if (!couldBeDot) continue;
    const radius = style.borderRadius;
    if (!radius || (!radius.includes('%') && Number.parseInt(radius, 10) < 8)) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style.backgroundColor);
    if (!m) continue;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!(b >= 160 && b > g && g >= r)) continue; // blue-dominant, excludes presence-green
    const rect = el.getBoundingClientRect();
    // size known (real browser): must be a small dot; unknown (tests): trust color+radius
    if (rect.width > 0 && (rect.width < 6 || rect.width > 20)) continue;
    if (rect.height > 0 && (rect.height < 6 || rect.height > 20)) continue;
    return true;
  }
  return false;
}

/** Count conversations whose row shows an unread marker. No thread links
 *  (logged out, selector rot) falls back to the "(n)" title badge. */
export function countUnreadRows(
  doc: Document,
  linkSelector: string,
  rowFor: (link: Element) => Element,
): Counts {
  const win = doc.defaultView;
  const links = [...doc.querySelectorAll(linkSelector)];
  if (links.length === 0 || !win) {
    return { direct: unreadFromTitle(doc.title), indirect: 0 };
  }
  let direct = 0;
  for (const link of links) {
    if (isUnreadRow(rowFor(link), win)) direct++;
  }
  return { direct, indirect: 0 };
}

/** The thread list, derived from the very selectors count() uses so it cannot
 *  drift from them: the container holding the first thread row. Null while no
 *  thread link exists (logged out, still booting), which makes the runner
 *  count every tick until the surface is up. */
export function watchRows(
  doc: Document,
  linkSelector: string,
  rowFor: (link: Element) => Element,
): Node | null {
  const link = doc.querySelector(linkSelector);
  if (!link) return null;
  return rowFor(link).parentElement;
}

/** Build a banner from the first unread row — for Meta sites that never
 *  notify in-page (they delegate to browser push, which Electron doesn't
 *  support). Spans read [sender, preview, ·, time]. */
export function synthFromRows(
  doc: Document,
  linkSelector: string,
  rowFor: (link: Element) => Element,
): { title: string; body: string; href?: string } | null {
  const win = doc.defaultView;
  if (!win) return null;
  for (const link of doc.querySelectorAll(linkSelector)) {
    const row = rowFor(link);
    if (!isUnreadRow(row, win)) continue;
    const texts = rowTexts(row);
    if (texts.length === 0) return null;
    return {
      title: texts[0],
      body: (texts[1] ?? '').replace(/\s*·\s*\S{1,4}$/u, ''),
      href: link.getAttribute('href') ?? undefined,
    };
  }
  return null;
}

/** A row's texts in reading order — [name, preview, time]. Real text carries
 *  dir="auto"; presence labels ("Active now") don't. */
function rowTexts(row: Element): string[] {
  let spans = [...row.querySelectorAll('span[dir="auto"]')];
  if (spans.length === 0) spans = [...row.querySelectorAll('span')];
  return spans
    .map((s) => textWithEmoji(s))
    .filter((t, i, all) => t && t !== '·' && t !== all[i - 1]);
}

/** Name of the thread open right now: the row whose link is the document
 *  URL. Meta sites title themselves only "Messenger", so the thread list is
 *  the one place the name is written down. Null on the inbox, and when the
 *  thread was reached by URL and its row is not rendered. */
export function conversationFromRows(
  doc: Document,
  linkSelector: string,
  rowFor: (link: Element) => Element,
): string | null {
  const here = doc.defaultView?.location.href ?? '';
  const hereKey = urlKey(here, here);
  if (hereKey === null) return null;
  for (const link of doc.querySelectorAll(linkSelector)) {
    if (urlKey(link.getAttribute('href') ?? '', here) !== hereKey) continue;
    return rowTexts(rowFor(link))[0] ?? null;
  }
  return null;
}
