import Conf from 'conf';
import { PIN_CAP, PIN_NOTE_MAX, PIN_TEXT_MAX } from '../shared/pins';
import { SERVICES, serviceById } from '../shared/services';
import type { PinView, ServiceId } from '../shared/types';
import type { KeyCodec } from './codec';
import {
  clampText,
  conversationFromTitle,
  isPermutation,
  PIN_CONVERSATION_MAX,
  type Pin,
  parsePins,
  pinViews,
} from './lib/pin-rules';

/** On disk: one of the two keys, or neither on a fresh profile. `sealed` is
 *  the codec's output over JSON.stringify({ pins }); `pins` is the legacy
 *  plaintext shape, still written when no keychain is available. */
interface PinsFile {
  sealed?: string;
  pins?: Pin[];
}

/** The pinboard: an ordered todo list of messages the user chose to keep.
 *  Persisted to <cwd>/pins.json — the one deliberate exception to
 *  "conversation content never touches disk": unchosen content (the activity
 *  log) still never does; a pin is explicit, and it leaves the file with the
 *  pin. Since 2026-09-23 the file is a safeStorage-sealed envelope, the tier
 *  the cookies and passkeys rest under; a legacy plaintext file is re-sealed
 *  at construction. One atomic write per mutation: every mutation is a user
 *  click, and a drag reaches here once, so nothing needs deferring. */
export class PinStore {
  private conf: Conf<PinsFile>;
  private pins: Pin[] = [];
  private nextId: number;
  /** the most recent removal, kept for one Undo */
  private lastRemoved: { pin: Pin; index: number } | null = null;
  /** a sealed file exists but would not open on this boot — read nothing,
   *  write nothing, so a keychain hiccup can never overwrite the todo list */
  private unreadable = false;

  constructor(
    cwd: string,
    private codec: KeyCodec | null,
  ) {
    this.conf = new Conf<PinsFile>({
      cwd,
      configName: 'pins',
      // no `pins: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    const known = new Set(SERVICES.map((s) => s.id));
    const raw = this.conf.store;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        this.pins = parsePins((opened as { pins?: unknown } | null)?.pins, known);
      } catch {
        this.unreadable = true;
      }
    } else if (Array.isArray(raw.pins)) {
      this.pins = parsePins(raw.pins, known);
      // migrate: the plaintext leaves the disk now, not on the next click
      if (codec) this.save();
    }
    this.nextId = this.pins.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  }

  /** True when pins.json is sealed but the keychain would not open it this
   *  boot. The board reads empty and refuses every write until a launch
   *  where it does; index.ts notes it and Home's band says so. */
  isUnreadable(): boolean {
    return this.unreadable;
  }

  all(): readonly Pin[] {
    return this.pins;
  }

  get(id: number): Pin | undefined {
    return this.pins.find((p) => p.id === id);
  }

  /** Also true while unreadable: that one gate is what disables the
   *  context-menu item and makes pin() return null, so nothing new is wired. */
  isFull(): boolean {
    return this.unreadable || this.pins.length >= PIN_CAP;
  }

  views(): PinView[] {
    return pinViews(this.pins);
  }

  /** Append to the end of the queue. Null when full, when nothing pinnable
   *  survives clamping, or when the same text from the same conversation is
   *  already on the board — a second right-click is a slip, not a second
   *  todo. `conversation` is the recipe's own name for the open thread when
   *  the site has one (WhatsApp); otherwise the page `title` is read for it. */
  pin(input: {
    serviceId: ServiceId;
    text: string;
    href: string;
    title: string;
    conversation?: string | null;
    at: number;
  }): Pin | null {
    if (this.isFull()) return null;
    const text = clampText(input.text, PIN_TEXT_MAX);
    if (text === '') return null;
    const conversation =
      clampText(input.conversation ?? '', PIN_CONVERSATION_MAX) ||
      conversationFromTitle(input.title, serviceById(input.serviceId).name);
    const dup = this.pins.some(
      (p) =>
        p.serviceId === input.serviceId &&
        p.href === input.href &&
        p.conversation === conversation &&
        p.text === text,
    );
    if (dup) return null;
    const pin: Pin = {
      id: this.nextId++,
      serviceId: input.serviceId,
      text,
      note: '',
      conversation,
      href: input.href,
      at: input.at,
    };
    this.pins = [...this.pins, pin];
    this.save();
    return pin;
  }

  /** Done and unpin both land here: the pin leaves the board and stays
   *  restorable until the next removal. */
  unpin(id: number): boolean {
    if (this.unreadable) return false;
    const index = this.pins.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.lastRemoved = { pin: this.pins[index], index };
    this.pins = this.pins.filter((p) => p.id !== id);
    this.save();
    return true;
  }

  /** Undo the last removal, back at its old position (clamped to the end). */
  restore(id: number): boolean {
    if (this.unreadable) return false;
    const last = this.lastRemoved;
    if (!last || last.pin.id !== id || this.isFull()) return false;
    const next = [...this.pins];
    next.splice(Math.min(last.index, next.length), 0, last.pin);
    this.pins = next;
    this.lastRemoved = null;
    this.save();
    return true;
  }

  setNote(id: number, note: string): boolean {
    if (this.unreadable) return false;
    const pin = this.get(id);
    if (!pin) return false;
    const clamped = clampText(note, PIN_NOTE_MAX);
    if (clamped === pin.note) return false;
    this.pins = this.pins.map((p) => (p.id === id ? { ...p, note: clamped } : p));
    this.save();
    return true;
  }

  reorder(ids: number[]): boolean {
    if (this.unreadable) return false;
    const current = this.pins.map((p) => p.id);
    if (!isPermutation(ids, current) || ids.every((id, i) => id === current[i])) return false;
    const byId = new Map(this.pins.map((p) => [p.id, p]));
    this.pins = ids.map((id) => byId.get(id)).filter((p): p is Pin => p !== undefined);
    this.save();
    return true;
  }

  private save(): void {
    if (this.unreadable) return; // never overwrite what could not be read
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ pins: this.pins })) }
      : { pins: this.pins };
  }
}
