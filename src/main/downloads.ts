import { basename } from 'node:path';
import type { DownloadView, ServiceId, Settings } from '../shared/types';
import {
  ASK_URL_CAP,
  bannerFor,
  DOWNLOAD_BURST_WINDOW_MS,
  type DownloadEnd,
  type DownloadRecord,
  decideSave,
  historyEvict,
  historyViews,
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
  /** Settings → Downloads — a completed banner clicked after its file moved */
  openDownloads(): void;
  now(): number;
}

interface Inflight {
  id: number;
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
  /** this session's rows behind Settings → Downloads; DOWNLOAD_HISTORY_CAP */
  private records = new Map<number, DownloadRecord>();
  private nextId = 1;

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

    const evict = historyEvict([...this.records.values()]);
    if (evict !== null) this.records.delete(evict);
    // the row is named by the file on disk: a de-duplicated save is
    // `note (1).txt`, not the `note.txt` the page asked for
    const record: DownloadRecord = {
      id: this.nextId++,
      serviceId: id,
      filename: decision.mode === 'save' ? basename(decision.path) : item.getFilename(),
      path: decision.mode === 'save' ? decision.path : '',
      state: 'downloading',
      received: 0,
      total: item.getTotalBytes(),
      at: now,
    };
    this.records.set(record.id, record);
    this.inflight.set(item, { id: record.id, serviceId: id, received: 0, total: record.total });
    item.on('updated', () => {
      const f = this.inflight.get(item);
      if (!f) return;
      f.received = item.getReceivedBytes();
      f.total = item.getTotalBytes();
      record.received = f.received;
      record.total = f.total;
      this.pushProgress();
    });
    item.once('done', (_e, state) => this.finish(id, item, state));
  }

  private finish(id: ServiceId, item: DownloadItemLike, state: DownloadEnd): void {
    const f = this.inflight.get(item);
    const tracked = this.inflight.delete(item);
    this.pushProgress();
    // detach cancelled it; a cancel is silent anyway, but never announce a
    // download the service no longer owns
    if (!tracked || !f) return;
    const path = item.getSavePath();
    const record = this.records.get(f.id);
    if (state === 'cancelled') {
      this.records.delete(f.id); // a cancelled file gets no row, as it gets no banner
    } else if (record) {
      record.state = state === 'completed' ? 'saved' : 'failed';
      record.path = path;
      if (path) record.filename = basename(path); // an Ask save learns its name here
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes();
    }
    const name = this.deps.serviceName(id);
    const banner = bannerFor(state, item.getFilename(), name);
    if (!banner) return;
    if (state === 'completed') this.deps.dockFinished(path);
    const shown = this.deps.locked() ? redactBanner(name) : banner;
    const icon = this.deps.icons.get(id);
    this.deps.notify({
      ...shown,
      ...(icon ? { icon } : {}),
      onClick: () => {
        // re-checked at click time: a banner clicked hours later must not be
        // a way to reveal a file past a lock that has since engaged
        if (state === 'completed' && !this.deps.locked()) {
          if (this.deps.exists(path)) this.deps.reveal(path);
          else this.deps.openDownloads(); // the row there reads "moved or deleted since"
        } else this.deps.showWindow();
      },
    });
  }

  /** Settings → Downloads, in flight first then newest; `missing` decided
   *  here against the disk so the renderer never holds a path. */
  recent(): DownloadView[] {
    return historyViews([...this.records.values()], this.deps.exists);
  }

  /** Cancel an in-flight download by row id; false for anything else. */
  cancel(id: number): boolean {
    for (const [item, f] of this.inflight) {
      if (f.id === id) {
        item.cancel();
        return true;
      }
    }
    return false;
  }

  /** Reveal a saved file by row id — the banner's click, re-checked the same
   *  way: never while locked, never a file that is gone. */
  reveal(id: number): boolean {
    const r = this.records.get(id);
    if (r?.state !== 'saved' || this.deps.locked() || !this.deps.exists(r.path)) return false;
    this.deps.reveal(r.path);
    return true;
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
