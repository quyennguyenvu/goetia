/** A banner's in-page click handler must survive long enough to be clicked —
 *  no view teardown this close behind a shown banner. */
export const BANNER_GRACE_MS = 120_000;

export interface HibernationCandidate {
  active: boolean;
  hibernated: boolean;
  neverHibernate: boolean;
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
  if (s.active || s.hibernated || s.neverHibernate) return false;
  if (now - s.lastBannerAt < graceMs) return false;
  return now - s.lastActiveAt >= timeoutMinutes * 60_000;
}
