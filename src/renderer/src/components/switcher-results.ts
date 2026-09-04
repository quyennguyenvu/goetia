import type { ActivityEntryView, ServiceId } from '../../../shared/types';
import { fuzzyScore } from './fuzzy';

export const MAX_RECENTS = 8;

export interface SwitcherService {
  id: ServiceId;
  name: string;
}

/** The switcher's two sections from one query. Recents arrive newest-first
 *  from main; rows for since-disabled services are dropped so Enter is
 *  always actionable. Empty query keeps main's order and the user's rail
 *  order; a query fuzzy-ranks each section independently. */
export function switcherRows(opts: {
  query: string;
  recents: ActivityEntryView[];
  services: SwitcherService[];
}): { recents: ActivityEntryView[]; services: SwitcherService[] } {
  const enabled = new Set(opts.services.map((s) => s.id));
  const live = opts.recents.filter((r) => enabled.has(r.serviceId));
  if (opts.query.length === 0) {
    return { recents: live.slice(0, MAX_RECENTS), services: opts.services };
  }
  const recents = live
    // the sender counts as part of the row: "github" must find the channel
    // its alerts land in, which the title alone no longer names
    .map((r) => ({ r, score: fuzzyScore(opts.query, recentHaystack(r)) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECENTS)
    .map((x) => x.r);
  const services = opts.services
    .map((svc) => ({ svc, score: fuzzyScore(opts.query, svc.name) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.svc);
  return { recents, services };
}

function recentHaystack(r: ActivityEntryView): string {
  return r.author ? `${r.title} ${r.author}` : r.title;
}

export function relativeTime(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < 60_000) return 'now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h`;
  return `${Math.floor(d / 86_400_000)} d`;
}

/** ms until relativeTime() would read differently — the label's own granularity
 *  rather than an arbitrary interval, so the switcher re-renders on the boundary
 *  and not before. Floored at a second so a clock jump cannot spin it. */
export function msUntilLabelChange(at: number, now: number): number {
  const d = Math.max(0, now - at);
  const step = d < 3_600_000 ? 60_000 : d < 86_400_000 ? 3_600_000 : 86_400_000;
  return Math.max(1_000, step - (d % step));
}

/** Soonest label change across the shown rows, or null when there is nothing
 *  to tick — an empty list must not schedule a timer at all. */
export function nextLabelChange(ats: number[], now: number): number | null {
  if (ats.length === 0) return null;
  return Math.min(...ats.map((at) => msUntilLabelChange(at, now)));
}
