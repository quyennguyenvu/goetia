import type { ServiceId } from '../../shared/types';

export interface PeekCandidate {
  id: ServiceId;
  disabled: boolean;
  neverHibernate: boolean;
  hasView: boolean;
  /** epoch ms of the last peek end or hibernation teardown; 0 = never */
  lastPeekEndedAt: number;
  /** this service's own interval (see peekInterval); falls back to the default */
  intervalMs?: number;
}

export const PEEK_INTERVAL_MS = 10 * 60_000;
export const PEEK_TIMEOUT_MS = 90_000;

/** Gap between one peek ending and the next candidate being picked. A peek is
 *  a full cold page load, and at boot every sleeping service is due at once —
 *  chaining them made the first minutes after launch a queue of back-to-back
 *  loads. Spreading them costs no badge freshness: the roster still warms up,
 *  just without the thundering herd. */
export const PEEK_STAGGER_MS = 5_000;

/** Longest a backed-off service's interval may grow to, as a multiple of the
 *  base: 10 min → 60 min. Past that a badge is stale enough to be misleading. */
export const PEEK_BACKOFF_MAX = 6;

/** How long this service waits before its next peek.
 *
 *  A peek costs a full cold page load, so a service that keeps reporting the
 *  same count is being loaded for nothing. Backing off spends badge freshness
 *  to save that, which is a trade only the user can make — hence `saver`, off
 *  by default, leaving the plain base interval exactly as it was. With it on,
 *  battery starts at the longest interval and AC earns its way there one quiet
 *  peek at a time. Any change in the count, or the user opening the service,
 *  resets `quietPeeks` to 0 (see HibernationController). */
export function peekInterval(opts: {
  base: number;
  quietPeeks: number;
  saver: boolean;
  onBattery: boolean;
}): number {
  if (!opts.saver) return opts.base;
  if (opts.onBattery) return opts.base * PEEK_BACKOFF_MAX;
  const quiet = Math.max(0, opts.quietPeeks);
  return opts.base * Math.min(2 ** quiet, PEEK_BACKOFF_MAX);
}

/** The next sleeping service due for a hidden peek, in rail order. Null while
 *  one is already peeking — peeks never stack renderers. */
export function pickPeek(
  candidates: PeekCandidate[],
  now: number,
  intervalMs: number,
  peekingId: ServiceId | null,
): ServiceId | null {
  if (peekingId !== null) return null;
  for (const c of candidates) {
    if (c.disabled || c.neverHibernate || c.hasView) continue;
    const due = c.intervalMs ?? intervalMs;
    if (c.lastPeekEndedAt === 0 || now - c.lastPeekEndedAt >= due) return c.id;
  }
  return null;
}
