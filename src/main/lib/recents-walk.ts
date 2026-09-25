import type { ServiceId } from '../../shared/types';
import { conversationKey, type RecentEntry } from './recents-rules';

/** ⌘⇧] / ⌘⇧[ walking ⌘K's Recent list. The keys are a snapshot: the row a
 *  press opens moves to the top of the live list, and stepping over the live
 *  order would make the second press land back where the first started. */
export interface Walk {
  /** row keys in ⌘K order at the first press, enabled services only */
  keys: string[];
  /** where the last press landed; null when the walk began off any row */
  cursor: string | null;
  /** past this the walk is over and the next press starts fresh */
  deadline: number;
}

/** Long enough to glance at a stop and keep going; short enough that a later
 *  lone press reads as "switch back" from the live order. */
export const WALK_TIMEOUT_MS = 4_000;

export function walkTargets(
  rows: readonly RecentEntry[],
  enabled: (id: ServiceId) => boolean,
): string[] {
  return rows.filter((r) => enabled(r.serviceId)).map(conversationKey);
}

/** Anchored on the on-screen row when it is listed; an on-screen conversation
 *  the store has not recorded yet is not in the list, so nothing to skip. */
export function beginWalk(keys: string[], onScreenKey: string | null, now: number): Walk {
  const cursor = onScreenKey !== null && keys.includes(onScreenKey) ? onScreenKey : null;
  return { keys, cursor, deadline: now + WALK_TIMEOUT_MS };
}

/** The key after (step 1, older) or before (step -1, newer) the cursor,
 *  wrapping. No cursor, or one no longer listed, starts at the first going
 *  down and the last going up. A lone target that is the cursor itself is
 *  nothing to jump to. */
export function nextTarget(
  targets: readonly string[],
  cursor: string | null,
  step: 1 | -1,
): string | null {
  const n = targets.length;
  if (n === 0) return null;
  const at = cursor === null ? -1 : targets.indexOf(cursor);
  if (at < 0) return step > 0 ? targets[0] : targets[n - 1];
  if (n === 1) return null;
  return targets[(at + step + n) % n];
}

/** One press: what to open, and the walk as it stands afterwards. */
export function stepWalk(
  walk: Walk,
  step: 1 | -1,
  now: number,
): { walk: Walk; target: string | null } {
  const target = nextTarget(walk.keys, walk.cursor, step);
  return {
    walk: { ...walk, cursor: target ?? walk.cursor, deadline: now + WALK_TIMEOUT_MS },
    target,
  };
}

export function walkActive(walk: Walk | null, now: number): walk is Walk {
  return walk !== null && now < walk.deadline;
}
