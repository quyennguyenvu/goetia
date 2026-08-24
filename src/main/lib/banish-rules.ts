/** Bounds for the "banish after (hours)" input; the settings store clamps
 *  persisted values to the same range. */
export const BANISH_MIN_HOURS = 1;
export const BANISH_MAX_HOURS = 720;

export interface BanishCandidate {
  disabled: boolean;
  active: boolean;
  /** kept-awake is pinned: the user chose it, so it is never trimmed */
  neverHibernate: boolean;
  /** the in-flight Light Sleep peek must run its course, never be yanked */
  peeking: boolean;
  /** epoch ms of the last activation; 0 = never stamped, never banishable */
  lastUsedAt: number;
}

export function shouldBanish(s: BanishCandidate, now: number, banishMs: number): boolean {
  if (s.disabled || s.active || s.neverHibernate || s.peeking) return false;
  if (s.lastUsedAt <= 0) return false;
  return now - s.lastUsedAt >= banishMs;
}
