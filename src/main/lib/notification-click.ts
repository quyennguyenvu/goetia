export type BannerClickAction =
  | { kind: 'show-only' }
  | { kind: 'activate' }
  | { kind: 'navigate'; url: string }
  | {
      kind: 'open-in-page';
      clickId?: number;
      href?: string;
      url?: string;
      conversation?: string;
    };

/** What a banner, recents row or pin click does. A dead view can only be
 *  handed a URL as its wake load: the shim registry and the chat list it
 *  would replay or click into died with the document. A live view gets every
 *  lane it has in ONE action — the shim's clickId (the site's own onclick,
 *  which knows the thread id), the conversation name (a recipe row click),
 *  and the validated href — and the preload runs them in that order, moving
 *  on only when a lane reports a miss (see openConversationInPage). Main
 *  used to pick one lane blind; a replay whose handle the site had already
 *  closed then did nothing at all. Every rejection falls through to plain
 *  activation, never worse than the pre-feature behavior. */
export function resolveBannerClick(input: {
  disabled: boolean;
  hasView: boolean;
  clickId?: number;
  href?: string;
  /** the thread's name, where that is the only handle on it (a pin's label,
   *  or a banner title on a bannerTitleNamesConversation service) */
  conversation?: string;
  serviceUrl: string;
  chatPaths?: string[];
}): BannerClickAction {
  if (input.disabled) return { kind: 'show-only' };
  const url =
    input.href === undefined
      ? null
      : conversationUrl(input.href, input.serviceUrl, input.chatPaths);
  if (!input.hasView) return url === null ? { kind: 'activate' } : { kind: 'navigate', url };
  const action: BannerClickAction = { kind: 'open-in-page' };
  if (input.clickId !== undefined) action.clickId = input.clickId;
  if (url !== null) {
    action.href = input.href;
    action.url = url;
  }
  if (input.conversation) action.conversation = input.conversation;
  return Object.keys(action).length === 1 ? { kind: 'activate' } : action;
}

/** The href resolved against the service URL, or null unless it stays on the
 *  service's origin and inside its chat surface: the chatPaths prefixes,
 *  matched against pathname + hash like the runner's containment. A site with
 *  no chatPaths is chat-only, so same origin is the whole check — the service
 *  URL's own path was never a boundary (Discord's is /channels/@me while a
 *  server channel lives at /channels/<guild>/<channel>). */
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
  if (!chatPaths) return url.toString();
  const path = url.pathname + url.hash;
  return chatPaths.some((p) => path.startsWith(p)) ? url.toString() : null;
}
