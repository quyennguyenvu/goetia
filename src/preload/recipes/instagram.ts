import type { Counts } from '../../shared/types';
import { countUnreadRows, synthFromRows, watchRows } from './meta-unread';
import { visiblyPresent } from './ready';
import type { Recipe } from './types';

/** Instagram Direct (instagram.com/direct/inbox). Shares Meta's chat-list
 *  DOM language with facebook.com/messages (see meta-unread.ts), but the
 *  selectors are uncalibrated until a live login pass — count() falls back
 *  to the "(n)" title badge if the thread-link shape drifts. */
const THREAD_LINK = "a[href*='/direct/t/']";

// instagram renders thread rows as list items rather than facebook's grid
// rows; the link itself is the fallback when neither wrapper exists
const rowFor = (link: Element) => link.closest("[role='listitem'], [role='row']") ?? link;

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
    if (!el.parentElement) return [];
    reclaimRailSpace(doc, main, el.parentElement);
    return [el];
  },
  // a logged-out /direct/inbox bounces to the login page, which renders no
  // thread links — the waking cover must stay up there
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector(THREAD_LINK));
  },
  count(doc): Counts {
    return countUnreadRows(doc, THREAD_LINK, rowFor);
  },
  // same sweep as messenger's, so the same gating applies
  watch(doc) {
    return watchRows(doc, THREAD_LINK, rowFor);
  },
  synthNotification(doc) {
    return synthFromRows(doc, THREAD_LINK, rowFor);
  },
};

export default instagram;
