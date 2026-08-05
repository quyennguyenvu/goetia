import type { RailPosition } from '../../shared/types';

export const RAIL_WIDTH = 56; // left/right rail
export const RAIL_HEIGHT = 44; // top bar

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
