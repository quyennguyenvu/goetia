/** Pin the Page Visibility API to "visible" and swallow visibilitychange.
 *  For sites (Zalo) that suspend or unmount their UI when backgrounded —
 *  a hidden WebContentsView must never look hidden to them. Runs in the
 *  unisolated preload, before any page script can grab the real values. */
export function installVisibilitySpoof(win: Window & typeof globalThis): void {
  const doc = win.document;
  const docProto = win.Document.prototype;
  Object.defineProperty(docProto, 'visibilityState', {
    get: () => 'visible',
    configurable: true,
  });
  Object.defineProperty(docProto, 'hidden', { get: () => false, configurable: true });
  // preload registers first, so capture + stopImmediatePropagation beats any
  // page listener (including on* property handlers) on the same targets
  const swallow = (e: Event) => e.stopImmediatePropagation();
  for (const type of ['visibilitychange', 'webkitvisibilitychange']) {
    doc.addEventListener(type, swallow, true);
    win.addEventListener(type, swallow, true);
  }
}
