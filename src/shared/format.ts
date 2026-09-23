const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function unitFor(n: number): number {
  let i = 0;
  let v = Math.max(0, n);
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return i;
}

/** one decimal under ten, none above; bytes are always whole */
function inUnit(n: number, unit: number): string {
  const v = Math.max(0, n) / 1024 ** unit;
  if (unit === 0) return String(Math.round(v));
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

export function formatBytes(n: number): string {
  const u = unitFor(n);
  return `${inUnit(n, u)} ${UNITS[u]}`;
}

/** `48 of 77 MB`: both numbers in the total's unit so they compare at a
 *  glance; `48 MB so far` when Chromium does not know the total. */
export function formatProgress(received: number, total: number): string {
  if (total <= 0) return `${formatBytes(received)} so far`;
  const u = unitFor(total);
  return `${inUnit(received, u)} of ${inUnit(total, u)} ${UNITS[u]}`;
}

/** The row's file-type chip: the extension upper-cased and clipped to four
 *  characters, FILE for a name with none (README, .env). */
export function extensionChip(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename);
  if (!m || m.index === 0) return 'FILE';
  return m[1].toUpperCase().slice(0, 4);
}
