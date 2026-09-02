/** Recipes compute keep-alive/open points from getBoundingClientRect (CSS px
 *  in the zoomed page); sendInputEvent wants view DIPs. The page shares the
 *  recipe preload's realm, so these numbers are attacker-reachable: a poisoned
 *  getBoundingClientRect could hand main a non-numeric coordinate (which the
 *  gin converter throws on — a fatal main-process error) or a point over some
 *  other element. Non-finite or out-of-view points are refused outright, never
 *  clamped onto a neighbour. */
export function resolveClickPoint(
  x: unknown,
  y: unknown,
  zoomFactor: number,
  bounds: { width: number; height: number },
): { x: number; y: number } | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const px = Math.round(x * zoomFactor);
  const py = Math.round(y * zoomFactor);
  if (px < 0 || py < 0 || px > bounds.width || py > bounds.height) return null;
  return { x: px, y: py };
}
