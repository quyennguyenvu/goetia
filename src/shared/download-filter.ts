/** The Downloads pane's search, one rule for the rows and the header count.
 *  Renderer-only state: the query is never persisted and never crosses IPC. */

/** Trimmed and lower-cased; empty means every row. */
export function normalizeDownloadQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Case-insensitive substring over the file name and the service's name,
 *  the two things a person remembers about a download. */
export function matchesDownloadQuery(
  row: { filename: string },
  serviceName: string,
  query: string,
): boolean {
  if (query === '') return true;
  return row.filename.toLowerCase().includes(query) || serviceName.toLowerCase().includes(query);
}
