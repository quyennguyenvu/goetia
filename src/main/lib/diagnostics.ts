import type { DiagEntry, DiagTag, ServiceId, Settings } from '../../shared/types';

/** Bound on the ring. A page that provokes refusals in a loop rotates it and
 *  cannot grow it; the NavigationAudit dedupe in front of the [nav] lines
 *  already keeps one origin from repeating. */
export const DIAG_CAP = 200;

export interface ReportHeader {
  version: string;
  electron: string;
  platform: string;
  arch: string;
  /** enabled services in rail order */
  enabled: readonly ServiceId[];
  settings: string;
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

/** Header block, blank line, then the lines oldest first: a reader scrolls
 *  down through time. The pane shows the same ring newest first. */
export function formatReport(header: ReportHeader, oldestFirst: readonly DiagEntry[]): string {
  const head = [
    `Goetia ${header.version} · Electron ${header.electron} · ${header.platform} ${header.arch}`,
    `Services: ${header.enabled.join(', ')}`,
    `Settings: ${header.settings}`,
    '',
  ];
  const body =
    oldestFirst.length === 0
      ? ['(nothing recorded)']
      : oldestFirst.map((e) => `${new Date(e.at).toISOString()} [${e.tag}] ${e.line}`);
  return [...head, ...body].join('\n');
}

/** The ring. `mirror` receives the exact `[tag] line` the code used to print,
 *  so a dev run reads unchanged. In memory only: a restart clears it, like
 *  the activity log. */
export class Diagnostics {
  private entries: DiagEntry[] = [];

  constructor(private deps: { now(): number; mirror(line: string): void }) {}

  note(tag: DiagTag, line: string, serviceId?: ServiceId): void {
    const entry: DiagEntry = { at: this.deps.now(), tag, line };
    if (serviceId) entry.serviceId = serviceId;
    this.entries.push(entry);
    if (this.entries.length > DIAG_CAP) this.entries.shift();
    this.deps.mirror(`[${tag}] ${line}`);
  }

  /** newest first */
  recent(): DiagEntry[] {
    return [...this.entries].reverse();
  }

  report(header: ReportHeader): string {
    return formatReport(header, this.entries);
  }
}
