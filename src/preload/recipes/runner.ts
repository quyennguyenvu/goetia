import type { Counts } from '../../shared/types';
import type { Recipe } from './types';

/** Floor between trusted keep-alive clicks, so a stuck modal can't cause a
 *  click storm (or fight another tab for the session every 2s). */
export const KEEPALIVE_MIN_INTERVAL_MS = 30_000;

/** A single count() must settle within this, or the tick is abandoned (busy
 *  released, staleness reported) so a hung IndexedDB read can't wedge polling. */
export const COUNT_TIMEOUT_MS = 8_000;

/** Floor between chat snap-backs, so a site that force-routes away from
 *  chat can't fight the containment every tick. */
export const SNAPBACK_MIN_INTERVAL_MS = 30_000;

export function startRecipe(
  recipe: Recipe,
  doc: Document,
  report: (c: Counts) => void,
  reportStale: () => void,
  reportKeepAlive?: (pt: { x: number; y: number }) => void,
  reportNotification?: (n: { title: string; body: string }) => void,
  snapBack?: () => void,
  setIntervalFn: typeof setInterval = setInterval,
  nowFn: () => number = Date.now,
  countTimeoutMs: number = COUNT_TIMEOUT_MS,
): void {
  let last: Counts | null = null;
  let stale = false;
  let busy = false;
  let lastKeepAlive = Number.NEGATIVE_INFINITY;
  let lastSnapBack = Number.NEGATIVE_INFINITY;
  let wasInChat = false;
  setIntervalFn(async () => {
    if (busy) return;
    busy = true;
    // chat containment: SPA routing off every chatPaths prefix after the
    // document has been on one means the user (or a CTA) left chat — go back.
    if (snapBack && recipe.chatPaths) {
      // hash included: teams routes every surface off one pathname (/v2/#/chat
      // vs /v2/#/calendar). Pathname-only prefixes are unaffected — an empty
      // hash appends nothing.
      const path = (doc.location?.pathname ?? '') + (doc.location?.hash ?? '');
      if (recipe.chatPaths.some((p) => path.startsWith(p))) {
        wasInChat = true;
      } else if (wasInChat && nowFn() - lastSnapBack >= SNAPBACK_MIN_INTERVAL_MS) {
        lastSnapBack = nowFn();
        wasInChat = false;
        snapBack();
      }
    }
    if (recipe.hideChrome) {
      try {
        for (const el of recipe.hideChrome(doc)) {
          const style = (el as HTMLElement).style;
          if (style && style.display !== 'none') style.display = 'none';
        }
      } catch {
        // chrome hiding is cosmetic; counting below still decides staleness
      }
    }
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
      const counts = await Promise.race([
        recipe.count(doc),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('count timeout')), countTimeoutMs),
        ),
      ]);
      const rose = last !== null && counts.direct > last.direct;
      if (!last || counts.direct !== last.direct || counts.indirect !== last.indirect) {
        last = counts;
        report(counts);
      }
      stale = false;
      if (rose && reportNotification && recipe.synthNotification && !doc.hasFocus()) {
        const n = recipe.synthNotification(doc);
        if (n) reportNotification(n);
      }
    } catch {
      if (!stale) {
        stale = true;
        reportStale();
      }
    } finally {
      busy = false;
    }
  }, recipe.intervalMs);
}
