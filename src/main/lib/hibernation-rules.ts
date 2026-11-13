/** A banner's in-page click handler must survive long enough to be clicked —
 *  no view teardown this close behind a shown banner. */
export const BANNER_GRACE_MS = 120_000;

/** The range Settings offers for "hibernate after (minutes)". */
export const HIBERNATE_MIN_MINUTES = 5;
export const HIBERNATE_MAX_MINUTES = 240;

export interface HibernationCandidate {
  active: boolean;
  hibernated: boolean;
  neverHibernate: boolean;
  /** a call window is open or a download is running: destroying the view
   *  would end the call and cancel the download */
  busy: boolean;
  lastActiveAt: number;
  /** epoch ms of the service's last shown banner; 0 = never */
  lastBannerAt: number;
}

export function shouldHibernate(
  s: HibernationCandidate,
  now: number,
  timeoutMinutes: number,
  graceMs: number = BANNER_GRACE_MS,
): boolean {
  if (s.active || s.hibernated || s.neverHibernate || s.busy) return false;
  if (now - s.lastBannerAt < graceMs) return false;
  return now - s.lastActiveAt >= timeoutMinutes * 60_000;
}
