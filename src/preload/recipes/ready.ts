import type { Recipe } from './types';

export const READY_POLL_INTERVAL_MS = 250;
/** Give up polling once main's reveal timeout (10s) has surely fired; a
 *  later ready() cannot re-cover the current load, so polling on forever on
 *  a login wall only burns CPU. Buffer a few extra ticks. */
export const READY_POLL_MAX_ATTEMPTS = Math.ceil(10_000 / READY_POLL_INTERVAL_MS) + 4;

/** True when el is the page's topmost content at its center point.
 *  Boot splashes cover the real UI while it renders underneath — a plain
 *  existence check reveals too early (facebook server-renders chat rows
 *  behind its big-logo splash). Hit-testing unavailable or off-viewport
 *  (happy-dom in tests returns null) falls back to trusting presence. */
export function visiblyPresent(doc: Document, el: Element | null): boolean {
  if (!el) return false;
  if (typeof doc.elementFromPoint !== 'function') return true;
  const r = el.getBoundingClientRect();
  const hit = doc.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  if (!hit) return true;
  return el.contains(hit) || hit.contains(el);
}

/** Poll recipe.ready() until it turns true, then report once and stop.
 *  A throwing ready() counts as not-ready — main's reveal timeout is the
 *  backstop, so the page can never stay covered forever. */
export function startReadyPoll(
  recipe: Recipe,
  doc: Document,
  report: () => void,
  setIntervalFn: typeof setInterval = setInterval,
  clearIntervalFn: typeof clearInterval = clearInterval,
): void {
  const check = recipe.ready;
  if (!check) return;
  let attempts = 0;
  let stopped = false;
  const timer = setIntervalFn(() => {
    if (stopped) return;
    attempts++;
    let ok = false;
    try {
      ok = check(doc);
    } catch {
      // not ready; the timeout reveals eventually
    }
    if (ok) {
      stopped = true;
      clearIntervalFn(timer);
      report();
      return;
    }
    if (attempts >= READY_POLL_MAX_ATTEMPTS) {
      stopped = true;
      clearIntervalFn(timer);
    }
  }, READY_POLL_INTERVAL_MS);
}
