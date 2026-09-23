import Conf from 'conf';
import { SERVICES } from '../shared/services';
import type { DownloadStorage } from '../shared/types';
import type { KeyCodec } from './codec';
import { type DownloadRecord, persistable, restoreRecords } from './lib/download-rules';

/** On disk: one of the two keys, or neither on a fresh profile. `sealed` is
 *  the codec's output over JSON.stringify({ downloads }); `downloads` is the
 *  plaintext written when no keychain is available. */
interface DownloadsFile {
  sealed?: string;
  downloads?: DownloadRecord[];
}

/** What DownloadManager needs from the store; the unit test hands in a fake. */
export interface DownloadHistoryLike {
  load(): DownloadRecord[];
  save(records: readonly DownloadRecord[]): void;
  storage(): DownloadStorage;
}

/** Settings → Downloads' history at rest, <cwd>/downloads.json. File names
 *  and paths are the content the pins decision sealed for the same reason, so
 *  this is PinStore's shape: a safeStorage envelope, plaintext only with no
 *  keychain, and a sealed file this launch cannot open is kept untouched —
 *  read as empty, never written — so the next launch that can read it gets
 *  it back. Written by the manager whenever the set of ended rows changes. */
export class DownloadHistoryStore implements DownloadHistoryLike {
  private conf: Conf<DownloadsFile>;
  private records: DownloadRecord[] = [];
  private unreadable = false;

  constructor(
    cwd: string,
    private codec: KeyCodec | null,
  ) {
    this.conf = new Conf<DownloadsFile>({
      cwd,
      configName: 'downloads',
      // no `downloads: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    const known = new Set<string>(SERVICES.map((s) => s.id));
    const raw = this.conf.store;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        this.records = restoreRecords((opened as { downloads?: unknown } | null)?.downloads, known);
      } catch {
        this.unreadable = true;
      }
    } else if (Array.isArray(raw.downloads)) {
      this.records = restoreRecords(raw.downloads, known);
      // migrate: the plaintext leaves the disk now, not on the next download
      if (codec) this.write(this.records);
    }
  }

  load(): DownloadRecord[] {
    return [...this.records];
  }

  save(records: readonly DownloadRecord[]): void {
    if (this.unreadable) return; // never overwrite what could not be read
    this.records = persistable(records);
    this.write(this.records);
  }

  storage(): DownloadStorage {
    if (this.unreadable) return 'unreadable';
    return this.codec ? 'sealed' : 'plain';
  }

  private write(records: readonly DownloadRecord[]): void {
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ downloads: records })) }
      : { downloads: [...records] };
  }
}
