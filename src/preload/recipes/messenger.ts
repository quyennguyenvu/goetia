import type { Counts } from '../../shared/types';
import { textWithEmoji } from './emoji-text';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** Unread markers on facebook.com/messages, calibrated against the live DOM
 *  (2026-08-05, Vietnamese locale): the unread conversation row has
 *  font-weight 600 text (read rows max at 500), a small blue dot
 *  rgb(0,100,209) with border-radius 999px sitting in the row (not the link),
 *  and a literal "Unread" screen-reader string. Green rgb(36,131,44) dots are
 *  "Active now" presence and must not count. Counts conversations. */
function isUnreadRow(row: Element, win: Window & typeof globalThis): boolean {
  if (row.textContent?.includes('Unread')) return true;
  // one computed-style read per element (bold text OR blue unread dot),
  // instead of two overlapping querySelectorAll sweeps
  for (const el of row.querySelectorAll('span, div, i')) {
    const style = win.getComputedStyle(el);
    if (el.tagName === 'SPAN' && Number.parseInt(style.fontWeight, 10) >= 600) {
      return true;
    }
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

const messenger: Recipe = {
  id: 'messenger',
  intervalMs: 2000,
  // chat only: hide facebook's global top nav. Layout offsets and heights are
  // driven by --header-height (56px), redefined at element level in places —
  // force it to 0 everywhere or the reclaimed space reappears as a footer gap.
  css: `
    [role="banner"] { display: none !important; }
    * { --header-height: 0px !important; }
  `,
  // chat rows must be VISIBLE, not just present — facebook server-renders
  // them behind its boot splash, and revealing there flashes the big logo
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector("a[href*='/t/']"));
  },
  count(doc): Counts {
    const win = doc.defaultView;
    const links = [...doc.querySelectorAll("a[href*='/t/']")];
    if (links.length === 0 || !win) {
      return { direct: unreadFromTitle(doc.title), indirect: 0 };
    }
    let direct = 0;
    for (const link of links) {
      const row = link.closest("[role='row']") ?? link;
      if (isUnreadRow(row, win)) direct++;
    }
    return { direct, indirect: 0 };
  },
  // facebook.com never notifies in-page — it delegates to browser push, which
  // Electron doesn't support (no FCM). Synthesize from the chat-list row:
  // spans read [sender, preview, ·, time].
  synthNotification(doc) {
    const win = doc.defaultView;
    if (!win) return null;
    for (const link of doc.querySelectorAll("a[href*='/t/']")) {
      const row = link.closest("[role='row']") ?? link;
      if (!isUnreadRow(row, win)) continue;
      // real text carries dir="auto"; presence labels ("Active now") don't
      let spans = [...row.querySelectorAll('span[dir="auto"]')];
      if (spans.length === 0) spans = [...row.querySelectorAll('span')];
      const texts = spans
        .map((s) => textWithEmoji(s))
        .filter((t, i, all) => t && t !== '·' && t !== all[i - 1]);
      if (texts.length === 0) return null;
      return {
        title: texts[0],
        body: (texts[1] ?? '').replace(/\s*·\s*\S{1,4}$/u, ''),
      };
    }
    return null;
  },
};
export default messenger;
