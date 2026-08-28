import Conf from 'conf';
import { PIN_CAP, PIN_NOTE_MAX, PIN_TEXT_MAX } from '../shared/pins';
import { SERVICES, serviceById } from '../shared/services';
import type { PinView, ServiceId } from '../shared/types';
import {
  clampText,
  conversationFromTitle,
  isPermutation,
  PIN_CONVERSATION_MAX,
  type Pin,
  parsePins,
  pinViews,
} from './lib/pin-rules';

interface PinsFile {
  pins: Pin[];
}

/** The pinboard: an ordered todo list of messages the user chose to keep.
 *  Persisted to <cwd>/pins.json — the one deliberate exception to
 *  "conversation content never touches disk": unchosen content (the activity
 *  log) still never does; a pin is explicit, and it leaves the file with the
 *  pin. One atomic write per mutation: every mutation is a user click, and a
 *  drag reaches here once, so nothing needs deferring. */
export class PinStore {
  private conf: Conf<PinsFile>;
  private pins: Pin[];
  private nextId: number;
  /** the most recent removal, kept for one Undo */
  private lastRemoved: { pin: Pin; index: number } | null = null;

  constructor(cwd: string) {
    this.conf = new Conf<PinsFile>({
      cwd,
      configName: 'pins',
      defaults: { pins: [] },
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    this.pins = parsePins(this.conf.store.pins, new Set(SERVICES.map((s) => s.id)));
    this.nextId = this.pins.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  }

  all(): readonly Pin[] {
    return this.pins;
  }

  get(id: number): Pin | undefined {
    return this.pins.find((p) => p.id === id);
  }

  isFull(): boolean {
    return this.pins.length >= PIN_CAP;
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
    const index = this.pins.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.lastRemoved = { pin: this.pins[index], index };
    this.pins = this.pins.filter((p) => p.id !== id);
    this.save();
    return true;
  }

  /** Undo the last removal, back at its old position (clamped to the end). */
  restore(id: number): boolean {
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
    const pin = this.get(id);
    if (!pin) return false;
    const clamped = clampText(note, PIN_NOTE_MAX);
    if (clamped === pin.note) return false;
    this.pins = this.pins.map((p) => (p.id === id ? { ...p, note: clamped } : p));
    this.save();
    return true;
  }

  reorder(ids: number[]): boolean {
    const current = this.pins.map((p) => p.id);
    if (!isPermutation(ids, current) || ids.every((id, i) => id === current[i])) return false;
    const byId = new Map(this.pins.map((p) => [p.id, p]));
    this.pins = ids.map((id) => byId.get(id)).filter((p): p is Pin => p !== undefined);
    this.save();
    return true;
  }

  private save(): void {
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = { pins: this.pins };
  }
}
