/** A banner a recipe builds for one unread conversation row. */
export interface SynthBanner {
  title: string;
  body: string;
  /** the conversation's own link, where the site has one */
  href?: string;
}

/** Rows remembered after they leave the list: read, or scrolled out of a
 *  virtualized one — the two look the same from here. */
export const SEEN_ROWS_MAX = 200;

/** The thread link where the site has one, else the name on the row. */
const keyOf = (row: SynthBanner): string => row.href ?? row.title;

/** The preview without a trailing "· 5m": a clock that shares the preview's
 *  element must never read as a message. */
const previewOf = (row: SynthBanner): string => row.body.replace(/\s*·[^·]{0,16}$/u, '');

/** Which unread row is news. A count of unread conversations cannot say: a
 *  second message in a chat that is already unread leaves it where it was, so
 *  the runner used to announce only the first (2026-11-13). */
export class UnreadRows {
  private seen = new Map<string, string>();

  /** The rows to announce, in list order: each whose preview changed since it
   *  was last seen and — when the count rose — each never seen. A rise no row
   *  accounts for (the same words again) falls back to the first row. A
   *  changed preview counts only once the page has `settled`: a cold load
   *  shows some encrypted threads a placeholder and fills the real preview in
   *  afterwards — and until then a rise announces one row, as it always
   *  did. Every row given is remembered, announced or not. */
  next(rows: readonly SynthBanner[], rose: boolean, settled: boolean): SynthBanner[] {
    const news: SynthBanner[] = [];
    for (const row of rows) {
      const key = keyOf(row);
      const preview = previewOf(row);
      const before = this.seen.get(key);
      if (before === undefined ? rose : settled && before !== preview) news.push(row);
      // re-inserted, so the cap below lets go of the rows longest unseen
      this.seen.delete(key);
      this.seen.set(key, preview);
    }
    for (const oldest of this.seen.keys()) {
      if (this.seen.size <= SEEN_ROWS_MAX) break;
      this.seen.delete(oldest);
    }
    if (news.length === 0 && rose && rows.length > 0) return [rows[0]];
    // a list that renders after the first count is a rise for every row in it
    return settled ? news : news.slice(0, 1);
  }
}
