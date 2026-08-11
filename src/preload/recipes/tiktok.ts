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

const tiktok: Recipe = {
  id: 'tiktok',
  intervalMs: 2000,
  // chat only: everything outside /messages is the feed/profile surface
  chatPaths: ['/messages'],
  // chat only: the top header and the side-nav icon stacks are escape
  // hatches into the feed (home, explore, live, upload, profile) — hide
  // them. NEVER hide the side-nav container itself: its DivDrawerContainer
  // child hosts the DM conversation list. Gated on the DM chatbox so
  // login/captcha pages stay untouched. display:none keeps textContent
  // readable for count()'s badge probe. TUXTooltip: with the header gone,
  // its "Post video" nudge tooltip orphans at the viewport corner (portals
  // for dialogs/captcha are not tooltips and stay live). Rail reclaim:
  // the emptied nav rail is 72px, the drawer is fixed at left:72 (320px
  // wide), and the body flexbox justifies space-between — so collapse the
  // rail, pin the drawer to 0, and grow main by the measured 72px.
  css: `
    /* the DM surface fills the view; only its own panes scroll */
    html:has([data-e2e="dm-new-chatbox"]), body:has([data-e2e="dm-new-chatbox"]) {
      overflow: hidden !important;
    }
    body:has([data-e2e="dm-new-chatbox"]) #app-header,
    body:has([data-e2e="dm-new-chatbox"])
      [class*="DivSideNavContainer"] > [class*="DivFixedContentContainer"],
    body:has([data-e2e="dm-new-chatbox"])
      [class*="DivSideNavContainer"] > [class*="DivScrollingContentContainer"],
    body:has([data-e2e="dm-new-chatbox"]) [class*="DivAnimationCover"],
    body:has([data-e2e="dm-new-chatbox"]) .TUXTooltip-tooltip {
      display: none !important;
    }
    body:has([data-e2e="dm-new-chatbox"]) [class*="DivSideNavContainer"] {
      width: 0 !important;
      min-width: 0 !important;
      padding: 0 !important;
    }
    body:has([data-e2e="dm-new-chatbox"])
      [class*="DivSideNavContainer"] > [class*="DivDrawerContainer"] {
      left: 0 !important;
    }
    body:has([data-e2e="dm-new-chatbox"]) #main-content-messages {
      margin: 0 0 0 -72px !important;
      padding-top: 0 !important;
      width: calc(100% - 320px) !important;
      max-width: none !important;
    }
  `,
  // DM surface mounted — a logged-out /messages bounces to a login page,
  // which must keep the waking cover up
  ready(doc) {
    return doc.querySelector('[data-e2e="dm-new-chatbox"]') !== null;
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
