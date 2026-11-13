import { SERVICES } from '../shared/services';
import type { DownloadStorage } from '../shared/types';
import type { KeyCodec } from './codec';
import { type DownloadRecord, persistable, restoreRecords } from './lib/download-rules';
import { SealedFile } from './sealed-file';

/** What DownloadManager needs from the store; the unit test hands in a fake. */
export interface DownloadHistoryLike {
  load(): DownloadRecord[];
  save(records: readonly DownloadRecord[]): void;
  storage(): DownloadStorage;
}

/** Settings → Downloads' history at rest, <cwd>/downloads.json. File names
 *  and paths are the content the pins decision sealed for the same reason, so
 *  this rests the way pins.json does (SealedFile): sealed, plaintext only with
 *  no keychain, and a sealed file this launch cannot open kept untouched.
 *  Written by the manager whenever the set of ended rows changes. */
export class DownloadHistoryStore implements DownloadHistoryLike {
  private file: SealedFile<DownloadRecord[]>;
  private records: DownloadRecord[];

  constructor(cwd: string, codec: KeyCodec | null) {
    const known = new Set<string>(SERVICES.map((s) => s.id));
    this.file = new SealedFile(cwd, 'downloads', codec, (raw) => restoreRecords(raw, known));
    this.records = this.file.value;
  }

  load(): DownloadRecord[] {
    return [...this.records];
  }

  save(records: readonly DownloadRecord[]): void {
    if (this.file.unreadable) return; // never overwrite what could not be read
    this.records = persistable(records);
    this.file.write(this.records);
  }

  storage(): DownloadStorage {
    return this.file.storage();
  }
}
