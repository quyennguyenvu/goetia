import { describe, expect, it } from 'vitest';
import { resolveClickPoint } from '../../src/main/lib/click-point';

const bounds = { width: 800, height: 600 };

describe('resolveClickPoint', () => {
  it('refuses non-number and non-finite coordinates', () => {
    expect(resolveClickPoint('a', 5, 1, bounds)).toBeNull();
    expect(resolveClickPoint(5, {}, 1, bounds)).toBeNull();
    expect(resolveClickPoint(Number.NaN, 5, 1, bounds)).toBeNull();
    expect(resolveClickPoint(5, Number.POSITIVE_INFINITY, 1, bounds)).toBeNull();
  });

  it('scales CSS px to view DIPs by the zoom factor', () => {
    expect(resolveClickPoint(100, 50, 1.2, bounds)).toEqual({ x: 120, y: 60 });
    expect(resolveClickPoint(100, 50, 1, bounds)).toEqual({ x: 100, y: 50 });
  });

  it('refuses a point outside the view, never clamps onto a neighbour', () => {
    expect(resolveClickPoint(900, 50, 1, bounds)).toBeNull();
    expect(resolveClickPoint(700, 50, 1.2, bounds)).toBeNull(); // 840 > 800 after zoom
    expect(resolveClickPoint(-1, 50, 1, bounds)).toBeNull();
  });

  it('accepts a point on the edge', () => {
    expect(resolveClickPoint(800, 600, 1, bounds)).toEqual({ x: 800, y: 600 });
  });
});
