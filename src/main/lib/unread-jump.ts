import type { Counts, ServiceId } from '../../shared/types';

/** What ⌘⇧] lands on: a recents row (a conversation the log knows) or, for
 *  a badge the log has no row for, the service itself. `key` is what the
 *  cursor remembers — `e:<entryId>` or `s:<serviceId>`. */
export interface UnreadTarget {
  key: string;
  entryId?: number;
  serviceId: ServiceId;
}

/** Recents rows of services that still have unread, newest first (the log's
 *  own order), then badge-only services in rail order — a badge with no row
 *  this session (messages that arrived while Goetia was closed, or a rotated
 *  log) is still reachable as its service. A service whose badge is clear has
 *  nothing unread to show, whatever it raised earlier. */
export function unreadTargets(
  rows: { id: number; serviceId: ServiceId }[],
  order: ServiceId[],
  unread: (id: ServiceId) => Counts,
): UnreadTarget[] {
  const hasUnread = (id: ServiceId) => {
    const c = unread(id);
    return c.direct + c.indirect > 0;
  };
  const onRail = new Set(order);
  const targets: UnreadTarget[] = [];
  const covered = new Set<ServiceId>();
  for (const r of rows) {
    if (!onRail.has(r.serviceId) || !hasUnread(r.serviceId)) continue;
    targets.push({ key: `e:${r.id}`, entryId: r.id, serviceId: r.serviceId });
    covered.add(r.serviceId);
  }
  for (const id of order) {
    if (!covered.has(id) && hasUnread(id)) targets.push({ key: `s:${id}`, serviceId: id });
  }
  return targets;
}

/** The target after (step 1) or before (step -1) the cursor, wrapping. No
 *  cursor, or one no longer listed, starts at the newest going forward and
 *  the last going back. A lone target that is the cursor itself is nothing
 *  to jump to. */
export function nextTarget(
  targets: UnreadTarget[],
  cursor: string | null,
  step: 1 | -1,
): UnreadTarget | null {
  const n = targets.length;
  if (n === 0) return null;
  const at = cursor === null ? -1 : targets.findIndex((t) => t.key === cursor);
  if (at < 0) return step > 0 ? targets[0] : targets[n - 1];
  if (n === 1) return null;
  return targets[(at + step + n) % n];
}
