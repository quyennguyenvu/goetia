import { hhmm, MONTHS, sameDay } from './mute';

/** The pinboard's limits. Shared: main enforces them, the renderer mirrors
 *  them on the note input and the menu label. */
export const PIN_CAP = 50;
export const PIN_TEXT_MAX = 300;
export const PIN_NOTE_MAX = 200;

/** What Copy puts on the clipboard: the message minus the ellipsis a cut pin
 *  ends in — it is pasted into the service's own search and must match. */
export function pinCopyText(text: string): string {
  return text.length === PIN_TEXT_MAX && text.endsWith('…') ? text.slice(0, -1).trimEnd() : text;
}

/** A reminder that has come due stays due until the user acts on the pin. */
export function isDue(remindAt: number, now: number): boolean {
  return remindAt > 0 && remindAt <= now;
}

/** The words beside a pin's clock: '' with no reminder, `16:00` or
 *  `tomorrow 08:00` while scheduled, `due 14:30` once due — `due 13 Nov` when
 *  the day has turned since. */
export function reminderLabel(remindAt: number, now: Date): string {
  if (remindAt <= 0) return '';
  const at = new Date(remindAt);
  const today = sameDay(at, now);
  if (remindAt <= now.getTime()) {
    return today ? `due ${hhmm(at)}` : `due ${at.getDate()} ${MONTHS[at.getMonth()]}`;
  }
  // shortcut: any later day reads "tomorrow" — the menu offers nothing further out; date it when a custom time lands
  return today ? hhmm(at) : `tomorrow ${hhmm(at)}`;
}
