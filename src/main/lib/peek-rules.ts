import type { ServiceId } from '../../shared/types';

export interface PeekCandidate {
  id: ServiceId;
  disabled: boolean;
  neverHibernate: boolean;
  hasView: boolean;
  /** epoch ms of the last peek end or hibernation teardown; 0 = never */
  lastPeekEndedAt: number;
}

export const PEEK_INTERVAL_MS = 10 * 60_000;
export const PEEK_TIMEOUT_MS = 90_000;

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
    if (c.lastPeekEndedAt === 0 || now - c.lastPeekEndedAt >= intervalMs) return c.id;
  }
  return null;
}
