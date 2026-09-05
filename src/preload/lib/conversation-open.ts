import type { OpenLane, OpenRequest } from '../../shared/ipc';

export type Point = { x: number; y: number };

export interface OpenOptions {
  /** the shim's replay; false when the registry lost the id */
  replay?: (clickId: number) => boolean;
  /** the recipe's name-based opener; a point means "click here, trusted".
   *  May be async — a virtualized chat list has to be scrolled to render the
   *  row (WhatsApp). */
  byName?: (doc: Document, name: string) => MaybePromise<boolean | Point>;
  /** the recipe's URL opener, for a site whose document URL never names the
   *  thread (Slack): true when the thread is on screen, false for a miss */
  byUrl?: (doc: Document, url: string) => MaybePromise<boolean>;
  /** hands a point to main for a trusted click — the site ignores synthetic ones */
  trustedClick?: (pt: Point) => void;
  assign?: (url: string) => void;
}

type MaybePromise<T> = T | Promise<T>;

/** Open a thread on a live view, in-page, so the SPA never reboots and the
 *  waking cover never rises. The lanes run in order and each hands over only
 *  on a reported miss — main can't know that a shim handle is gone (the site
 *  closed its banner, the registry evicted it, the document was replaced),
 *  so picking one lane blind is what made recents rows silently do nothing.
 *
 *  1. replay: the site's own onclick, which knows the thread id.
 *  2. name: the recipe clicks the chat-list row (WhatsApp, Zalo) — first of
 *     the URL lanes, since for those sites every thread shares one URL.
 *  3. same: already on the URL, nothing to do.
 *  4. url: the recipe opens the URL in-page — Slack's thread lives in a
 *     flexpane the address bar never shows, so only a recipe click reaches
 *     it; a throw is a miss, not a failure of the chain.
 *  5. anchor: click the anchor that leads there — the newest-unread row a
 *     recipe extracted, or the sidebar link to a pinned thread — comparing
 *     origin + path + hash, trailing slash and query ignored, so "/t/1/"
 *     meets "/t/1?x".
 *  6. load: a full navigation, only when a URL exists. With none (a recents
 *     row on whatsapp/zalo) a miss stays put: reloading the chat list would
 *     be a strictly worse answer than doing nothing. */
export async function openConversationInPage(
  doc: Document,
  req: OpenRequest,
  opts: OpenOptions = {},
): Promise<OpenLane> {
  if (req.clickId !== undefined && opts.replay?.(req.clickId)) return 'replay';
  if (req.conversation && opts.byName) {
    const found = await opts.byName(doc, req.conversation);
    if (found === true) return 'name';
    if (found) {
      opts.trustedClick?.(found);
      return 'name';
    }
  }
  if (req.href === undefined || req.url === undefined) return 'miss';
  const assign = opts.assign ?? ((u: string) => doc.defaultView?.location.assign(u));
  const here = doc.defaultView?.location.href ?? '';
  const target = urlKey(req.url, here);
  if (target !== null && target === urlKey(here, here)) return 'same';
  if (opts.byUrl) {
    let opened = false;
    try {
      opened = await opts.byUrl(doc, req.url);
    } catch {
      opened = false; // a recipe opener that throws on a changed DOM is a miss
    }
    if (opened) return 'url';
  }
  const wanted = urlKey(req.href, here);
  for (const a of doc.querySelectorAll('a[href]')) {
    const attr = a.getAttribute('href') ?? '';
    const k = urlKey(attr, here);
    const hit = attr === req.href || (k !== null && (k === wanted || k === target));
    if (hit) {
      (a as HTMLElement).click();
      return 'anchor';
    }
  }
  assign(req.url);
  return 'load';
}

/** Comparison key for `u` against `base`: origin + pathname without its
 *  trailing slash + hash. Null when neither makes a URL (about:blank
 *  documents, mailto anchors). */
export function urlKey(u: string, base: string): string | null {
  try {
    const x = new URL(u, base);
    return `${x.origin}${x.pathname.replace(/\/+$/, '')}${x.hash}`;
  } catch {
    return null;
  }
}

/** A pin's conversation label may have been clamped to PIN_CONVERSATION_MAX
 *  with an ellipsis; the live name never is, so a clamped label matches on
 *  its prefix. */
export function nameMatches(candidate: string, pinned: string): boolean {
  if (candidate === pinned) return true;
  return pinned.endsWith('…') && pinned.length > 1 && candidate.startsWith(pinned.slice(0, -1));
}
