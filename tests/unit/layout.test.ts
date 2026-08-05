import { describe, expect, it } from 'vitest';
import { RAIL_HEIGHT, RAIL_WIDTH, viewBounds } from '../../src/main/lib/layout';

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
