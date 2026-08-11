import type { ServiceId, ServiceMeta, Settings } from './types';

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

/** Catalog ids in display-name order — the Unbound order, and the order new
 *  arrivals append in. */
export function byName(services: readonly ServiceMeta[]): ServiceId[] {
  return [...services].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.id);
}

/** Unbound filter. Deliberately not the quick switcher's fuzzyScore: that ranks
 *  candidates for a jump-to, where a stray match costs one glance. This filters
 *  a grid the user is looking at, where "tg" surfacing Instagram alongside
 *  Telegram reads as a bug. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length === 0 || name.toLowerCase().includes(q);
}

/** Order after a welcome-screen confirm. Newly summoned ids move to the end so
 *  an arrival lands where the user last looked; a banished id keeps its slot,
 *  and appends like any other arrival if it returns. `named` supplies the
 *  arrival order when several are summoned at once — the order they were
 *  sitting in under Unbound, since a Set carries no click order. */
export function summonOrder(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
  named: ServiceId[],
): ServiceId[] {
  const added = named.filter((id) => selected.has(id) && !enabled.has(id));
  if (added.length === 0) return [...order];
  const moved = new Set(added);
  return [...order.filter((id) => !moved.has(id)), ...added];
}

export interface WelcomeSections {
  summoned: ServiceId[];
  unbound: ServiceId[];
}

/** Partition for the Home picker. Summoned follows `order` — that list is the
 *  rail. Unbound follows `named`, because an unchosen pool has no meaningful
 *  order and a stable one is worth more than a mirrored one. Keyed on the LIVE
 *  enabled set, never the staged selection: a tile must not move out from under
 *  the cursor mid-edit, so sections re-sort only once a confirm lands. */
export function welcomeSections(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  named: ServiceId[],
): WelcomeSections {
  return {
    summoned: order.filter((id) => enabled.has(id)),
    unbound: named.filter((id) => !enabled.has(id)),
  };
}
