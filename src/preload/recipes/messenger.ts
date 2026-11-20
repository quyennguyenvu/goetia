import type { Counts } from '../../shared/types';
import { allowFacebookCalls, readCallBlockedUntil } from './facebook-calls';
import { bannersFromRows, conversationFromRows, countUnreadRows, watchRows } from './meta-unread';
import { visiblyPresent } from './ready';
import type { Recipe } from './types';

/** Unread detection and banner synthesis live in meta-unread.ts, shared
 *  with instagram — calibrated against the live facebook.com/messages DOM
 *  (2026-08-05, Vietnamese locale). Counts conversations. */
// A chat row in facebook's thread list (MWInboxLayout, MWThreadListItem; live
// bundle 2026-11-20). Page-wide, a link shared in the open conversation with
// /t/ in its URL was a "row" and its bold card title an unread chat; outside
// a row, the "Chats" title — a link to /messages/t/ — was the first match, so
// watch() observed the heading and an empty tab never looked empty.
const THREAD_LINK = "[role='navigation'] [role='row'] a[href*='/t/']";

// facebook's own "No unread chats": the list's empty row holds a heading and
// no thread row does (MWThreadListNullState, live bundle 2026-11-19)
const EMPTY_LIST = "[role='navigation'] [role='row'] :is(h2, h3, h4, h5, h6)";

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
  // Off-chat links (thread-header avatar → profile, View profile, shared
  // posts) stay live: the preload sends them to the OS browser, which an
  // inert link would leave nothing to send. chatPaths contains anything that
  // routes without a link.
  css: `
    [role="banner"] { display: none !important; }
    * { --header-height: 0px !important; }
    html:has(a[href*='/t/']), body:has(a[href*='/t/']) { overflow: hidden !important; }
  `,
  // chat rows must be VISIBLE, not just present — facebook server-renders
  // them behind its boot splash, and revealing there flashes the big logo
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector(THREAD_LINK));
  },
  // the pin's row label: this site's title never names the thread
  conversation(doc) {
    return conversationFromRows(doc, THREAD_LINK, rowFor);
  },
  count(doc): Counts {
    // an empty filter tab is a zero: the title countUnreadRows falls back to
    // adds Facebook notifications, which nothing in chat can clear
    if (!doc.querySelector(THREAD_LINK) && doc.querySelector(EMPTY_LIST)) {
      return { direct: 0, indirect: 0 };
    }
    return countUnreadRows(doc, THREAD_LINK, rowFor);
  },
  // count() sweeps every row's styles, so it is worth not running it at all
  // while the thread list is untouched
  watch(doc) {
    return watchRows(doc, THREAD_LINK, rowFor);
  },
  // facebook.com never notifies in-page — it delegates to browser push, which
  // Electron doesn't support (no FCM). Every unread row, not the first: the
  // runner announces the one whose preview changed, so a second message in a
  // chat that is already unread gets its banner too.
  unreadBanners(doc) {
    return bannersFromRows(doc, THREAD_LINK, rowFor);
  },
  // facebook's "Incoming call sounds" switch: while it is off the page drops
  // every ring, and both places facebook offers it are hidden in Goetia
  callsBlocked(doc) {
    const win = doc.defaultView;
    return win ? readCallBlockedUntil(win) : Promise.resolve(null);
  },
  allowCalls(doc) {
    const win = doc.defaultView;
    return win ? allowFacebookCalls(win) : Promise.resolve(null);
  },
};
export default messenger;
