import type { ServiceId } from '../shared/types';
import { ACTIVITY_CAP } from './lib/activity-log';
import {
  ZERO_DWELL_MS,
  ZERO_IDLE,
  type ZeroEvent,
  type ZeroState,
  zeroStep,
} from './lib/banner-clear-rules';

/** All the registry needs of an Electron Notification — tests pass a stub. */
export interface BannerHandle {
  close(): void;
}

/** ActivityLog.onDrop keeps the registry at the log's size; this only bounds
 *  a platform that never reports `show`, whose deferred closes would pile up. */
export const BANNER_ROWS_MAX = ACTIVITY_CAP * 2;

interface Row {
  serviceId: ServiceId;
  handle: BannerHandle;
  /** the OS has the banner; on macOS a close() before this removes nothing */
  shown: boolean;
  closeOnShow: boolean;
}

/** Every message banner still in Notification Center, by ActivityLog entry
 *  id. Holding the handle is what keeps the banner's click alive — Electron's
 *  object is V8-owned with no keep-alive — and what lets it be removed once
 *  its conversation is read. No text is kept here, only handles. */
export class BannerRegistry {
  private rows = new Map<number, Row>();
  private zero = new Map<ServiceId, ZeroState>();
  private timers = new Map<ServiceId, NodeJS.Timeout>();
  private disposed = false;

  get size(): number {
    return this.rows.size;
  }

  add(entryId: number, serviceId: ServiceId, handle: BannerHandle): void {
    this.rows.set(entryId, { serviceId, handle, shown: false, closeOnShow: false });
    for (const oldest of this.rows.keys()) {
      if (this.rows.size <= BANNER_ROWS_MAX) break;
      this.rows.delete(oldest);
    }
  }

  noteShown(entryId: number): void {
    const row = this.rows.get(entryId);
    if (!row) return;
    row.shown = true;
    if (row.closeOnShow) this.closeEntries([entryId]);
  }

  /** The banner never reached the OS: there is nothing to close. */
  forget(entryId: number): void {
    this.rows.delete(entryId);
  }

  closeEntries(ids: readonly number[]): void {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (!row) continue;
      if (!row.shown) {
        row.closeOnShow = true;
        continue;
      }
      // deleted first: close() emits `close` synchronously
      this.rows.delete(id);
      row.handle.close();
    }
  }

  closeService(id: ServiceId): void {
    this.closeEntries([...this.rows].filter(([, row]) => row.serviceId === id).map(([key]) => key));
  }

  closeAll(): void {
    this.closeEntries([...this.rows.keys()]);
  }

  /** Feed one service's document events to the trusted-zero rule; a zero
   *  that stands for the dwell closes the service's banners. */
  noteZero(id: ServiceId, event: ZeroEvent): void {
    if (this.disposed) return;
    const { state, effect } = zeroStep(this.zero.get(id) ?? ZERO_IDLE, event);
    this.zero.set(id, state);
    if (effect === 'none') return;
    const pending = this.timers.get(id);
    if (pending) clearTimeout(pending);
    this.timers.delete(id);
    if (effect !== 'arm') return;
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.closeService(id);
      }, ZERO_DWELL_MS),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}

export const HELD_BANNERS_MAX = 20;

/** Banners with no ActivityLog entry behind them (a finished download): held
 *  so the click stays alive, newest HELD_BANNERS_MAX only — the one let go is
 *  closed, so none is left in Notification Center with a dead click. */
export class BannerShelf {
  private held: BannerHandle[] = [];

  get size(): number {
    return this.held.length;
  }

  hold(handle: BannerHandle): void {
    this.held.push(handle);
    while (this.held.length > HELD_BANNERS_MAX) this.held.shift()?.close();
  }

  /** Clicked, or never reached the OS: nothing left to keep alive or close. */
  release(handle: BannerHandle): void {
    const at = this.held.indexOf(handle);
    if (at >= 0) this.held.splice(at, 1);
  }

  closeAll(): void {
    // emptied first: close() emits `close` synchronously
    const all = this.held;
    this.held = [];
    for (const handle of all) handle.close();
  }
}
