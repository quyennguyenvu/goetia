import type { ServiceId, Settings } from './types';

/** Full disabled-record for a welcome-screen confirm: selected ids
 *  enabled, everything else disabled. Always covers every id in
 *  `order` — conf persists whole top-level objects. */
export function buildDisabledPatch(
  order: ServiceId[],
  selected: ReadonlySet<ServiceId>,
): Settings['disabled'] {
  return Object.fromEntries(order.map((id) => [id, !selected.has(id)])) as Settings['disabled'];
}
