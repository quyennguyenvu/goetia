import { basename, extname, join } from 'node:path';

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
