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

/** Consecutive skipped ticks before a count is forced anyway. The observer is
 *  a cost optimization and nothing else: if it ever goes deaf, this bounds the
 *  damage to latency (5 × ~2s = ~10s) rather than a badge that stops moving or
 *  a banner that never fires. Kept small on purpose — Meta services synthesize
 *  their notifications from this count, so it is not a place to be clever. */
export const FORCE_RECOUNT_TICKS = 5;

export function startRecipe(
  recipe: Recipe,
  doc: Document,
  report: (c: Counts) => void,
  reportStale: () => void,
  reportKeepAlive?: (pt: { x: number; y: number }) => void,
  reportNotification?: (n: { title: string; body: string; href?: string }) => void,
  navigate?: (url?: string) => void,
  setIntervalFn: typeof setInterval = setInterval,
  nowFn: () => number = Date.now,
  countTimeoutMs: number = COUNT_TIMEOUT_MS,
): void {
  let last: Counts | null = null;
  let stale = false;
  let busy = false;
  let lastKeepAlive = Number.NEGATIVE_INFINITY;
  let lastSnapBack = Number.NEGATIVE_INFINITY;
  let sentToLogin = false;
  let wasInChat = false;
  // recount gating: a quiet list is not worth re-sweeping every tick
  let dirty = true;
  let skipped = 0;
  let watched: Node | null = null;
  let observer: MutationObserver | null = null;
  let lastTitle: string | undefined;

  /** Point the observer at the current subtree, re-binding when the page has
   *  swapped it out (virtualized lists replace their container wholesale). A
   *  re-target always marks dirty: the new subtree has not been counted. */
  const retarget = (): void => {
    if (!recipe.watch) return;
    const Observer = (doc.defaultView as (Window & typeof globalThis) | null)?.MutationObserver;
    if (!Observer) return; // no observer available: count every tick, as before
    let target: Node | null = null;
    try {
      target = recipe.watch(doc);
    } catch {
      target = null; // a throwing watch() must never stop the counting below
    }
    if (target === watched && (!target || doc.contains(target))) return;
    watched = target;
    dirty = true;
    observer?.disconnect();
    observer = null;
    if (!target) return;
    observer = new Observer(() => {
      dirty = true;
    });
    observer.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  };

  setIntervalFn(async () => {
    if (busy) return;
    busy = true;
    // chat containment: SPA routing off every chatPaths prefix after the
    // document has been on one means the user (or a CTA) left chat — go back.
    if (navigate && recipe.chatPaths) {
      // hash included: teams routes every surface off one pathname (/v2/#/chat
      // vs /v2/#/calendar). Pathname-only prefixes are unaffected — an empty
      // hash appends nothing.
      const path = (doc.location?.pathname ?? '') + (doc.location?.hash ?? '');
      if (recipe.chatPaths.some((p) => path.startsWith(p))) {
        wasInChat = true;
      } else if (wasInChat && nowFn() - lastSnapBack >= SNAPBACK_MIN_INTERVAL_MS) {
        lastSnapBack = nowFn();
        wasInChat = false;
        navigate();
      }
    }
    // logged-out shell with no sign-in form: land on the login page instead.
    // Once per document — the navigation replaces this document anyway — and
    // never inside the snap-back floor, so a /login → logged-out bounce
    // (captcha, expired cookie) can loop no faster than containment does.
    if (
      navigate &&
      recipe.loginUrl &&
      !sentToLogin &&
      nowFn() - lastSnapBack >= SNAPBACK_MIN_INTERVAL_MS
    ) {
      let target: string | null = null;
      try {
        target = recipe.loginUrl(doc);
      } catch {
        target = null; // a throwing hook must never stop the counting below
      }
      if (target) {
        sentToLogin = true;
        lastSnapBack = nowFn();
        navigate(target);
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
    // The count itself: skipped only while an observer is live and neither the
    // watched subtree nor the title has moved. A new message necessarily
    // mutates the DOM count() reads it from — if it didn't, count() could not
    // have seen it either — and the title is checked because the "(n)" badge
    // fallback lives outside any thread list.
    retarget();
    if (doc.title !== lastTitle) dirty = true;
    if (observer && !dirty && skipped < FORCE_RECOUNT_TICKS) {
      skipped++;
      busy = false;
      return;
    }
    skipped = 0;
    dirty = false;
    lastTitle = doc.title;
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
