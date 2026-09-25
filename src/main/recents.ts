import Conf from 'conf';
import { SERVICES } from '../shared/services';
import type { RecentsStorage, ServiceId } from '../shared/types';
import type { KeyCodec } from './codec';
import { type RecentEntry, restoreRecents, upsertRecent } from './lib/recents-rules';

/** On disk: one of the two keys, or neither on a fresh profile. `sealed` is
 *  the codec's output over JSON.stringify({ recents }); `recents` is the
 *  plaintext written when no keychain is available. */
interface RecentsFile {
  sealed?: string;
  recents?: RecentEntry[];
}

/** ⌘K's Recent at rest, <cwd>/recents.json. Conversation labels are the
 *  content the pins decision sealed, so this is PinStore's shape: a
 *  safeStorage envelope, plaintext only with no keychain, and a sealed file
 *  this launch cannot open is kept untouched — read as empty, never written —
 *  so the next launch that can read it gets it back. */
export class RecentsStore {
  private conf: Conf<RecentsFile>;
  private entries: RecentEntry[] = [];
  private unreadable = false;
  private nextId = 1;

  constructor(
    cwd: string,
    private codec: KeyCodec | null,
  ) {
    this.conf = new Conf<RecentsFile>({
      cwd,
      configName: 'recents',
      // no `recents: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      clearInvalidConfig: true,
    });
    const known = new Set<string>(SERVICES.map((s) => s.id));
    const raw = this.conf.store;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        this.entries = restoreRecents((opened as { recents?: unknown } | null)?.recents, known);
      } catch {
        this.unreadable = true;
      }
    } else if (Array.isArray(raw.recents)) {
      this.entries = restoreRecents(raw.recents, known);
      // migrate: the plaintext leaves the disk now, not on the next sighting
      if (codec) this.write();
    }
    this.nextId = this.entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  }

  rows(): RecentEntry[] {
    return [...this.entries];
  }

  get(id: number): RecentEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  storage(): RecentsStorage {
    if (this.unreadable) return 'unreadable';
    return this.codec ? 'sealed' : 'plain';
  }

  /** The conversation moves to the top. False while unreadable: never
   *  overwrite what could not be read. */
  upsert(sighting: Omit<RecentEntry, 'id'>): boolean {
    if (this.unreadable) return false;
    this.entries = upsertRecent(this.entries, sighting, () => this.nextId++);
    this.write();
    return true;
  }

  /** A purge wipes the session these labels came from. */
  clear(id: ServiceId): void {
    if (this.unreadable) return;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.serviceId !== id);
    if (this.entries.length !== before) this.write();
  }

  private write(): void {
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ recents: this.entries })) }
      : { recents: [...this.entries] };
  }
}
