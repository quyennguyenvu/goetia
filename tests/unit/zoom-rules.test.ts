import { describe, expect, it } from 'vitest';
import { clampZoom, stepZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/main/lib/zoom-rules';

describe('clampZoom', () => {
  it('passes finite in-range levels through', () => {
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(0)).toBe(0);
  });
  it('coerces corrupt values to 0', () => {
    expect(clampZoom(Number.NaN)).toBe(0);
    expect(clampZoom('2')).toBe(0);
    expect(clampZoom(undefined)).toBe(0);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it('clamps out-of-range levels to the bounds', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(-99)).toBe(ZOOM_MIN);
  });
});

describe('stepZoom', () => {
  it('steps by 0.5 in either direction', () => {
    expect(stepZoom(0, 1)).toBe(0.5);
    expect(stepZoom(0, -1)).toBe(-0.5);
  });
  it('saturates at the bounds', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
  it('treats a corrupt current level as 0', () => {
    expect(stepZoom(Number.NaN, 1)).toBe(0.5);
  });
});
