import type { Counts } from '../../shared/types';
import { nameMatches } from '../lib/conversation-open';
import { textWithEmoji } from './emoji-text';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** TikTok web DMs (www.tiktok.com/messages). Calibrated 2026-08-07, re-verified
 *  2026-08-29 against the live logged-in DOM. Class names are build-hashed AND
 *  the prefix rotates between builds (tiktok-… / css-…) — only the semantic
 *  styled-component suffix (…--DivSideNavContainer) is stable, so match on
 *  `[class*=]` and never on the prefix; data-e2e hooks are TikTok's own test
 *  ids. Layout: #app-header (logo, search, upload, inbox, top-dm-icon) +
 *  BaseBodyContainer > [SideNavPlaceholder > SideNav (nav rail + the DM
 *  drawer), #main-content-messages (dm-new-chatbox)]. */

/** Messages icon in the top header — its <sup> badge is the unread total, and
 *  the icon itself is the session signal: the logged-out header carries
 *  top-login-button instead. Kept countable while the header is display:none
 *  (textContent survives). */
const LOGGED_IN = '[data-e2e="top-dm-icon"]';
/** Same total on the side-nav Messages item's red dot; the fallback when the
 *  header renders no badge. */
const NAV_TOTAL = '[data-e2e="dm-total-unread-count"]';
/** A conversation row's unread badge (its count text); read rows have none. */
const ROW_UNREAD = '[data-e2e="dm-new-conversation-unread"]';
const ROW = '[data-e2e="dm-new-conversation-item"]';
const ROW_NAME = '[data-e2e="dm-new-conversation-nickname"]';

/** The messages surface is mounted: a conversation is open (chatbox), or the
 *  DM drawer is up with nothing in it (zero conversations — no
 *  #main-content-messages renders then). The drawer ALSO mounts, empty, on
 *  the logged-out page (captured 2026-08-29), so the surface alone cannot
 *  gate the chrome: CHAT pairs it with LOGGED_IN, and login/captcha pages
 *  keep their nav — and its Log in button — untouched. */
const CHAT_MARKERS = '[data-e2e="dm-new-chatbox"], [class*="DivMessageDrawerContainer"]';
const CHAT = `body:has(${LOGGED_IN}):has(${CHAT_MARKERS})`;

function badgeCount(el: Element | null): number | null {
  const m = el?.textContent?.match(/\d+/); // "99+" → 99
  return m ? Number.parseInt(m[0], 10) : null;
}

const tiktok: Recipe = {
  id: 'tiktok',
  intervalMs: 2000,
  // chat only: everything outside /messages is the feed/profile surface
  chatPaths: ['/messages'],
  // chat only: the top header and the side-nav icon stacks are escape
  // hatches into the feed (home, explore, live, upload, profile) — hide
  // them. NEVER hide the side-nav container itself: its DivDrawerContainer
  // child hosts the DM conversation list. Gated on CHAT so login/captcha
  // pages stay untouched. display:none keeps textContent readable for
  // count()'s badge probe. TUXTooltip: with the header gone, its "Post
  // video" nudge tooltip orphans at the viewport corner (portals for
  // dialogs/captcha are not tooltips and stay live). Rail reclaim: the
  // emptied nav rail is 72px, the drawer is fixed at left:72 (320px wide),
  // and the body flexbox justifies space-between — so collapse the rail,
  // pin the drawer to 0, and grow main by the measured 72px.
  css: `
    /* the DM surface fills the view; only its own panes scroll */
    html:has(${LOGGED_IN}):has(${CHAT_MARKERS}), ${CHAT} {
      overflow: hidden !important;
    }
    ${CHAT} #app-header,
    ${CHAT} [class*="DivSideNavContainer"] > [class*="DivFixedContentContainer"],
    ${CHAT} [class*="DivSideNavContainer"] > [class*="DivScrollingContentContainer"],
    ${CHAT} [class*="DivAnimationCover"],
    ${CHAT} .TUXTooltip-tooltip {
      display: none !important;
    }
    ${CHAT} [class*="DivSideNavContainer"] {
      width: 0 !important;
      min-width: 0 !important;
      padding: 0 !important;
    }
    ${CHAT} [class*="DivSideNavContainer"] > [class*="DivDrawerContainer"] {
      left: 0 !important;
    }
    ${CHAT} #main-content-messages {
      margin: 0 0 0 -72px !important;
      padding-top: 0 !important;
      width: calc(100% - 320px) !important;
      max-width: none !important;
    }
  `,
  // logged out, /messages renders the nav and an empty drawer — no session,
  // no chat: the waking cover must stay up
  ready(doc) {
    return doc.querySelector(LOGGED_IN) !== null && doc.querySelector(CHAT_MARKERS) !== null;
  },
  count(doc): Counts {
    const n = badgeCount(doc.querySelector(LOGGED_IN)) ?? badgeCount(doc.querySelector(NAV_TOTAL));
    if (n === null) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    return { direct: n, indirect: 0 };
  },
  // TikTok web delegates to browser push, which Electron lacks (no FCM) —
  // synthesize from the first conversation row carrying its unread badge.
  // Preview text has no data-e2e hook, so the banner is nickname-only.
  synthNotification(doc) {
    for (const row of doc.querySelectorAll(ROW)) {
      if (!row.querySelector(ROW_UNREAD)) continue;
      const nickname = row.querySelector(ROW_NAME);
      if (!nickname) continue;
      return { title: textWithEmoji(nickname), body: '' };
    }
    return null;
  },
  // the pin's row label: the URL never names the thread, the chatbox header does
  conversation(doc) {
    const el = doc.querySelector('[data-e2e="dm-new-chatbox"] [data-e2e="dm-new-chat-nickname"]');
    const name = el ? textWithEmoji(el) : '';
    return name === '' ? null : name;
  },
  // click the row named `name`; the press bubbles from the nickname through
  // whichever wrapper owns the handler
  openConversation(doc, name) {
    for (const row of doc.querySelectorAll(ROW)) {
      const nickname = row.querySelector(ROW_NAME);
      if (!nickname || !nameMatches(textWithEmoji(nickname), name)) continue;
      for (const type of ['mousedown', 'mouseup', 'click']) {
        nickname.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }),
        );
      }
      return true;
    }
    return false;
  },
};

export default tiktok;
