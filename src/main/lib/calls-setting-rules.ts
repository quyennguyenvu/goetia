/** facebook's own refresh is a subscription; ours polls the page's store. */
export const CALLS_CHECK_INTERVAL_MS = 600_000;
/** main's ceiling on one executeJavaScript round trip; the page hook's is 4 s */
export const CALLS_CHECK_TIMEOUT_MS = 5_000;
/** Turn On is up to three 4 s page steps: facebook loads its settings code
 *  (never loaded on /messages), commits, then re-reads */
export const CALLS_TURN_ON_TIMEOUT_MS = 15_000;
/** a repeated service:ready asks for a fresh check no more often than this */
export const CALLS_READY_RECHECK_FLOOR_MS = 60_000;
/** a timed block's re-check lands this long after it ends */
export const CALLS_EXPIRY_SLACK_MS = 2_000;

export const CALLS_TURN_ON_FAILED = 'turning incoming calls on failed';

/** `unset`: not read yet for this watch — the first read of either kind notes */
export type CallsState = 'unset' | 'on' | 'off' | 'unreadable';

/** The page's answer as ServiceRuntime.callsOffUntil (0 = on, -1 = off
 *  indefinitely, epoch ms = off until then), or null when it is not a value
 *  facebook stores. The answer is page data: facebook keeps seconds, and an
 *  expired block is calls on. */
export function parseCallsBlocked(raw: unknown, now: number): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw === 0 || raw === -1) return raw;
  if (raw < 0) return null;
  const ms = raw * 1000;
  return ms > now ? ms : 0;
}

export function callsStateOf(until: number | null): CallsState {
  if (until === null) return 'unreadable';
  return until === 0 ? 'on' : 'off';
}

/** The Diagnostics line a change earns: the way into off or into unreadable
 *  only — a recovery is a success, and a success is not evidence. */
export function callsTransition(prev: CallsState, next: CallsState): string | null {
  if (next === prev) return null;
  if (next === 'off') return "incoming calls are off in Facebook's chat settings";
  if (next === 'unreadable') return "can't read Facebook's call setting";
  return null;
}

/** The interval, or just after a timed block that ends sooner, so the mark
 *  clears on time. */
export function nextCheckDelay(until: number, now: number): number {
  if (until > now) return Math.min(CALLS_CHECK_INTERVAL_MS, until - now + CALLS_EXPIRY_SLACK_MS);
  return CALLS_CHECK_INTERVAL_MS;
}
