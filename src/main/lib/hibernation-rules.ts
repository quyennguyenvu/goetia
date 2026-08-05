export interface HibernationCandidate {
  active: boolean;
  hibernated: boolean;
  neverHibernate: boolean;
  lastActiveAt: number;
}

export function shouldHibernate(
  s: HibernationCandidate,
  now: number,
  timeoutMinutes: number,
): boolean {
  if (s.active || s.hibernated || s.neverHibernate) return false;
  return now - s.lastActiveAt >= timeoutMinutes * 60_000;
}
