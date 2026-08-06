import type { Counts } from '../../shared/types';
import type { Recipe } from './types';

/** Floor between trusted keep-alive clicks, so a stuck modal can't cause a
 *  click storm (or fight another tab for the session every 2s). */
export const KEEPALIVE_MIN_INTERVAL_MS = 30_000;

export function startRecipe(
  recipe: Recipe,
  doc: Document,
  report: (c: Counts) => void,
  reportStale: () => void,
  reportKeepAlive?: (pt: { x: number; y: number }) => void,
  reportNotification?: (n: { title: string; body: string }) => void,
  setIntervalFn: typeof setInterval = setInterval,
  nowFn: () => number = Date.now,
): void {
  let last: Counts | null = null;
  let busy = false;
  let lastKeepAlive = Number.NEGATIVE_INFINITY;
  setIntervalFn(async () => {
    if (busy) return;
    busy = true;
    if (reportKeepAlive && recipe.keepAlive) {
      try {
        const pt = recipe.keepAlive(doc);
        if (pt && nowFn() - lastKeepAlive >= KEEPALIVE_MIN_INTERVAL_MS) {
          lastKeepAlive = nowFn();
          reportKeepAlive(pt);
        }
      } catch {
        // keep-alive is best-effort; counting below still decides staleness
      }
    }
    try {
      const counts = await recipe.count(doc);
      const rose = last !== null && counts.direct > last.direct;
      if (!last || counts.direct !== last.direct || counts.indirect !== last.indirect) {
        last = counts;
        report(counts);
      }
      if (rose && reportNotification && recipe.synthNotification && !doc.hasFocus()) {
        const n = recipe.synthNotification(doc);
        if (n) reportNotification(n);
      }
    } catch {
      reportStale();
    } finally {
      busy = false;
    }
  }, recipe.intervalMs);
}
