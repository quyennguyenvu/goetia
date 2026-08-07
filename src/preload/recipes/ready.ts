import type { Recipe } from './types';

export const READY_POLL_INTERVAL_MS = 250;

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
  const timer = setIntervalFn(() => {
    let ok = false;
    try {
      ok = check(doc);
    } catch {
      // not ready; the timeout reveals eventually
    }
    if (!ok) return;
    clearIntervalFn(timer);
    report();
  }, READY_POLL_INTERVAL_MS);
}
