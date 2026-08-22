import type { RailPosition } from '../../shared/types';

export const RAIL_WIDTH = 56; // left/right rail
export const RAIL_HEIGHT = 44; // top bar

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every view and the loading overlay share one rect, so one comparison decides
 *  whether a layout pass has anything to do. A drag-resize runs scheduleLayout
 *  every ~16 ms, and most of those passes recompute the rect the views already
 *  hold. A null previous value always counts as changed. */
export function sameBounds(prev: ViewBounds | null, next: ViewBounds): boolean {
  if (!prev) return false;
  return (
    prev.x === next.x &&
    prev.y === next.y &&
    prev.width === next.width &&
    prev.height === next.height
  );
}

export function viewBounds(contentWidth: number, contentHeight: number, position: RailPosition) {
  if (position === 'top') {
    return {
      x: 0,
      y: RAIL_HEIGHT,
      width: contentWidth,
      height: Math.max(0, contentHeight - RAIL_HEIGHT),
    };
  }
  return {
    x: position === 'left' ? RAIL_WIDTH : 0,
    y: 0,
    width: Math.max(0, contentWidth - RAIL_WIDTH),
    height: contentHeight,
  };
}
