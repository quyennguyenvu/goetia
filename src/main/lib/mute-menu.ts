import { type MuteFor, muteLabel } from '../../shared/mute';

/** The durations every Mute offers — one table for the tile menu, the bell,
 *  the tray and the app menu, so the two grains share a vocabulary. */
export const MUTE_CHOICES: { kind: MuteFor; label: string }[] = [
  { kind: 'hour', label: 'For 1 hour' },
  { kind: 'tomorrow', label: 'Until tomorrow' },
  { kind: 'indefinite', label: 'Until I unmute' },
];

/** `Unmute`, or `Unmute (until 14:30)` when the mute is timed. */
export function labelUnmute(verb: string, until: number, now: Date): string {
  const when = muteLabel(until, now);
  return when ? `${verb} (${when})` : verb;
}

export type GlobalMuteMenu =
  | { type: 'submenu'; label: string; items: { kind: MuteFor; label: string }[] }
  | { type: 'item'; label: string };

/** The global mute entry both menus and the bell's popup build from. It
 *  carries the state in its label, not a checkbox: a checkbox cannot be a
 *  submenu. `silenced` is `globalMuted || quietNow`; during quiet hours with
 *  no global mute `until` is 0 and the item is a plain Unmute, whose click is
 *  the existing mid-window override. */
export function globalMuteMenu(o: { silenced: boolean; until: number; now: Date }): GlobalMuteMenu {
  return o.silenced
    ? { type: 'item', label: labelUnmute('Unmute All Notifications', o.until, o.now) }
    : { type: 'submenu', label: 'Mute All Notifications', items: MUTE_CHOICES };
}
