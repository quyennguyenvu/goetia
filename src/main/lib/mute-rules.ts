import { SERVICES } from '../../shared/services';
import type { ServiceId } from '../../shared/types';

/** The earliest expiry among muted services and a timed global mute
 *  (`globalUntil`, 0 when none), or null when nothing is timed. A past expiry
 *  is returned as-is so the controller fires at once. */
export function nextMuteExpiry(
  muted: Record<ServiceId, boolean>,
  mutedUntil: Record<ServiceId, number>,
  _now: number,
  globalUntil = 0,
): number | null {
  let next: number | null = globalUntil > 0 ? globalUntil : null;
  for (const { id } of SERVICES) {
    const until = mutedUntil[id];
    if (!muted[id] || until <= 0) continue;
    if (next === null || until < next) next = until;
  }
  return next;
}

/** Muted services whose timed mute has run out, in catalog order. */
export function dueUnmutes(
  muted: Record<ServiceId, boolean>,
  mutedUntil: Record<ServiceId, number>,
  now: number,
): ServiceId[] {
  return SERVICES.map((s) => s.id).filter(
    (id) => muted[id] && mutedUntil[id] > 0 && mutedUntil[id] <= now,
  );
}

/** A timed global mute whose expiry has run out. */
export function globalMuteDue(globalMuted: boolean, until: number, now: number): boolean {
  return globalMuted && until > 0 && until <= now;
}
