import type { Counts } from '../../shared/types';
import { textWithEmoji } from './emoji-text';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** TikTok web DMs (www.tiktok.com/messages). Calibrated 2026-08-07 against
 *  the live logged-in DOM. Class names are build-hashed but keep semantic
 *  styled-component suffixes (…--DivSideNavPlaceholderContainer); data-e2e
 *  hooks are TikTok's own test ids. Layout: #app-header (logo, search,
 *  upload, inbox, top-dm-icon) + BaseBodyContainer > [SideNavPlaceholder,
 *  #main-content-messages (dm-new-chatbox, dm-new-conversation-list)]. */

/** Messages icon in the top header — its badge text is the unread total.
 *  Kept countable while the header is display:none (textContent survives). */
const BADGE = '[data-e2e="top-dm-icon"]';

/** The messages surface is mounted: a conversation is open (chatbox), or the
 *  DM drawer is up with nothing in it (zero conversations, 2026-08-29 — no
 *  #main-content-messages renders then). Gates both the chrome CSS and
 *  ready(), so login/captcha pages — which mount neither — stay untouched. */
const CHAT_MARKERS = '[data-e2e="dm-new-chatbox"], [class*="DivMessageDrawerContainer"]';
const CHAT = `body:has(${CHAT_MARKERS})`;

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
    html:has(${CHAT_MARKERS}), ${CHAT} {
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
  // a logged-out /messages bounces to a login page, which must keep the
  // waking cover up
  ready(doc) {
    return doc.querySelector(CHAT_MARKERS) !== null;
  },
  count(doc): Counts {
    const m = doc.querySelector(BADGE)?.textContent?.match(/\d+/); // "99+" → 99
    if (!m) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    return { direct: Number.parseInt(m[0], 10), indirect: 0 };
  },
  // TikTok web delegates to browser push, which Electron lacks (no FCM) —
  // synthesize from the first conversation row carrying a numeric badge.
  // Preview text has no data-e2e hook, so the banner is nickname-only.
  synthNotification(doc) {
    for (const row of doc.querySelectorAll('[data-e2e="dm-new-conversation-item"]')) {
      const badge = [...row.querySelectorAll('span, sup, div')].find((el) =>
        /^\d+\+?$/.test(el.textContent?.trim() ?? ''),
      );
      if (!badge) continue;
      const nickname = row.querySelector('[data-e2e="dm-new-conversation-nickname"]');
      if (!nickname) continue;
      return { title: textWithEmoji(nickname), body: '' };
    }
    return null;
  },
};

export default tiktok;
