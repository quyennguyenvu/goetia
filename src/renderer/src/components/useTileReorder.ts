import { useEffect, useRef, useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import { applySubsetOrder } from './reorder';

const DRAG_CURSOR = 'tile-dragging';

/** Drag-local ordering for a `Reorder.Group` of service tiles.
 *
 *  `Reorder.Group` is controlled and fires `onReorder` on every crossing, not
 *  on release — wired straight to `service:reorder` a single drag would send
 *  one settings write, one full broadcast and one app-menu rebuild per
 *  crossing. The drag therefore runs on a local draft and reaches main once.
 *
 *  @param liveIds the ids this surface renders, from broadcast state
 *  @param order   the full `settings.order`, including disabled ids */
export function useTileReorder(liveIds: ServiceId[], order: ServiceId[]) {
  const [draft, setDraft] = useState<ServiceId[] | null>(null);
  const keyAtDragStart = useRef('');
  const didDrag = useRef(false);
  const liveKey = liveIds.join(',');
  const shown = draft ?? liveIds;

  // Grabbing hand only while a drag is actually in flight — a tile at rest is a
  // button. It rides <body>, not the tile: Motion drags from window pointer
  // events, so mid-flight the pointer is often over a neighbour or the gap and a
  // tile-local rule would flicker.
  useEffect(() => () => document.body.classList.remove(DRAG_CURSOR), []);

  // The draft is NOT cleared on commit: that would render one frame of the
  // pre-drag order while the IPC round-trip is in flight, a visible snap-back
  // at the moment the drop is meant to take. It clears when the broadcast
  // lands — and because the arriving order equals the draft, clearing shows
  // nothing. Any *other* change to the order mid-drag trips the same
  // condition, so a stale draft can never fight the broadcast state.
  useEffect(() => {
    if (draft && liveKey !== keyAtDragStart.current) setDraft(null);
  }, [liveKey, draft]);

  return {
    shown,
    groupProps: { values: shown, onReorder: setDraft },
    itemProps: {
      // a fresh press is not yet a drag; without this a drag that ends off the
      // tile would leave the flag set and swallow the next genuine click
      onPointerDown: () => {
        didDrag.current = false;
      },
      onDragStart: () => {
        didDrag.current = true;
        keyAtDragStart.current = liveKey;
        document.body.classList.add(DRAG_CURSOR);
      },
      onDragEnd: () => {
        document.body.classList.remove(DRAG_CURSOR);
        if (shown.join(',') === keyAtDragStart.current) {
          setDraft(null);
          return;
        }
        window.goetia.send('service:reorder', {
          orderedIds: applySubsetOrder(order, shown),
        });
      },
    },
    /** true ⇒ this click is the tail of a drag and must be swallowed. Pointer
     *  drag does not suppress the trailing click the way HTML5 DnD did, and an
     *  unswallowed one activates the tile it was just dragged. */
    consumeDrag: () => {
      if (!didDrag.current) return false;
      didDrag.current = false;
      return true;
    },
  };
}
