import type { UpdateState } from '../../../shared/types';

/** Opening the Updates pane re-checks, so the card is never a stale cache of
 *  whatever the 24h poll last saw. Floored so flipping between panes cannot
 *  spend the unauthenticated GitHub rate limit. */
export const RECHECK_MIN_INTERVAL_MS = 60_000;

export function shouldAutoRecheck(
  now: number,
  lastAt: number | null,
  status: UpdateState['status'],
): boolean {
  if (status === 'checking') return false;
  // a failed check is exactly what the user reopened the pane to retry
  if (status === 'error') return true;
  return lastAt === null || now - lastAt >= RECHECK_MIN_INTERVAL_MS;
}

/** `latest` is the pending release itself — a check that finds nothing clears
 *  it — so the Download button survives a later failed or in-flight re-check. */
export function updatePending(u: UpdateState): boolean {
  return u.latest !== null;
}
