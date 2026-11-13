import { SERVICES } from '../shared/services';
import type { RecentsStorage, ServiceId } from '../shared/types';
import type { KeyCodec } from './codec';
import { type RecentEntry, restoreRecents, sameButAt, upsertRecent } from './lib/recents-rules';
import { SealedFile } from './sealed-file';

/** ⌘K's Recent at rest, <cwd>/recents.json. Conversation labels are the
 *  content the pins decision sealed, so this rests the way pins.json does
 *  (SealedFile): sealed, plaintext only with no keychain, and a sealed file
 *  this launch cannot open kept untouched. */
export class RecentsStore {
  private file: SealedFile<RecentEntry[]>;
  private entries: RecentEntry[];
  private nextId: number;
  /** memory holds a newer `at` than the file; see upsert */
  private deferred = false;

  constructor(cwd: string, codec: KeyCodec | null) {
    const known = new Set<string>(SERVICES.map((s) => s.id));
    this.file = new SealedFile(cwd, 'recents', codec, (raw) => restoreRecents(raw, known));
    this.entries = this.file.value;
    this.nextId = this.entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  }

  rows(): RecentEntry[] {
    return [...this.entries];
  }

  get(id: number): RecentEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  storage(): RecentsStorage {
    return this.file.storage();
  }

  /** The conversation moves to the top. False while unreadable: never
   *  overwrite what could not be read. */
  upsert(sighting: Omit<RecentEntry, 'id'>): boolean {
    if (this.file.unreadable) return false;
    const top = this.entries[0];
    this.entries = upsertRecent(this.entries, sighting, () => this.nextId++);
    // a title's unread count moving re-reports the chat already on top: only
    // its `at` changed, and the file already sorts it first, so the sealed
    // rewrite waits for the next real change or flush() at quit
    const head = this.entries[0];
    if (top && head && sameButAt(top, head)) this.deferred = true;
    else this.write();
    return true;
  }

  /** Commit a deferred `at` before the process goes. */
  flush(): void {
    if (this.deferred) this.write();
  }

  /** A purge wipes the session these labels came from. */
  clear(id: ServiceId): void {
    if (this.file.unreadable) return;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.serviceId !== id);
    if (this.entries.length !== before) this.write();
  }

  private write(): void {
    this.deferred = false;
    this.file.write(this.entries);
  }
}
