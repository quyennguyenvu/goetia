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

export interface SummonDelta {
  add: ServiceId[];
  remove: ServiceId[];
}

/** What a welcome-screen confirm would change, in rail order. */
export function summonDelta(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
): SummonDelta {
  return {
    add: order.filter((id) => selected.has(id) && !enabled.has(id)),
    remove: order.filter((id) => enabled.has(id) && !selected.has(id)),
  };
}

const services = (n: number): string => `${n} ${n === 1 ? 'service' : 'services'}`;

/** The confirm button names the change it is about to apply: banishing a
 *  service tears down a logged-in view, which deserves its own word. */
export function summonLabel(
  delta: SummonDelta,
  hasEnabled: boolean,
): { label: string; disabled: boolean } {
  const { add, remove } = delta;
  if (add.length > 0 && remove.length > 0) {
    return { label: `Summon ${add.length} · Banish ${remove.length}`, disabled: false };
  }
  if (add.length > 0) return { label: `Summon ${services(add.length)}`, disabled: false };
  if (remove.length > 0) return { label: `Banish ${services(remove.length)}`, disabled: false };
  return { label: hasEnabled ? 'No changes' : 'Summon 0 services', disabled: true };
}
