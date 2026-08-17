export type BannerClickAction =
  | { kind: 'show-only' }
  | { kind: 'activate' }
  | { kind: 'navigate'; url: string }
  | { kind: 'open-in-page'; href: string; url: string }
  | { kind: 'replay'; clickId: number };

/** What a banner click does. Lane B (href) beats lane A (replay) — a URL
 *  works whether the view lived or died; replay needs the page's JS alive.
 *  A live view routes in-page (a cross-document loadURL would reboot the
 *  SPA and raise the waking cover for a 1-2s thread switch); only a dead
 *  view gets the full navigate as its wake load. Every rejection falls
 *  through to plain activation, never worse than the pre-feature behavior. */
export function resolveBannerClick(input: {
  disabled: boolean;
  hasView: boolean;
  clickId?: number;
  href?: string;
  serviceUrl: string;
  chatPaths?: string[];
}): BannerClickAction {
  if (input.disabled) return { kind: 'show-only' };
  if (input.href !== undefined) {
    const url = conversationUrl(input.href, input.serviceUrl, input.chatPaths);
    if (url !== null) {
      return input.hasView
        ? { kind: 'open-in-page', href: input.href, url }
        : { kind: 'navigate', url };
    }
  }
  if (input.clickId !== undefined && input.hasView) {
    return { kind: 'replay', clickId: input.clickId };
  }
  return { kind: 'activate' };
}

/** The href resolved against the service URL, or null unless it stays on the
 *  service's origin and inside its chat surface (chatPaths prefixes, matched
 *  against pathname + hash like the runner's containment; the service URL's
 *  own pathname when no chatPaths are declared). */
function conversationUrl(
  href: string,
  serviceUrl: string,
  chatPaths: string[] | undefined,
): string | null {
  let url: URL;
  try {
    url = new URL(href, serviceUrl);
  } catch {
    return null;
  }
  const base = new URL(serviceUrl);
  if (url.origin !== base.origin) return null;
  const path = url.pathname + url.hash;
  const prefixes = chatPaths ?? [base.pathname];
  return prefixes.some((p) => path.startsWith(p)) ? url.toString() : null;
}
