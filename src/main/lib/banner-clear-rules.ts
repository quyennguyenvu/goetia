import { nameMatches } from '../../shared/name-key';
import type { ServiceMeta } from '../../shared/types';
import { type ActivityEntry, openHref } from './activity-log';
import { validatedConversationUrl } from './notification-click';
import { sameUrl } from './recents-rules';

/** How long a ready page's zero must stand before its banners go: three
 *  recipe ticks, so one empty read of a list mid-swap never clears. */
export const ZERO_DWELL_MS = 6_000;

/** How old a banner that can no longer open its chat may get. An hour, not
 *  zero: a click handle dies with its page, which for a sleeping service is
 *  minutes after the banner — still news, and a click still opens the service. */
export const DEAD_BANNER_MS = 60 * 60_000;
export const DEAD_SWEEP_MS = 5 * 60_000;

/** What main knows about one service's current document. */
export interface ZeroState {
  /** service:ready arrived since the last cross-document navigation */
  ready: boolean;
  /** this document's latest count is 0/0 */
  zero: boolean;
}

export const ZERO_IDLE: ZeroState = { ready: false, zero: false };

export type ZeroEvent =
  | { kind: 'ready' }
  | { kind: 'count'; direct: number; indirect: number }
  | { kind: 'stale' }
  | { kind: 'navigated' }
  | { kind: 'destroyed' };

/** arm: start the dwell; cancel: drop a pending one; none: leave it be */
export type ZeroEffect = 'arm' | 'cancel' | 'none';

const armed = (s: ZeroState): boolean => s.ready && s.zero;

/** A zero is believed only from a ready document that reported it itself:
 *  the runner sends its first count before the chat list renders, so every
 *  cold load, reload and wake opens with a 0/0 that means nothing. */
export function zeroStep(
  state: ZeroState,
  event: ZeroEvent,
): { state: ZeroState; effect: ZeroEffect } {
  let next: ZeroState;
  switch (event.kind) {
    case 'ready':
      next = { ...state, ready: true };
      break;
    case 'count':
      next = { ...state, zero: event.direct === 0 && event.indirect === 0 };
      break;
    case 'stale':
      next = { ...state, zero: false };
      break;
    default:
      // the document is gone, and both halves went with it
      next = ZERO_IDLE;
  }
  if (armed(next)) return { state: next, effect: armed(state) ? 'none' : 'arm' };
  return { state: next, effect: armed(state) ? 'cancel' : 'none' };
}

/** Whether a banner's entry belongs to the conversation now on screen. Exact
 *  by design: a wrong match removes a banner for a chat nobody has read — a
 *  prefix counts only for a label the Recent row clipped with an ellipsis. */
export function matchesSighting(
  entry: ActivityEntry,
  sighting: { label: string; url: string },
  serviceUrl: string,
): boolean {
  if (entry.conversation !== '' && nameMatches(entry.conversation, sighting.label)) {
    return true;
  }
  const href = openHref(entry);
  if (!href) return false;
  let url: string;
  try {
    url = new URL(href, serviceUrl).href;
  } catch {
    return false;
  }
  // a site whose address names no thread would match every chat this way
  if (sameUrl(url, serviceUrl)) return false;
  return sameUrl(url, sighting.url);
}

/** Whether a click on this entry's banner can still land in its chat: the
 *  page's own handle while that page lives, a URL that passes validation, or
 *  the name lane on a service whose banner title is the chat's name. */
export function canOpenChat(
  entry: ActivityEntry,
  meta: Pick<ServiceMeta, 'url' | 'chatPaths' | 'bannerTitleNamesConversation'>,
  hasView: boolean,
): boolean {
  if (meta.bannerTitleNamesConversation) return true;
  if (hasView && entry.clickId !== undefined) return true;
  const href = openHref(entry);
  return href !== undefined && validatedConversationUrl(href, meta.url, meta.chatPaths) !== null;
}

export function isDeadBanner(
  entry: ActivityEntry,
  meta: Pick<ServiceMeta, 'url' | 'chatPaths' | 'bannerTitleNamesConversation'>,
  hasView: boolean,
  now: number,
): boolean {
  return now - entry.at >= DEAD_BANNER_MS && !canOpenChat(entry, meta, hasView);
}
