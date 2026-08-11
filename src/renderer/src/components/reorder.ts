import type { ServiceId } from '../../../shared/types';

/** Move `fromId` into `toId`'s slot. Splice semantics are the rail's original:
 *  `to` is resolved before the removal, so a forward move lands one slot short
 *  of the target's old index. The unknown-id guard is the one addition — the
 *  helper now has two callers and a -1 index would splice from the end. */
export function moveTo(ids: ServiceId[], fromId: ServiceId, toId: ServiceId): ServiceId[] {
  const next = [...ids];
  const from = next.indexOf(fromId);
  const to = next.indexOf(toId);
  if (from === -1 || to === -1) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
