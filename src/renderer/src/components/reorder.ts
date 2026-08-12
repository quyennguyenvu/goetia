import type { ServiceId } from '../../../shared/types';

/** Rewrite `full` so that members of `subset` appear in `subset`'s order,
 *  leaving every non-member at the index it already holds. `Reorder.Group`
 *  only knows the tiles a surface renders, so the reordered visible ids have
 *  to be merged back into the catalog order that also carries disabled ones.
 *
 *  The `known` filter is load-bearing, not decoration: an id absent from
 *  `full` would still enter `slots` and advance the cursor, writing itself
 *  into a real service's position. */
export function applySubsetOrder(full: ServiceId[], subset: ServiceId[]): ServiceId[] {
  const known = new Set(full);
  const moved = subset.filter((id) => known.has(id));
  const slots = new Set(moved);
  let i = 0;
  return full.map((id) => (slots.has(id) ? moved[i++] : id));
}
