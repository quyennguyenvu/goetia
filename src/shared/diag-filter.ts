import type { DiagEntry, DiagTag } from './types';

/** Every tag the ring knows, in the order the pane's chips render. A Record
 *  keyed on DiagTag so adding a tag to the type without listing it here is a
 *  compile error — restoreEntries, the chips and the normaliser read this one
 *  table. */
const TAG_ORDER: Record<DiagTag, true> = {
  app: true,
  nav: true,
  open: true,
  identity: true,
  passkey: true,
  ipc: true,
  notifications: true,
  downloads: true,
  recipe: true,
  view: true,
  peek: true,
};
export const DIAG_TAGS = Object.keys(TAG_ORDER) as DiagTag[];
const TAG_SET: ReadonlySet<string> = new Set(DIAG_TAGS);

/** Bound on the query: it is renderer-supplied data that ends up in the
 *  report's header, so it is clipped before either use. */
export const DIAG_QUERY_MAX = 100;

export interface DiagFilter {
  /** empty means every tag */
  readonly tags: readonly DiagTag[];
  /** case-insensitive substring; whitespace-only means none */
  readonly query: string;
}

export const EMPTY_DIAG_FILTER: DiagFilter = { tags: [], query: '' };

export function isDiagTag(v: unknown): v is DiagTag {
  return typeof v === 'string' && TAG_SET.has(v);
}

/** What crossed IPC is data: known tags only, deduped into DIAG_TAGS order,
 *  the query trimmed and clipped, anything malformed the empty filter. */
export function normalizeDiagFilter(raw: unknown): DiagFilter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { tags: [], query: '' };
  const r = raw as Record<string, unknown>;
  const wanted = new Set<string>(Array.isArray(r.tags) ? r.tags.filter(isDiagTag) : []);
  const tags = DIAG_TAGS.filter((t) => wanted.has(t));
  const query = typeof r.query === 'string' ? r.query.trim().slice(0, DIAG_QUERY_MAX) : '';
  return { tags, query };
}

/** The text a query is tested against: `[tag] serviceId line`, the service
 *  id omitted when absent. Lower-cased once here so the pane and the report
 *  agree on every row. */
function haystack(e: DiagEntry): string {
  return `[${e.tag}]${e.serviceId ? ` ${e.serviceId}` : ''} ${e.line}`.toLowerCase();
}

export function matchesDiagFilter(entry: DiagEntry, filter: DiagFilter): boolean {
  if (filter.tags.length > 0 && !filter.tags.includes(entry.tag)) return false;
  const q = filter.query.trim().toLowerCase();
  return q === '' || haystack(entry).includes(q);
}

/** true when the filter can drop a row — what decides the `Filtered:` line
 *  and the Copy label */
export function diagFilterNarrows(filter: DiagFilter): boolean {
  return filter.tags.length > 0 || filter.query.trim() !== '';
}

/** `tag=nav,recipe · "zalo" · 12 of 87 lines`; tags or query left out when
 *  empty, the count always present */
export function describeDiagFilter(filter: DiagFilter, shown: number, total: number): string {
  const parts: string[] = [];
  if (filter.tags.length > 0) parts.push(`tag=${filter.tags.join(',')}`);
  const q = filter.query.trim();
  if (q !== '') parts.push(`"${q}"`);
  parts.push(`${shown} of ${total} lines`);
  return parts.join(' · ');
}
