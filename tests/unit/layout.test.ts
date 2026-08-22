import { describe, expect, it } from 'vitest';
import { RAIL_HEIGHT, RAIL_WIDTH, sameBounds, viewBounds } from '../../src/main/lib/layout';

describe('viewBounds', () => {
  it('left rail: fills everything right of it', () => {
    expect(viewBounds(1280, 820, 'left')).toEqual({
      x: RAIL_WIDTH,
      y: 0,
      width: 1280 - RAIL_WIDTH,
      height: 820,
    });
  });
  it('right rail: fills everything left of it', () => {
    expect(viewBounds(1280, 820, 'right')).toEqual({
      x: 0,
      y: 0,
      width: 1280 - RAIL_WIDTH,
      height: 820,
    });
  });
  it('top bar: fills everything below it', () => {
    expect(viewBounds(1280, 820, 'top')).toEqual({
      x: 0,
      y: RAIL_HEIGHT,
      width: 1280,
      height: 820 - RAIL_HEIGHT,
    });
  });
  it('never returns negative dimensions', () => {
    expect(viewBounds(40, 600, 'left').width).toBe(0);
    expect(viewBounds(1280, 30, 'top').height).toBe(0);
  });
});

// B4: layout() wrote bounds to every live view plus the overlay on every call,
// including hidden and hibernating ones, usually with bounds they already had.
// scheduleLayout fires every ~16ms during a drag-resize.
describe('sameBounds', () => {
  it('is true only when every edge matches', () => {
    const a = { x: 56, y: 0, width: 1224, height: 820 };
    expect(sameBounds(a, { ...a })).toBe(true);
    expect(sameBounds(a, { ...a, width: 1225 })).toBe(false);
    expect(sameBounds(a, { ...a, x: 0 })).toBe(false);
    expect(sameBounds(a, { ...a, y: 44 })).toBe(false);
    expect(sameBounds(a, { ...a, height: 0 })).toBe(false);
  });

  it('treats a null previous value as changed, so the first layout always applies', () => {
    expect(sameBounds(null, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
