export interface OpenOptions {
  conversation?: string;
  /** the recipe's name-based opener; a point means "click here, trusted" */
  byName?: (doc: Document, name: string) => boolean | { x: number; y: number };
  /** hands a point to main for a trusted click — the site ignores synthetic ones */
  trustedClick?: (pt: { x: number; y: number }) => void;
  assign?: (url: string) => void;
}

/** Lane B on a live view: route in-page so the SPA never reboots and the
 *  waking cover never rises. A named conversation goes through the recipe's
 *  own opener first (WhatsApp: click the chat-list row) — for those sites
 *  the URL is the same for every thread, so nothing below could tell them
 *  apart. Then: already on the URL, nothing to do. Otherwise click the
 *  anchor that leads there — the newest-unread row a recipe extracted, or the
 *  sidebar link to a pinned thread — comparing origin + path + hash, with a
 *  trailing slash and the query string ignored, so "/t/1/" meets "/t/1?x".
 *  Only when no such anchor exists does this fall back to a full navigation. */
export function openConversationInPage(
  doc: Document,
  href: string,
  url: string,
  opts: OpenOptions = {},
): void {
  const assign = opts.assign ?? ((u: string) => doc.defaultView?.location.assign(u));
  if (opts.conversation && opts.byName) {
    const found = opts.byName(doc, opts.conversation);
    if (found === true) return;
    if (found) {
      opts.trustedClick?.(found);
      return;
    }
  }
  const here = doc.defaultView?.location.href ?? '';
  const target = urlKey(url, here);
  if (target !== null && target === urlKey(here, here)) return;
  const wanted = urlKey(href, here);
  for (const a of doc.querySelectorAll('a[href]')) {
    const attr = a.getAttribute('href') ?? '';
    const k = urlKey(attr, here);
    const hit = attr === href || (k !== null && (k === wanted || k === target));
    if (hit) {
      (a as HTMLElement).click();
      return;
    }
  }
  assign(url);
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
