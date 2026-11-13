import Conf from 'conf';
import type { KeyCodec } from './codec';

/** One JSON file holding one list, at rest the way pins.json first did it: a
 *  safeStorage-sealed envelope `{ sealed }` over `{ [key]: value }` — the tier
 *  the cookies and passkeys rest under — and the plain `{ [key]: value }` only
 *  when no keychain is available. A sealed file this launch cannot open is
 *  kept untouched: read as empty, never written, so the next launch that can
 *  read it gets it back. Pins, recents and the download history share it. */
export class SealedFile<T> {
  private conf: Conf<Record<string, unknown>>;
  /** a sealed file exists but would not open on this boot */
  readonly unreadable: boolean;
  /** what the file held, parsed — `parse(undefined)` with no file or an
   *  unreadable one */
  readonly value: T;

  constructor(
    cwd: string,
    /** the file's name (`<key>.json`) and the one key inside it */
    private key: string,
    private codec: KeyCodec | null,
    parse: (raw: unknown) => T,
  ) {
    this.conf = new Conf<Record<string, unknown>>({
      cwd,
      configName: key,
      // no `[key]: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    const raw = this.conf.store;
    let value = parse(undefined);
    let unreadable = false;
    let legacy = false;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        value = parse((opened as Record<string, unknown> | null)?.[key]);
      } catch {
        unreadable = true;
      }
    } else if (Array.isArray(raw[key])) {
      value = parse(raw[key]);
      legacy = true;
    }
    this.unreadable = unreadable;
    this.value = value;
    // migrate: the plaintext leaves the disk now, not on the next change
    if (legacy && codec) this.write(value);
  }

  storage(): 'sealed' | 'plain' | 'unreadable' {
    if (this.unreadable) return 'unreadable';
    return this.codec ? 'sealed' : 'plain';
  }

  /** One atomic write. A no-op while unreadable: never overwrite what could
   *  not be read. */
  write(value: T): void {
    if (this.unreadable) return;
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ [this.key]: value })) }
      : { [this.key]: value };
  }
}
