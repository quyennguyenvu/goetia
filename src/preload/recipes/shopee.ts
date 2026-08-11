import type { Counts } from '../../shared/types';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** The mini-chat widget on shopee.vn (buyer chat). Stable ids:
 *  #main (shopping site), #shopee-mini-chat-embedded (chat host).
 *  Everything below them is build-hashed — structural selectors only.
 *  Expanded: host > wrapper > [header, body]. Collapsed: 100x48 pill
 *  (wrapper has a single child). Calibrated 2026-08-06. */

/** Header row when expanded, whole wrapper when collapsed —
 *  the one place the unread badge text lives. */
function chatHeader(doc: Document): Element | null {
  const wrapper = doc.querySelector('#shopee-mini-chat-embedded')?.firstElementChild;
  if (!wrapper) return null;
  return wrapper.children.length >= 2 ? wrapper.children[0] : wrapper;
}

const shopee: Recipe = {
  id: 'shopee',
  intervalMs: 2000,
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
