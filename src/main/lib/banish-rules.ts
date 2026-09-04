import type { ServiceId } from '../../shared/types';

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

/** The `lastUsedAt` record to persist alongside a disabled-set change, or null
 *  when the patch summons nothing. Summoning is the user choosing a service,
 *  so its unused clock restarts then — the sweep's own seeding only covers a
 *  service that was NEVER activated, which left one activated long ago and
 *  since banished due the instant it came back to the rail (2026-09-03). */
export function stampSummoned(opts: {
  order: ServiceId[];
  before: Record<ServiceId, boolean>;
  after: Record<ServiceId, boolean>;
  lastUsedAt: Record<ServiceId, number>;
  now: number;
}): Record<ServiceId, number> | null {
  const summoned = opts.order.filter((id) => opts.before[id] && !opts.after[id]);
  if (summoned.length === 0) return null;
  const next = { ...opts.lastUsedAt };
  for (const id of summoned) next[id] = opts.now;
  return next;
}
