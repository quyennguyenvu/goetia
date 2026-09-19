import type { ServiceId, Settings } from '../shared/types';
import {
  ASK_URL_CAP,
  bannerFor,
  DOWNLOAD_BURST_WINDOW_MS,
  type DownloadEnd,
  decideSave,
  progressFraction,
} from './lib/download-rules';
import { redactBanner } from './lib/lock-rules';

/** The slice of Electron's DownloadItem this class touches; the real one
 *  satisfies it structurally, and the unit test drives a fake. */
export interface DownloadItemLike {
  getFilename(): string;
  getURL(): string;
  setSavePath(path: string): void;
  getSavePath(): string;
  setSaveDialogOptions(options: { defaultPath?: string }): void;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  cancel(): void;
  on(event: 'updated', listener: (event: unknown, state: string) => void): unknown;
  once(event: 'done', listener: (event: unknown, state: DownloadEnd) => void): unknown;
}

type WillDownload = (event: unknown, item: DownloadItemLike, webContents: unknown) => void;

export interface DownloadSessionLike {
  on(event: 'will-download', fn: WillDownload): unknown;
  removeListener(event: 'will-download', fn: WillDownload): unknown;
}

export interface DownloadBanner {
  title: string;
  body: string;
  icon?: string;
  onClick: () => void;
}

/** Every Electron touch is injected, so the class is testable without a
 *  runtime and index.ts stays the only place that knows the real APIs. */
export interface DownloadManagerDeps {
  settings(): Settings['downloads'];
  /** app.getPath('downloads') — the OS folder while `dir` is null */
  defaultDir(): string;
  locked(): boolean;
  serviceName(id: ServiceId): string;
  icons: ReadonlyMap<ServiceId, string>;
  exists(path: string): boolean;
  /** shows a silent native banner; the click runs `onClick` */
  notify(banner: DownloadBanner): void;
  /** shell.showItemInFolder — the only file action Goetia ever takes */
  reveal(path: string): void;
  /** app.dock.downloadFinished on macOS, a no-op elsewhere */
  dockFinished(path: string): void;
  /** win.setProgressBar, guarded against a destroyed window */
  setProgress(fraction: number): void;
  showWindow(): void;
  now(): number;
}

interface Inflight {
  serviceId: ServiceId;
  received: number;
  total: number;
}

/** One will-download listener per service partition; the decision is
 *  decideSave, the completion is a banner of its own (never the message
 *  router: no activity log, no mute gating, always silent). */
export class DownloadManager {
  private listeners = new Map<ServiceId, { ses: DownloadSessionLike; fn: WillDownload }>();
  private inflight = new Map<DownloadItemLike, Inflight>();
  /** page-initiated start times per service, trimmed to the burst window */
  private starts = new Map<ServiceId, number[]>();
  /** URLs Save Image As… promised a dialog for; consumed on first match */
  private askUrls: string[] = [];

  constructor(private deps: DownloadManagerDeps) {}

  attach(id: ServiceId, ses: DownloadSessionLike): void {
    if (this.listeners.has(id)) return;
    const fn: WillDownload = (_e, item) => this.handle(id, item);
    ses.on('will-download', fn);
    this.listeners.set(id, { ses, fn });
  }

  /** Stop listening and end every download the service still has open. */
  detach(id: ServiceId): void {
    const l = this.listeners.get(id);
    if (l) {
      l.ses.removeListener('will-download', l.fn);
      this.listeners.delete(id);
    }
    for (const [item, f] of this.inflight) {
      if (f.serviceId === id) item.cancel();
    }
    this.starts.delete(id);
  }

  expectAsk(url: string): void {
    this.askUrls.push(url);
    const excess = this.askUrls.length - ASK_URL_CAP;
    if (excess > 0) this.askUrls.splice(0, excess);
  }

  inflightCount(): number {
    return this.inflight.size;
  }

  handle(id: ServiceId, item: DownloadItemLike): void {
    const now = this.deps.now();
    const url = item.getURL();
    const askAt = this.askUrls.indexOf(url);
    const userRequested = askAt !== -1;
    if (userRequested) this.askUrls.splice(askAt, 1);
    const recent = (this.starts.get(id) ?? []).filter((t) => now - t < DOWNLOAD_BURST_WINDOW_MS);
    const s = this.deps.settings();
    const decision = decideSave({
      filename: item.getFilename(),
      ask: s.ask,
      dir: s.dir ?? this.deps.defaultDir(),
      userRequested,
      recentStarts: recent,
      now,
      exists: this.deps.exists,
    });
    if (decision.mode === 'save') item.setSavePath(decision.path);
    else item.setSaveDialogOptions({ defaultPath: decision.defaultPath });
    // a user's Save As… is not the page's doing, so it never counts
    if (!userRequested) this.starts.set(id, [...recent, now]);

    this.inflight.set(item, { serviceId: id, received: 0, total: item.getTotalBytes() });
    item.on('updated', () => {
      const f = this.inflight.get(item);
      if (!f) return;
      f.received = item.getReceivedBytes();
      f.total = item.getTotalBytes();
      this.pushProgress();
    });
    item.once('done', (_e, state) => this.finish(id, item, state));
  }

  private finish(id: ServiceId, item: DownloadItemLike, state: DownloadEnd): void {
    const tracked = this.inflight.delete(item);
    this.pushProgress();
    // detach cancelled it; a cancel is silent anyway, but never announce a
    // download the service no longer owns
    if (!tracked) return;
    const name = this.deps.serviceName(id);
    const banner = bannerFor(state, item.getFilename(), name);
    if (!banner) return;
    const path = item.getSavePath();
    if (state === 'completed') this.deps.dockFinished(path);
    const shown = this.deps.locked() ? redactBanner(name) : banner;
    const icon = this.deps.icons.get(id);
    this.deps.notify({
      ...shown,
      ...(icon ? { icon } : {}),
      onClick: () => {
        // re-checked at click time: a banner clicked hours later must not be
        // a way to reveal a file past a lock that has since engaged
        if (state === 'completed' && !this.deps.locked()) this.deps.reveal(path);
        else this.deps.showWindow();
      },
    });
  }

  private pushProgress(): void {
    this.deps.setProgress(progressFraction([...this.inflight.values()]));
  }

  dispose(): void {
    for (const id of [...this.listeners.keys()]) this.detach(id);
    for (const item of [...this.inflight.keys()]) item.cancel();
    this.inflight.clear();
    this.deps.setProgress(-1);
  }
}
