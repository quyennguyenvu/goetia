export const RELOAD_MIN_INTERVAL_MS = 1_000;

/** A user reload is dropped while the service is still waking, and while the
 *  previous one is younger than the floor — held-down F5 auto-repeats faster
 *  than `waking` can round-trip back from did-start-navigation. */
export function reloadAllowed(o: {
  waking: boolean;
  lastReloadAt: number | undefined;
  now: number;
}): boolean {
  if (o.waking) return false;
  return o.lastReloadAt === undefined || o.now - o.lastReloadAt >= RELOAD_MIN_INTERVAL_MS;
}
