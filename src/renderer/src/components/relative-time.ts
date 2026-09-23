/** `12s ago`, `4 min ago`, `2 h ago`, else a date — read at render time by
 *  panes that fetch once per open, so a stale label is at most as old as the
 *  pane on screen. (The switcher has its own terser `now` / `3 m` form.) */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}
