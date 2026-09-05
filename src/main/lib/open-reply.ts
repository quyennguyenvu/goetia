import type { OpenLane } from '../../shared/ipc';
import { validatedConversationUrl } from './notification-click';

/** How long main waits for the page to report which lane landed. The preload
 *  answers as soon as the chain settles (a WhatsApp virtual-list walk is the
 *  slow case, a few seconds at its page cap); a page that navigated away or
 *  died mid-open never answers, and the caller treats silence as no result. */
export const OPEN_REPLY_TIMEOUT_MS = 8_000;

const LANES: ReadonlySet<string> = new Set<OpenLane>([
  'replay',
  'name',
  'same',
  'url',
  'anchor',
  'load',
  'miss',
]);

/** The page's answer, re-checked: it crossed from an unisolated renderer, so
 *  its shape and values are page-controlled until this passes. */
export function parseOpenReply(data: unknown): { lane: OpenLane; url: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { lane, url } = data as { lane?: unknown; url?: unknown };
  if (typeof lane !== 'string' || !LANES.has(lane) || typeof url !== 'string') return null;
  return { lane: lane as OpenLane, url };
}

/** What a landed replay teaches the row. Either the document moved and the
 *  page reports exactly where main sees it, or the page reports a URL the
 *  recipe minted for a thread the address bar never shows (Slack) — accepted
 *  only if it validates like a click-time href, and only if it is not where
 *  the document already was. Accepting the second grants nothing: a learned
 *  URL is re-validated on every open, and a page that wanted to steer its own
 *  rows onto a same-origin chat URL could already navigate there. */
export function learnedUrl(input: {
  before: string;
  after: string;
  reported: string;
  serviceUrl: string;
  chatPaths?: string[];
}): string | null {
  if (input.reported === input.before) return null;
  if (input.reported === input.after) return input.after;
  return validatedConversationUrl(input.reported, input.serviceUrl, input.chatPaths);
}
