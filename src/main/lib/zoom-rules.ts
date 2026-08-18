export const ZOOM_STEP = 0.5;
export const ZOOM_MIN = -3.5;
export const ZOOM_MAX = 3.5;

/** Chromium zoom level (factor = 1.2^level, so ±3.5 ≈ 53%–189%).
 *  Anything non-finite — a hand-mangled settings.json — resets to 0. */
export function clampZoom(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

export function stepZoom(level: unknown, dir: 1 | -1): number {
  return clampZoom(clampZoom(level) + dir * ZOOM_STEP);
}
