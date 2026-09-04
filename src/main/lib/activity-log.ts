import type { ActivityEntryView, ServiceId } from '../../shared/types';

export interface ActivityEntry {
  id: number;
  serviceId: ServiceId;
  /** the banner's title verbatim, as the page passed it */
  title: string;
  /** the thread the banner belongs to — the title for every service but
   *  Discord, which packs the sender in front of it (see splitBannerTitle) */
  conversation: string;
  /** who sent it, where the service told us apart from the thread */
  author?: string;
  /** synthetic banners' conversation link; validated only at open time */
  href?: string;
  /** shim registry id for replaying the page's own onclick — dropped by
   *  forgetReplay the moment that registry dies with its document */
  clickId?: number;
  /** the URL the page landed on when a replay of this conversation's banner
   *  ran — the durable lane a shim-only row (Discord) has once the handle is
   *  gone; shared by every entry of the conversation (see learnUrl) */
  landedUrl?: string;
  synthetic: boolean;
  /** the banner itself was suppressed by mute or quiet hours */
  silenced: boolean;
  at: number;
}

export const ACTIVITY_CAP = 50;

/** The href a row opens with. A synthetic banner's own href, validated at
 *  open time; a shim banner's href field is page-controlled and never a lane
 *  by itself, so those rows get only what a landed replay taught. */
export function openHref(e: ActivityEntry): string | undefined {
  return e.synthetic ? e.href : e.landedUrl;
}

const conversationKey = (e: Pick<ActivityEntry, 'serviceId' | 'conversation'>) =>
  `${e.serviceId}\n${e.conversation}`;

/** Bounded and in-memory only, on purpose: conversation titles never touch
 *  disk (settings.json is plaintext), and the log dies with the process. */
export class ActivityLog {
  private entries: ActivityEntry[] = [];
  private nextId = 1;

  /** Returns the new entry's id — the banner's click handler keeps it so a
   *  landed replay can teach the entry its URL. */
  append(entry: Omit<ActivityEntry, 'id'>): number {
    // the row for a conversation is its newest banner, so a lesson must
    // carry over or the next message in the channel would lose it
    const landedUrl =
      entry.landedUrl ??
      this.entries.find((e) => conversationKey(e) === conversationKey(entry))?.landedUrl;
    const id = this.nextId++;
    this.entries.push({ ...entry, ...(landedUrl ? { landedUrl } : {}), id });
    if (this.entries.length > ACTIVITY_CAP) this.entries.shift();
    return id;
  }

  /** Remember where a replayed banner took the page, for every entry of that
   *  conversation. Validated like any href when a row is opened, never here. */
  learnUrl(id: number, url: string): void {
    const hit = this.get(id);
    if (!hit) return;
    const key = conversationKey(hit);
    for (const e of this.entries) {
      if (conversationKey(e) === key) e.landedUrl = url;
    }
  }

  /** Drop one service's history, or all of it. A purge wipes the session
   *  these titles came from, so leaving them would deep-link ⌘K rows into
   *  threads that now resolve to a login page. `nextId` keeps counting, so a
   *  switcher row held across a clear resolves to undefined, never to a
   *  recycled entry. */
  clear(id?: ServiceId): void {
    this.entries = id ? this.entries.filter((e) => e.serviceId !== id) : [];
  }

  /** Forget one service's replay handles — its document is gone, and the
   *  shim's ids restart at 1 in the next one, so a kept id would replay a
   *  different banner. The rows themselves stay: the title and href are
   *  still what the switcher shows and opens with. */
  forgetReplay(id: ServiceId): void {
    for (const e of this.entries) {
      if (e.serviceId === id) e.clickId = undefined;
    }
  }

  get(id: number): ActivityEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Newest-first, one row per conversation (href key, else service +
   *  conversation — the parsed thread, so two Discord banners from one channel
   *  are one row however that channel's sender differed), hrefs stripped: the
   *  renderer sees display fields and opaque ids only. */
  recent(): ActivityEntryView[] {
    const seen = new Set<string>();
    const rows: ActivityEntryView[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      const key = e.href ?? `${e.serviceId}\n${e.conversation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: e.id,
        serviceId: e.serviceId,
        title: e.conversation,
        author: e.author,
        silenced: e.silenced,
        at: e.at,
      });
    }
    return rows;
  }
}
