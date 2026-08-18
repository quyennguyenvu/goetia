import type { ActivityEntryView, ServiceId } from '../../shared/types';

export interface ActivityEntry {
  id: number;
  serviceId: ServiceId;
  title: string;
  /** synthetic banners' conversation link; validated only at open time */
  href?: string;
  synthetic: boolean;
  /** the banner itself was suppressed by mute or quiet hours */
  silenced: boolean;
  at: number;
}

export const ACTIVITY_CAP = 50;

/** Bounded and in-memory only, on purpose: conversation titles never touch
 *  disk (settings.json is plaintext), and the log dies with the process. */
export class ActivityLog {
  private entries: ActivityEntry[] = [];
  private nextId = 1;

  append(entry: Omit<ActivityEntry, 'id'>): void {
    this.entries.push({ ...entry, id: this.nextId++ });
    if (this.entries.length > ACTIVITY_CAP) this.entries.shift();
  }

  get(id: number): ActivityEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Newest-first, one row per conversation (href key, else service+title),
   *  hrefs stripped — the renderer sees display fields and opaque ids only. */
  recent(): ActivityEntryView[] {
    const seen = new Set<string>();
    const rows: ActivityEntryView[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      const key = e.href ?? `${e.serviceId}\n${e.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: e.id,
        serviceId: e.serviceId,
        title: e.title,
        silenced: e.silenced,
        at: e.at,
      });
    }
    return rows;
  }
}
