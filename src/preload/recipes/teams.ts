import type { Counts } from '../../shared/types';
import { nameMatches } from '../lib/conversation-open';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** Microsoft Teams web client (teams.microsoft.com/v2/, personal accounts on
 *  teams.live.com/v2/). Calibrated against a live personal-account DOM
 *  (2026-09-06, `tests/fixtures/teams-chat.html`): the chat list is a Fluent
 *  tree whose chat rows are level-2 treeitems, named by a span id'd with the
 *  thread id. The URL stays `/v2/` whichever chat is open, so a pin can only
 *  ever find its way back by name — hence the conversation hooks. Teams fires
 *  its own HTML5 notifications, so no synthNotification. No css: the app bar
 *  stays as the site renders it and chatPaths does the containing (user
 *  decision, 2026-08-13). */

const LIST = '[data-tid="simple-collab-dnd-rail"]';
const ROW = '[role="treeitem"][data-item-type="chat"]';
const ROW_TITLE = 'span[id^="title-chat-list-item_"]';
const HEADER_TITLE = '[data-tid="chat-title"]';
/** a numbered badge never appeared in the capture — unverified guess */
const BADGE = '[data-tid="unread-count"], [class*="unreadCount"]';
/** Teams describes a row through aria-labelledby tokens naming hidden support
 *  texts ("Unread message", "Badged chat") */
const UNREAD_TOKENS = ['chat_list_unread_text', 'simple_collab_voiceover_badged_chat'];

const flat = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

function badgeCount(row: Element): number {
  const m = row.querySelector(BADGE)?.textContent?.match(/\d+/); // "9+" → 9
  return m ? Number.parseInt(m[0], 10) : 0;
}

function isUnread(row: Element): boolean {
  const tokens = (row.getAttribute('aria-labelledby') ?? '').split(/\s+/);
  return UNREAD_TOKENS.some((t) => tokens.includes(t));
}

/** The open chat, from the pane header. */
export function teamsConversation(doc: Document): string | null {
  const span = doc.querySelector(`${HEADER_TITLE} span[title]`);
  const name =
    flat(span?.getAttribute('title')) || flat(doc.querySelector(HEADER_TITLE)?.textContent);
  return name === '' ? null : name;
}

/** Click the chat row titled `name`. The click lands on the title span so it
 *  bubbles through every wrapper Teams may listen on; titles only — a row's
 *  preview can name another chat's member. */
export function openTeamsConversation(doc: Document, name: string): boolean {
  for (const row of doc.querySelectorAll(ROW)) {
    const title = row.querySelector(ROW_TITLE);
    if (!title || !nameMatches(flat(title.textContent), name)) continue;
    (title as HTMLElement).click();
    return true;
  }
  return false;
}

const teams: Recipe = {
  id: 'teams',
  intervalMs: 2000,
  // chat only: one pathname, every surface in the fragment. Both spellings are
  // in use — #/chat for the list, #/conversations/<thread> for a deep link.
  chatPaths: ['/v2/#/chat', '/v2/#/conversations'],
  conversation: teamsConversation,
  openConversation: openTeamsConversation,
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
