import type { Counts } from '../../shared/types';
import { countUnreadRows, synthFromRows, watchRows } from './meta-unread';
import { visiblyPresent } from './ready';
import type { Recipe } from './types';

/** Unread detection and banner synthesis live in meta-unread.ts, shared
 *  with instagram — calibrated against the live facebook.com/messages DOM
 *  (2026-08-05, Vietnamese locale). Counts conversations. */
const THREAD_LINK = "a[href*='/t/']";

const rowFor = (link: Element) => link.closest("[role='row']") ?? link;

const messenger: Recipe = {
  id: 'messenger',
  intervalMs: 2000,
  // chat only: facebook.com is mostly not chat — profile links, marketplace
  // panels, shared posts all route away. /messenger_media is the in-chat
  // attachment lightbox and must not trigger a snap-back.
  chatPaths: ['/messages', '/messenger_media'],
  // chat only: hide facebook's global top nav. Layout offsets and heights are
  // driven by --header-height (56px), redefined at element level in places —
  // force it to 0 everywhere or the reclaimed space reappears as a footer gap.
  // facebook also pins html to overflow-y:scroll, which paints an empty
  // scrollbar track beside the chat forever (measured 2026-08-11) — the chat
  // fills the view, so only its own panes scroll. Both rules are gated on the
  // chat surface so login and checkpoint pages keep their scrollbar.
  // Off-chat in-page links (thread-header avatar/name → profile, shared
  // posts, marketplace panels) get pointer-events:none instead of a jarring
  // navigate-then-snapback; gated on the chat surface so login pages keep
  // every link live. chatPaths stays the containment for anything that
  // still routes (e.g. absolute-URL or role=button navigations).
  css: `
    [role="banner"] { display: none !important; }
    * { --header-height: 0px !important; }
    html:has(a[href*='/t/']), body:has(a[href*='/t/']) { overflow: hidden !important; }
    body:has(a[href*='/t/'])
      a[href^='/']:not([href^='/messages']):not([href^='/messenger_media']) {
      pointer-events: none !important;
    }
  `,
  // chat rows must be VISIBLE, not just present — facebook server-renders
  // them behind its boot splash, and revealing there flashes the big logo
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector(THREAD_LINK));
  },
  count(doc): Counts {
    return countUnreadRows(doc, THREAD_LINK, rowFor);
  },
  // count() sweeps every row's styles, so it is worth not running it at all
  // while the thread list is untouched
  watch(doc) {
    return watchRows(doc, THREAD_LINK, rowFor);
  },
  // facebook.com never notifies in-page — it delegates to browser push, which
  // Electron doesn't support (no FCM)
  synthNotification(doc) {
    return synthFromRows(doc, THREAD_LINK, rowFor);
  },
};
export default messenger;
