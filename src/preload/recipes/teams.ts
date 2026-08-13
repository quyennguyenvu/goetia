import type { Counts } from '../../shared/types';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** Microsoft Teams work/school web client (teams.microsoft.com/v2/). Selectors
 *  follow Teams' own `data-tid` test hooks and are UNCALIBRATED against a live
 *  logged-in tenant (slack/tiktok precedent) — the fixtures are the oracle
 *  until a live login pass. Teams fires its own HTML5 notifications, so no
 *  synthNotification. No css: the app bar (Calendar, Calls, Communities) stays
 *  as the site renders it and chatPaths does the containing (user decision,
 *  2026-08-13). */

const LIST = '[data-tid="chat-list"], [data-tid="chat-list-container"]';
/** prefix match: rows are `chat-list-item` or `chat-list-item-<thread id>` */
const ROW = '[data-tid^="chat-list-item"]';
const BADGE = '[data-tid="unread-count"], [class*="unreadCount"]';
const UNREAD_MARK = '[data-tid="unread-indicator"]';

function badgeCount(row: Element): number {
  const m = row.querySelector(BADGE)?.textContent?.match(/\d+/); // "9+" → 9
  return m ? Number.parseInt(m[0], 10) : 0;
}

/** Unread without a count — Teams renders muted chats this way. */
function isUnread(row: Element): boolean {
  if (row.querySelector(UNREAD_MARK)) return true;
  return (row.getAttribute('class') ?? '').toLowerCase().includes('unread');
}

const teams: Recipe = {
  id: 'teams',
  intervalMs: 2000,
  // chat only: one pathname, every surface in the fragment. Both spellings are
  // in use — #/chat for the list, #/conversations/<thread> for a deep link.
  chatPaths: ['/v2/#/chat', '/v2/#/conversations'],
  // the chat list mounts under Teams' long boot splash, so hit-testing (not
  // mere presence) is what keeps the waking cover up
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector(LIST));
  },
  count(doc): Counts {
    const list = doc.querySelector(LIST) ?? doc;
    let direct = 0;
    let indirect = 0;
    for (const row of list.querySelectorAll(ROW)) {
      const n = badgeCount(row);
      if (n > 0) direct += n;
      else if (isUnread(row)) indirect++;
    }
    // the list virtualizes: unread chats scrolled out of view leave no row, and
    // the title carries the total Teams itself believes in
    if (direct === 0 && indirect === 0) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    return { direct, indirect };
  },
};
export default teams;
