/** The Downloads pane's search, one rule for the rows and the header count.
 *  Renderer-only state: the query is never persisted and never crosses IPC. */

/** NFC on both sides: macOS writes a file name decomposed (`e` + U+0301) while a
 *  keyboard types the composed `é`, so a byte-wise substring never met (2026-09-23). */
function fold(s: string): string {
  return s.normalize('NFC').toLowerCase();
}

/** Trimmed, NFC-normalised and lower-cased; empty means every row. */
export function normalizeDownloadQuery(raw: string): string {
  return fold(raw.trim());
}

/** Case-insensitive substring over the file name and the service's name,
 *  the two things a person remembers about a download. `query` comes from
 *  `normalizeDownloadQuery`. */
export function matchesDownloadQuery(
  row: { filename: string },
  serviceName: string,
  query: string,
): boolean {
  if (query === '') return true;
  return fold(row.filename).includes(query) || fold(serviceName).includes(query);
}
