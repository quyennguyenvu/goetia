/** Collapse a burst of calls into one, on the microtask queue.
 *
 *  The state broadcast fans out into a snapshot, a structured clone across IPC,
 *  a dock badge, a tray tooltip, an overlay sync and a full renderer re-render.
 *  Handlers that touch several services in a loop (banishing on Home, say) paid
 *  all of that per iteration. Deferring by a microtask keeps it inside the same
 *  frame while making a burst cost one pass — the same report-on-change
 *  discipline setRuntime already applies, one level further out. */
export function coalesce(fn: () => void, schedule = queueMicrotask): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      // cleared before the call, so a throwing fn cannot wedge every later one
      scheduled = false;
      fn();
    });
  };
}
