import type { Counts } from '../../shared/types';
import { nameMatches } from '../lib/conversation-open';
import { isUnreadRow, rowTexts } from './meta-unread';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** Instagram Direct (instagram.com/direct/inbox), calibrated against the live
 *  logged-in DOM 2026-08-29. The thread list is the one role=navigation inside
 *  main; its rows are role=button with NO href and no per-thread URL, so the
 *  open thread is the aria-pressed row and opening one is a click, never a
 *  navigation. Unread rows share Meta's markers (meta-unread.ts): bold name
 *  and preview, a blue dot whose clipped label reads "Unread". Never key on
 *  a[href*='/direct/t/'] — the only one on the page is the rail's Messages
 *  link, which repoints at a thread (and grows a badge) while something is
 *  unread and back to /direct/inbox/ once read. */
const THREAD_LIST = 'main [role="navigation"]';

/** Conversation rows: top-level buttons in the thread list carrying at least
 *  a name and a preview/presence line. Drops "Your note" and the compose
 *  button (one text each) and any control nested inside a row. */
function threadRows(doc: Document): Element[] {
  const list = doc.querySelector(THREAD_LIST);
  if (!list) return [];
  return [...list.querySelectorAll('[role="button"]')].filter(
    (row) =>
      !row.parentElement?.closest('[role="button"]') &&
      row.querySelectorAll('span[dir="auto"]').length >= 2,
  );
}

/** Replay a press on the row's name span; the handler may sit on any wrapper
 *  between it and the row, and a bubbling event crosses all of them. */
function pressRow(doc: Document, row: Element): void {
  const target = row.querySelector('span[dir="auto"]') ?? row;
  for (const type of ['mousedown', 'mouseup', 'click']) {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }),
    );
  }
}

/** The rail is position:fixed, so hiding it leaves its reserved width as a
 *  dead column, in two shapes: a rail-sized left margin/padding/offset on
 *  the content side (instagram's is `padding-inline-start: 72px`, whose
 *  computed value surfaces as padding-left in LTR), and a width shortfall
 *  (width: calc(100% - rail)) that strands blank space at the right edge
 *  once the offset is gone. The padded wrapper has been seen on the layout
 *  root, between it and main, and inside main — so walk main up to the
 *  root inclusive (the root holds only the hidden rail beside the content,
 *  its rail-sized padding is dead space too) plus the single-child wrapper
 *  spine below main. Zero any >=40px offset (rail is 72/244px,
 *  pane-internal paddings are far smaller) and stretch any element that
 *  under-fills its parent by >=40px. Idempotent: once fixed, neither
 *  threshold trips again. */
function reclaimRailSpace(doc: Document, main: Element, root: Element): void {
  const win = doc.defaultView;
  if (!win) return;
  const fix = (el: Element) => {
    const h = el as HTMLElement;
    const style = win.getComputedStyle(el);
    for (const prop of ['margin-left', 'padding-left', 'left', 'margin-right']) {
      if (Number.parseInt(style.getPropertyValue(prop), 10) >= 40) {
        h.style.setProperty(prop, '0px', 'important');
      }
    }
    const parent = el.parentElement;
    if (parent && parent.clientWidth - h.offsetWidth >= 40) {
      h.style.setProperty('width', '100%', 'important');
      h.style.setProperty('max-width', 'none', 'important');
    }
  };
  for (let el: Element | null = main; el; el = el.parentElement) {
    fix(el);
    if (el === root) break;
  }
  let el: Element = main;
  for (let depth = 0; depth < 8 && el.childElementCount === 1 && el.firstElementChild; depth++) {
    el = el.firstElementChild;
    fix(el);
  }
}

/** The last (main, root) pair reclaimRailSpace ran against — see hideChrome. */
let reclaimed: { main: Element; root: Element } | null = null;

const instagram: Recipe = {
  id: 'instagram',
  intervalMs: 2000,
  // chat only: everything outside /direct is feed/reels/profile surface.
  // Login flows (/accounts/login) never reach a chat path, so they are
  // never snapped back.
  chatPaths: ['/direct'],
  // chat only: off-chat in-page links (thread-header avatar/username →
  // profile, @mentions, shared posts) get pointer-events:none instead of
  // a jarring navigate-then-snapback; chatPaths stays the containment for
  // anything that still routes. Gated on the DM surface (the nav's own
  // /direct/ link counts, so an empty inbox is covered) so login and
  // challenge pages keep every link live. The nav rail itself is hidden
  // by hideChrome below — it has no stable selector.
  // .x132t2bv is Meta's StyleX atomic class for the rail-clearing padding
  // (one class = one declaration, hash derived from it, so it survives
  // rebuilds better than component classes — verified live 2026-08-11);
  // the structural reclaim in hideChrome is the fallback if it rotates.
  css: `
    body:has(a[href^='/direct/']) a[href^='/']:not([href^='/direct']) {
      pointer-events: none !important;
    }
    /* instagram pins html to overflow-y:scroll — an empty track beside the
       inbox forever. The DM surface fills the view; only its panes scroll. */
    html:has(a[href^='/direct/']), body:has(a[href^='/direct/']) {
      overflow: hidden !important;
    }
    body:has(a[href^='/direct/']) .x132t2bv {
      padding-inline-start: 0 !important;
    }
  `,
  // chat only: the left nav rail (home, reels, search, notifications,
  // create, profile) is all escape hatches. Its classes are build-hashed
  // and half its icons are role=button, so no static selector survives —
  // instead hide the branch that holds the DM *nav* link (one not inside
  // main) and sits beside main. Login pages render no main → untouched;
  // if the layout ever nests the nav inside main, this hides nothing
  // rather than risking the chat surface.
  hideChrome(doc) {
    const main = doc.querySelector('main, [role="main"]');
    if (!main) return [];
    const link = [...doc.querySelectorAll("a[href*='/direct/']")].find((a) => !main.contains(a));
    if (!link) return [];
    let el: Element = link;
    while (el.parentElement && !el.parentElement.contains(main)) el = el.parentElement;
    const root = el.parentElement;
    if (!root) return [];
    // reclaimRailSpace does getComputedStyle + forced layout on ~20 elements;
    // its writes are idempotent, so re-run it only when the (main, root) pair
    // changes (an SPA remount swaps the nodes and misses the memo) rather than
    // every 2s tick, hidden or not
    if (!(reclaimed && reclaimed.main === main && reclaimed.root === root && doc.contains(main))) {
      reclaimRailSpace(doc, main, root);
      reclaimed = { main, root };
    }
    return [el];
  },
  // a logged-out /direct/inbox bounces to the login page, which renders no
  // thread list — the waking cover must stay up there
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector(THREAD_LIST));
  },
  // the pin's row label: this site's title never names the thread
  conversation(doc) {
    const row = doc.querySelector(`${THREAD_LIST} [role="button"][aria-pressed="true"]`);
    return row ? (rowTexts(row)[0] ?? null) : null;
  },
  openConversation(doc, name) {
    for (const row of threadRows(doc)) {
      if (!nameMatches(rowTexts(row)[0] ?? '', name)) continue;
      pressRow(doc, row);
      return true;
    }
    return false;
  },
  count(doc): Counts {
    const win = doc.defaultView;
    const rows = threadRows(doc);
    if (rows.length === 0 || !win) {
      return { direct: unreadFromTitle(doc.title), indirect: 0 };
    }
    let direct = 0;
    for (const row of rows) {
      if (isUnreadRow(row, win)) direct++;
    }
    return { direct, indirect: 0 };
  },
  // the thread list, so the runner recounts only when a row changes
  watch(doc) {
    return doc.querySelector(THREAD_LIST);
  },
  // instagram delegates to browser push, which Electron can't receive. Rows
  // carry no href: the banner click falls back to plain activation.
  synthNotification(doc) {
    const win = doc.defaultView;
    if (!win) return null;
    for (const row of threadRows(doc)) {
      if (!isUnreadRow(row, win)) continue;
      const texts = rowTexts(row);
      if (texts.length === 0) return null;
      return { title: texts[0], body: texts[1] ?? '' };
    }
    return null;
  },
};

export default instagram;
