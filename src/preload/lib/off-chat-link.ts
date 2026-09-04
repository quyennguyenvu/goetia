/** The URL a click should be diverted to the OS browser, or null to leave the
 *  click alone. Chat only: a link that leaves the chat surface belongs in a
 *  browser, not in a view that runs unsandboxed with the recipe preload — and
 *  no host rule can refuse it, because a Messenger thread linking to
 *  `facebook.com/share/p/…` is the service's own origin (reported 2026-09-04).
 *
 *  Three guards keep this from eating navigations the app needs.
 *  1. Only services that declare `chatPaths` — the sites that are more than
 *     chat — take part. On a chat-only site same-origin means still in the
 *     app, and the service URL's own path is no substitute: Discord's is
 *     `/channels/@me`, so every other server's channel would read as off-chat.
 *  2. It only ever fires while the document IS in chat. A login, checkpoint or
 *     captcha page is never on a chat path, so no sign-in flow can be taken
 *     out of the app — the same reasoning as the runner's snap-back.
 *  3. A targeted anchor is left to `window.open`, whose handler already
 *     decides between the browser, a call popup and a sign-in popup; a
 *     download is left to Chromium. */
export function offChatLinkUrl(opts: {
  target: EventTarget | null;
  /** doc.location.href */
  here: string;
  serviceUrl: string;
  chatPaths?: string[];
}): string | null {
  const prefixes = opts.chatPaths;
  if (!prefixes || prefixes.length === 0) return null;
  const el = opts.target as Element | null;
  const anchor = typeof el?.closest === 'function' ? el.closest('a[href]') : null;
  if (!anchor || anchor.hasAttribute('download')) return null;
  const target = anchor.getAttribute('target');
  if (target && target !== '_self') return null;
  const raw = anchor.getAttribute('href') ?? '';
  if (raw === '' || raw.startsWith('#')) return null;

  const base = parse(opts.serviceUrl);
  const here = parse(opts.here);
  const url = parse(raw, opts.here);
  if (!base || !here || !url) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const inChat = (u: URL) => prefixes.some((p) => `${u.pathname}${u.hash}`.startsWith(p));
  if (!inChat(here)) return null;
  if (url.origin === base.origin && inChat(url)) return null;
  return url.toString();
}

function parse(u: string, relativeTo?: string): URL | null {
  try {
    return new URL(u, relativeTo);
  } catch {
    return null;
  }
}
