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
    .map((r) => ({ r, score: fuzzyScore(opts.query, r.title) }))
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

export function relativeTime(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < 60_000) return 'now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h`;
  return `${Math.floor(d / 86_400_000)} d`;
}
