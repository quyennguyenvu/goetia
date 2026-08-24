import type { ServiceId, ServiceMeta, Settings } from './types';

/** Summoned services stop at nine because service accelerators do: ⌘/Ctrl+0
 *  is zoom's Actual Size (Home is ⌘/Ctrl+⇧+H) and Electron cannot bind
 *  CmdOrCtrl+10 (service-accelerator.ts). cap.test.ts keeps the two constants
 *  equal. */
export const MAX_SUMMONED = 9;

/** Whether picking `id` is blocked by the cap: the staged result is full and
 *  this tile is not part of it. Picked tiles stay live so a slot can be freed
 *  within the same edit. */
export function capBlocked(selected: ReadonlySet<ServiceId>, id: ServiceId): boolean {
  return selected.size >= MAX_SUMMONED && !selected.has(id);
}

/** Enforce the cap on a persisted enabled set: every enabled id past the
 *  ninth enabled position in `order` is disabled. A legal set comes back as
 *  the same reference with an empty `trimmed`. */
export function trimToCap(
  order: ServiceId[],
  disabled: Record<ServiceId, boolean>,
): { disabled: Record<ServiceId, boolean>; trimmed: ServiceId[] } {
  const enabled = order.filter((id) => !disabled[id]);
  if (enabled.length <= MAX_SUMMONED) return { disabled, trimmed: [] };
  const trimmed = enabled.slice(MAX_SUMMONED);
  const next = { ...disabled };
  for (const id of trimmed) next[id] = true;
  return { disabled: next, trimmed };
}

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
 *  service tears down a logged-in view, which deserves its own word. A pure
 *  reorder rides along silently with a summon/banish, but alone it still
 *  needs the button — the whole edit commits in one go. */
export function summonLabel(
  delta: SummonDelta,
  hasEnabled: boolean,
  orderChanged = false,
): { label: string; disabled: boolean } {
  const { add, remove } = delta;
  if (add.length > 0 && remove.length > 0) {
    return { label: `Summon ${add.length} · Banish ${remove.length}`, disabled: false };
  }
  if (add.length > 0) return { label: `Summon ${services(add.length)}`, disabled: false };
  if (remove.length > 0) return { label: `Banish ${services(remove.length)}`, disabled: false };
  if (orderChanged) return { label: 'Apply new order', disabled: false };
  return { label: hasEnabled ? 'No changes' : 'Pick a service to begin', disabled: true };
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

/** Full `settings.order` after a staged commit: the staged summoned sequence
 *  leads (it IS the rail the user just arranged), everything else follows in
 *  its existing relative order. */
export function commitOrder(order: ServiceId[], staged: ServiceId[]): ServiceId[] {
  const stagedSet = new Set(staged);
  return [...staged, ...order.filter((id) => !stagedSet.has(id))];
}

export interface WelcomeSections {
  summoned: ServiceId[];
  unbound: ServiceId[];
}

/** Partition for the Home picker, derived from the STAGED edit: the board is
 *  the edit. Summoned is the staged list verbatim — content and order both.
 *  Unbound follows `named`, because an unchosen pool has no meaningful order
 *  and a stable one is worth more than a mirrored one — a tile clicked out of
 *  Summoned flies back to its name slot. */
export function welcomeSections(staged: ServiceId[], named: ServiceId[]): WelcomeSections {
  const stagedSet = new Set(staged);
  return {
    summoned: [...staged],
    unbound: named.filter((id) => !stagedSet.has(id)),
  };
}

/** The staged list after the live summoned order changes under the board:
 *  a clean board (staged equals the previous live order) follows the new
 *  one, so a rail drag lands on the board without lighting the confirm; a
 *  dirty board keeps its edit untouched. */
export function followLiveOrder(
  staged: ServiceId[],
  prevLive: string,
  nextLive: ServiceId[],
): ServiceId[] {
  return staged.join(',') === prevLive ? [...nextLive] : staged;
}

/** A key over the enabled *membership*, deliberately order-insensitive.
 *  Home reseeds its staged selection whenever this changes, so joining ids in
 *  `settings.order` would make a drag-reorder discard the user's picks and
 *  clear the filter. Sorted, a reorder is invisible here and a summon or
 *  dispel still trips it. */
export function enabledKey(
  services: readonly ServiceMeta[],
  disabled: Record<ServiceId, boolean>,
): string {
  return services
    .filter((svc) => !disabled[svc.id])
    .map((svc) => svc.id)
    .sort()
    .join(',');
}
