import { nameMatches } from '../lib/conversation-open';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** Zalo renders badge digits as font-icon classes (fa-1 … fa-5_Plus).
 *  Mirrors ferdium-recipes/zalo. */
export function faDigit(className: string): number | 'plus' | null {
  const m = /fa-(\d)(_Plus)?/.exec(className);
  if (!m) return null;
  return m[2] ? 'plus' : Number(m[1]);
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** The open conversation's name, from the chat header (live DOM, 2026-08-28
 *  dump). chat.zalo.me has one URL for every thread and titles itself only
 *  "Zalo", so this is the one handle a pin can keep. */
export function zaloConversation(doc: Document): string | null {
  const name = flat(
    doc.querySelector('.threadChat__title .header-title') ?? doc.querySelector('.header-title'),
  );
  return name === '' ? null : name;
}

/** Locate the chat-list row named `name` and answer with its centre for
 *  main to click: Zalo ignores synthetic clicks (see keepAlive). Rows are
 *  .msg-item in a ReactVirtualized grid, so a row exists only while
 *  rendered, and one rendered past the pane's edge would put its centre over
 *  a neighbour — it is scrolled into view first, and a row that still lies
 *  outside the list is given up on. Names are NBSP-joined in the DOM and
 *  clamped on the pin, so both sides are flattened and prefix-matched. */
export function openZaloConversation(
  doc: Document,
  name: string,
): false | { x: number; y: number } {
  const list =
    doc.querySelector('#conversationList') ??
    doc.querySelector('[data-id="div_TabMsg_ThrdChList"]');
  for (const item of doc.querySelectorAll('.msg-item')) {
    if (!nameMatches(flat(item.querySelector('.conv-item-title__name')), name)) continue;
    const pane = list?.getBoundingClientRect();
    let r = item.getBoundingClientRect();
    if (pane && pane.height > 0 && !inside(r, pane)) {
      item.scrollIntoView({ block: 'nearest' });
      r = item.getBoundingClientRect();
      if (!inside(r, pane)) return false;
    }
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  return false;
}

function inside(r: DOMRect, pane: DOMRect): boolean {
  const cy = r.y + r.height / 2;
  return cy >= pane.y && cy <= pane.y + pane.height;
}

const zalo: Recipe = {
  id: 'zalo',
  intervalMs: 2000,
  conversation: zaloConversation,
  openConversation: openZaloConversation,
  // the message tab exists once zalo's UI is mounted (badge or not)
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector('[data-translate-title="STR_TAB_MESSAGE"]'));
  },
  count(doc) {
    const tabBadge = doc.querySelector(
      '[data-translate-title="STR_TAB_MESSAGE"] [class*="leftbar-unread-badge"] .z-noti-badge__content',
    );
    if (!tabBadge) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    const digit = faDigit(tabBadge.className);
    if (typeof digit === 'number') return { direct: digit, indirect: 0 };
    if (digit === null) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    // "5+" tab badge: sum per-conversation badges
    let direct = 0;
    const convs = doc.querySelectorAll(
      '.conv-action__unread-v2 > div:not([class*="--noti-disable"])',
    );
    for (const conv of convs) {
      const d = faDigit(conv.querySelector('.z-noti-badge__content')?.className ?? '');
      direct += typeof d === 'number' ? d : 1;
    }
    return { direct: Math.max(direct, 6), indirect: 0 };
  },
  // Zalo web deactivates after idling (or when opened in another tab): it
  // unmounts the whole UI behind a "Kích hoạt" modal, freezing counts and
  // notifications until the button gets a *trusted* click.
  keepAlive(doc) {
    const btn = [...doc.querySelectorAll('[id^="zl-modal"] .zl-modal__footer .z--btn--v2')].find(
      (e) => /kích hoạt|activate/i.test(e.textContent ?? ''),
    );
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    // degenerate rect = view not laid out; a click there could hit anything
    if (r.width > 0 && r.width < 20) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
};
export default zalo;
