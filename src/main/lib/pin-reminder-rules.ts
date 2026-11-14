import { type MuteFor, TOMORROW_AT } from '../../shared/mute';
import { isDue } from '../../shared/pins';
import type { ServiceId } from '../../shared/types';
import { shouldNotify, soundOptions } from './notification-rules';
import type { Pin } from './pin-rules';

export type RemindKind = Exclude<MuteFor, 'indefinite'>;

/** The times a pin offers — the mute menu's two, worded for a reminder. The
 *  time itself is muteExpiry(kind, now), so the after-midnight rule comes
 *  with it. */
export const REMIND_CHOICES: { kind: RemindKind; label: string }[] = [
  { kind: 'hour', label: 'In 1 hour' },
  { kind: 'tomorrow', label: `${TOMORROW_AT[0].toUpperCase()}${TOMORROW_AT.slice(1)}` },
];

export type ReminderMenuItem =
  | { type: 'choice'; kind: RemindKind; label: string }
  | { type: 'separator' }
  | { type: 'clear'; label: string };

/** The clock's menu on a pin row: the choices, and Clear once one is set. */
export function reminderMenu(pin: Pick<Pin, 'remindAt'>): ReminderMenuItem[] {
  const choices = REMIND_CHOICES.map((c): ReminderMenuItem => ({ type: 'choice', ...c }));
  if (pin.remindAt <= 0) return choices;
  return [...choices, { type: 'separator' }, { type: 'clear', label: 'Clear reminder' }];
}

/** The earliest reminder not yet announced, or null. It may already be past:
 *  the controller then fires at once. */
export function nextReminder(pins: readonly Pin[]): number | null {
  let next: number | null = null;
  for (const p of pins) {
    if (p.remindAt > 0 && !p.reminded && (next === null || p.remindAt < next)) next = p.remindAt;
  }
  return next;
}

/** What one fire announces, in board order. */
export function dueReminders(pins: readonly Pin[], now: number): Pin[] {
  return pins.filter((p) => !p.reminded && isDue(p.remindAt, now));
}

export interface ReminderNotice {
  title: string;
  body: string;
  /** the pin a click opens; null for a summary, whose click is Home */
  pin: Pin | null;
}

/** One announcement per fire: the pin itself when one came due, a count when
 *  several did — two pins set to "Tomorrow" share an instant. `due` is never
 *  empty: the controller announces only what dueReminders returned. */
export function reminderNotice(
  due: readonly Pin[],
  serviceName: (id: ServiceId) => string,
): ReminderNotice {
  if (due.length !== 1) {
    return {
      title: `${due.length} pinned reminders are due`,
      body: 'Open Home to see them',
      pin: null,
    };
  }
  const [pin] = due;
  return {
    title: `Reminder · ${pin.conversation || serviceName(pin.serviceId)}`,
    body: pin.note ? `${pin.note} — ${pin.text}` : pin.text,
    pin,
  };
}

/** Silence takes a reminder's sound and never the reminder: the user chose
 *  the time, so mute and quiet hours decide `silent` here and nothing else. */
export function reminderSound(o: {
  enabled: boolean;
  serviceMuted: boolean;
  globalMuted: boolean;
  quietNow: boolean;
}): { silent: boolean; sound?: string } {
  return soundOptions({ enabled: o.enabled && shouldNotify(o), synthetic: true });
}
