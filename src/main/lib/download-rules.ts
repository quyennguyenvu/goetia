import { basename, extname, join } from 'node:path';
import type { DownloadView, ServiceId, Settings } from '../../shared/types';

/** Silent saves a page may start inside one window before the rest of them
 *  fall back to the Save dialog, which needs a human. Chrome bounds this with
 *  its automatic-downloads permission; Electron has nothing. */
export const DOWNLOAD_BURST_CAP = 5;
export const DOWNLOAD_BURST_WINDOW_MS = 30_000;
/** `name (99).ext` is the last name tried before the dialog takes over. */
export const DOWNLOAD_DEDUP_MAX = 99;
/** URLs the context menu's Save Image As… has promised a dialog for. */
export const ASK_URL_CAP = 16;

export type AskReason = 'user-request' | 'setting' | 'missing-dir' | 'burst' | 'exhausted';

export type SaveDecision =
  | { mode: 'save'; path: string }
  | { mode: 'ask'; defaultPath: string; reason: AskReason };

export type DownloadEnd = 'completed' | 'cancelled' | 'interrupted';

/** Chromium has already stripped separators from getFilename(); this is the
 *  second line — a dotfile or an empty name never reaches the disk as such. */
export function safeFilename(name: string): string {
  const base = basename(name).trim();
  if (base === '' || base === '..' || base.startsWith('.')) return 'download';
  return base;
}

/** `name.ext`, then `name (1).ext` … up to DOWNLOAD_DEDUP_MAX; null when all
 *  are taken. Probes DOWNLOAD_DEDUP_MAX + 1 paths at most. */
export function uniquePath(
  dir: string,
  name: string,
  exists: (path: string) => boolean,
): string | null {
  const first = join(dir, name);
  if (!exists(first)) return first;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= DOWNLOAD_DEDUP_MAX; n++) {
    const candidate = join(dir, `${stem} (${n})${ext}`);
    if (!exists(candidate)) return candidate;
  }
  return null;
}

/** `starts` are the earlier page-initiated starts for this service; the one
 *  being decided is not among them. */
export function burstExceeded(starts: readonly number[], now: number): boolean {
  let inWindow = 0;
  for (const t of starts) if (now - t < DOWNLOAD_BURST_WINDOW_MS) inWindow++;
  return inWindow >= DOWNLOAD_BURST_CAP;
}

/** The one decision per download. Reasons are ordered: a user's explicit
 *  Save As… is honoured before anything else; the setting next; then the
 *  three ways a silent save cannot proceed. `dir` is already resolved (the
 *  chosen folder or the OS default) and `exists` is probed once for it. */
export function decideSave(input: {
  filename: string;
  ask: boolean;
  dir: string;
  userRequested: boolean;
  recentStarts: readonly number[];
  now: number;
  exists: (path: string) => boolean;
}): SaveDecision {
  const name = safeFilename(input.filename);
  const defaultPath = join(input.dir, name);
  const ask = (reason: AskReason): SaveDecision => ({ mode: 'ask', defaultPath, reason });
  if (input.userRequested) return ask('user-request');
  if (input.ask) return ask('setting');
  if (!input.exists(input.dir)) return ask('missing-dir');
  if (burstExceeded(input.recentStarts, input.now)) return ask('burst');
  const path = uniquePath(input.dir, name, input.exists);
  if (path === null) return ask('exhausted');
  return { mode: 'save', path };
}

export function bannerFor(
  state: DownloadEnd,
  filename: string,
  serviceName: string,
): { title: string; body: string } | null {
  switch (state) {
    case 'completed':
      return { title: filename, body: `Saved from ${serviceName}` };
    case 'interrupted':
      return { title: `Could not save ${filename}`, body: serviceName };
    case 'cancelled':
      return null;
  }
}

/** For BrowserWindow.setProgressBar: -1 clears, 0..1 is the aggregate, and
 *  any value above 1 renders indeterminate — used when a total is unknown. */
export function progressFraction(items: readonly { received: number; total: number }[]): number {
  if (items.length === 0) return -1;
  let received = 0;
  let total = 0;
  for (const it of items) {
    if (it.total <= 0) return 2;
    received += it.received;
    total += it.total;
  }
  return Math.min(1, received / total);
}

/** Rows Settings → Downloads keeps, across launches (downloads.json). 200 is
 *  Diagnostics parity — the one bounded-history number the app already has. */
export const DOWNLOAD_HISTORY_CAP = 200;
/** A restored name is clipped here; Chromium already bounds a live one. */
export const DOWNLOAD_NAME_MAX = 255;

/** Main's own record of one download. `path` is empty until Chromium knows
 *  it (an Ask download learns it at done) and never leaves main. */
export interface DownloadRecord {
  id: number;
  serviceId: ServiceId;
  filename: string;
  path: string;
  state: 'downloading' | 'saved' | 'failed';
  received: number;
  total: number;
  at: number;
}

/** In flight first, then newest first (id breaks a tie); a saved file that
 *  is gone reads `missing`, checked here so the pane never sees a path. */
export function historyViews(
  records: readonly DownloadRecord[],
  exists: (path: string) => boolean,
): DownloadView[] {
  const rank = (r: DownloadRecord) => (r.state === 'downloading' ? 0 : 1);
  return [...records]
    .sort((a, b) => rank(a) - rank(b) || b.at - a.at || b.id - a.id)
    .map((r) => ({
      id: r.id,
      serviceId: r.serviceId,
      filename: r.filename,
      state: r.state === 'saved' && !exists(r.path) ? 'missing' : r.state,
      received: r.received,
      total: r.total,
      at: r.at,
    }));
}

/** The one record to drop when the cap is met: the oldest ended one, so a
 *  running download keeps its row and its Cancel; the oldest of all only
 *  when every row is still in flight (its download continues unlisted). */
export function historyEvict(records: readonly DownloadRecord[]): number | null {
  if (records.length < DOWNLOAD_HISTORY_CAP) return null;
  const ended = records.filter((r) => r.state !== 'downloading');
  const pool = ended.length > 0 ? ended : records;
  return pool.reduce((a, b) => (b.at < a.at || (b.at === a.at && b.id < a.id) ? b : a)).id;
}

/** What comes back from disk is data, not trust: exact shape, a known
 *  service, a state in saved | failed (a downloading row cannot survive
 *  quit), finite numbers, string name and path; newest DOWNLOAD_HISTORY_CAP
 *  kept, a repeated id dropped. */
export function restoreRecords(raw: unknown, known: ReadonlySet<string>): DownloadRecord[] {
  if (!Array.isArray(raw)) return [];
  const kept: DownloadRecord[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    if (typeof r.serviceId !== 'string' || !known.has(r.serviceId)) continue;
    if (r.state !== 'saved' && r.state !== 'failed') continue;
    if (typeof r.filename !== 'string' || typeof r.path !== 'string') continue;
    const nums = [r.received, r.total, r.at];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    seen.add(id);
    kept.push({
      id,
      serviceId: r.serviceId as ServiceId,
      filename: r.filename.slice(0, DOWNLOAD_NAME_MAX),
      path: r.path,
      state: r.state,
      received: r.received as number,
      total: r.total as number,
      at: r.at as number,
    });
  }
  kept.sort((a, b) => b.at - a.at || b.id - a.id);
  return kept.slice(0, DOWNLOAD_HISTORY_CAP);
}

/** The rows the file holds: a downloading row is never written. */
export function persistable(records: readonly DownloadRecord[]): DownloadRecord[] {
  return records.filter((r) => r.state !== 'downloading');
}

/** Diagnostics lines for a change to the downloads block — the folder is an
 *  exfiltration channel, so it is recorded (never the path itself). */
export function downloadsSettingLines(
  before: Settings['downloads'],
  after: Settings['downloads'],
): string[] {
  const lines: string[] = [];
  if (before.dir !== after.dir) {
    lines.push(after.dir === null ? 'folder reset to the OS default' : 'folder changed');
  }
  if (before.ask !== after.ask) lines.push(after.ask ? 'mode: ask' : 'mode: save to folder');
  return lines;
}
