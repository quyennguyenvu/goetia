import type { OpenLane } from '../../shared/ipc';

/** How long main waits for the page to report which lane landed. The preload
 *  answers as soon as the chain settles (a WhatsApp virtual-list walk is the
 *  slow case, a few seconds at its page cap); a page that navigated away or
 *  died mid-open never answers, and the caller treats silence as no result. */
export const OPEN_REPLY_TIMEOUT_MS = 8_000;

const LANES: ReadonlySet<string> = new Set<OpenLane>([
  'replay',
  'name',
  'same',
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
