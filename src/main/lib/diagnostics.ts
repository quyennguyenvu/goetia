import {
  type DiagFilter,
  describeDiagFilter,
  diagFilterNarrows,
  EMPTY_DIAG_FILTER,
  isDiagTag,
  matchesDiagFilter,
} from '../../shared/diag-filter';
import { SERVICES } from '../../shared/services';
import type { Counts, DiagEntry, DiagTag, ServiceId, Settings } from '../../shared/types';

/** Bound on the ring. A page that provokes refusals in a loop rotates it and
 *  cannot grow it; the NavigationAudit dedupe in front of the [nav] lines
 *  already keeps one origin from repeating. */
export const DIAG_CAP = 200;
/** Bound on one line — a page-fed detail (a recipe's error message) is
 *  clipped twice, here and in sanitizeDetail, so neither can bloat the ring. */
export const DIAG_LINE_MAX = 300;
export const DIAG_DETAIL_MAX = 160;

const SERVICE_IDS: ReadonlySet<string> = new Set(SERVICES.map((s) => s.id));

export interface ReportHeader {
  version: string;
  electron: string;
  platform: string;
  arch: string;
  /** os.release() — the kernel version, enough to tell macOS 15 from 26 */
  os: string;
  startedAt: number;
  now: number;
  /** enabled services in rail order */
  enabled: readonly ServiceId[];
  settings: string;
  /** one serviceSnapshotLine per enabled service, taken at copy time */
  services: readonly string[];
}

/** Origin plus path: a contained login redirect can carry a token in its
 *  query, and the whole point of the ring is to be copied and sent. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url; // unparseable: still evidence, and carries no query to leak
  }
}

/** `host/path` for a line's trailing " · on …": the scheme says nothing. */
function pageLabel(url: string): string {
  const redacted = redactUrl(url);
  return redacted.replace(/^https?:\/\//, '');
}

/** Append where the page was when it happened — a stale recipe on a login
 *  page and one in chat are different bugs. `page` is a raw URL or null for
 *  a view that is asleep. */
export function withPage(line: string, page: string | null): string {
  return page ? `${line} · on ${pageLabel(page)}` : line;
}

/** A detail that crossed IPC from a page (a recipe's thrown message) is
 *  attacker-shaped until re-checked: string only, control characters dropped,
 *  whitespace flattened, clipped. Written without a regex literal so no
 *  formatter turns the escapes into raw bytes. */
export function sanitizeDetail(value: unknown): string {
  if (typeof value !== 'string') return '';
  let kept = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code === 0x7f || (code < 0x20 && ch !== ' ' && ch !== '\t' && ch !== '\n')) continue;
    kept += ch;
  }
  const flat = kept.replace(/\s+/g, ' ').trim();
  return flat.length > DIAG_DETAIL_MAX ? flat.slice(0, DIAG_DETAIL_MAX) : flat;
}

/** The recipe transition worth a line, if this report changes the flag. Never
 *  per tick: `unread:update` arrives every ~2s per service. */
export function recipeTransition(
  wasStale: boolean,
  nowStale: boolean,
): 'stale' | 'recovered' | null {
  if (wasStale === nowStale) return null;
  return nowStale ? 'stale' : 'recovered';
}

const onOff = (b: boolean) => (b ? 'on' : 'off');

/** The handful of settings that explain most behaviour differences between
 *  two installs — enough to read a report without asking for the file. */
export function settingsSummary(s: Settings): string {
  return [
    `lightSleep=${onOff(s.lightSleep)}`,
    `peekSaver=${onOff(s.peekSaver)}`,
    `autoBanish=${onOff(s.autoBanish.enabled)}/${s.autoBanish.hours}h`,
    `quietHours=${onOff(s.quietHours.enabled)}`,
    `appLock=${onOff(s.appLock.enabled)}`,
    `downloads=${s.downloads.ask ? 'ask' : 'folder'}`,
  ].join(' ');
}

/** One enabled service's state at copy time. `page` null means the view is
 *  not alive (hibernated, or never created). */
export function serviceSnapshotLine(s: {
  id: ServiceId;
  page: string | null;
  unread: Counts;
  stale: boolean;
  crashed: boolean;
  muted: boolean;
}): string {
  const parts = [s.page ? `live · ${pageLabel(s.page)}` : 'asleep'];
  parts.push(`unread ${s.unread.direct}/${s.unread.indirect}`);
  if (s.stale) parts.push('STALE');
  if (s.crashed) parts.push('CRASHED');
  if (s.muted) parts.push('muted');
  return `${s.id}: ${parts.join(' · ')}`;
}

function uptime(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** Header block, blank line, then the lines oldest first: a reader scrolls
 *  down through time. The pane shows the same ring newest first. `filtered`
 *  is the describeDiagFilter text when a filter narrowed the rows — printed
 *  as the last header line so the reader knows rows were dropped and by
 *  what rule. */
export function formatReport(
  header: ReportHeader,
  oldestFirst: readonly DiagEntry[],
  filtered?: string,
): string {
  const head = [
    `Goetia ${header.version} · Electron ${header.electron} · ${header.platform} ${header.arch} · OS ${header.os}`,
    `Started ${new Date(header.startedAt).toISOString()} · up ${uptime(header.now - header.startedAt)}`,
    `Services: ${header.enabled.join(', ')}`,
    `Settings: ${header.settings}`,
    'Now:',
    ...header.services.map((l) => `  ${l}`),
    ...(filtered ? [`Filtered: ${filtered}`] : []),
    '',
  ];
  const body =
    oldestFirst.length === 0
      ? [filtered ? '(nothing matched)' : '(nothing recorded)']
      : oldestFirst.map((e) => `${new Date(e.at).toISOString()} [${e.tag}] ${e.line}`);
  return [...head, ...body].join('\n');
}

/** What comes back from disk is data, not trust: keep only entries of the
 *  exact shape, with a known tag and (if present) a known service, clipped,
 *  and only the newest DIAG_CAP of them. */
export function restoreEntries(raw: unknown): DiagEntry[] {
  if (!Array.isArray(raw)) return [];
  const kept: DiagEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue;
    if (!isDiagTag(r.tag)) continue;
    if (typeof r.line !== 'string') continue;
    if (
      r.serviceId !== undefined &&
      (typeof r.serviceId !== 'string' || !SERVICE_IDS.has(r.serviceId))
    )
      continue;
    const entry: DiagEntry = {
      at: r.at,
      tag: r.tag,
      line: r.line.slice(0, DIAG_LINE_MAX),
    };
    if (r.serviceId !== undefined) entry.serviceId = r.serviceId as ServiceId;
    kept.push(entry);
  }
  return kept.length > DIAG_CAP ? kept.slice(kept.length - DIAG_CAP) : kept;
}

export interface DiagnosticsDeps {
  now(): number;
  /** receives the exact `[tag] line` the code used to print */
  mirror(line: string): void;
  /** the previous session's ring, if any — see restoreEntries */
  load?(): unknown;
  /** the ring, written on flush(); index.ts wires diagnostics.json */
  save?(entries: readonly DiagEntry[]): void;
}

/** The ring. Restored from `load` at construction so a report after a
 *  restart still shows the session before it; written back only on flush()
 *  (before-quit), so a main-process crash loses the current session and
 *  nothing older. */
export class Diagnostics {
  private entries: DiagEntry[];

  constructor(private deps: DiagnosticsDeps) {
    let raw: unknown;
    try {
      raw = deps.load?.();
    } catch {
      raw = undefined; // a corrupt file is an empty ring, never a failed boot
    }
    this.entries = restoreEntries(raw);
  }

  note(tag: DiagTag, line: string, serviceId?: ServiceId): void {
    const clipped = line.length > DIAG_LINE_MAX ? line.slice(0, DIAG_LINE_MAX) : line;
    const entry: DiagEntry = { at: this.deps.now(), tag, line: clipped };
    if (serviceId) entry.serviceId = serviceId;
    this.entries.push(entry);
    if (this.entries.length > DIAG_CAP) this.entries.shift();
    this.deps.mirror(`[${tag}] ${clipped}`);
  }

  /** newest first */
  recent(): DiagEntry[] {
    return [...this.entries].reverse();
  }

  /** The pane's filter is applied here with the same rule the pane used, so
   *  the two can never disagree on which rows match. The empty filter is
   *  today's whole report, byte for byte. */
  report(header: ReportHeader, filter: DiagFilter = EMPTY_DIAG_FILTER): string {
    const rows = this.entries.filter((e) => matchesDiagFilter(e, filter));
    const filtered = diagFilterNarrows(filter)
      ? describeDiagFilter(filter, rows.length, this.entries.length)
      : undefined;
    return formatReport(header, rows, filtered);
  }

  flush(): void {
    try {
      this.deps.save?.(this.entries);
    } catch {
      // a failed write on the way out is not worth a dialog
    }
  }
}
