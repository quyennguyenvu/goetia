/** Timed per-service mute: the choices the tile menu offers and the labels
 *  the menu and the rail show. Process-agnostic — wall-clock arithmetic only,
 *  so the renderer can label a tile without main code. */

export type MuteFor = 'hour' | 'tomorrow' | 'indefinite';

export const MUTE_HOUR_MS = 3_600_000;
/** "Until tomorrow" ends at this local hour on the next calendar morning. */
export const TOMORROW_HOUR = 8;

/** The expiry (epoch ms) for a choice made at `now`; 0 for indefinite. Built
 *  with local Date setters, so a DST change moves the instant, not the hour. */
export function muteExpiry(kind: MuteFor, now: Date): number {
  switch (kind) {
    case 'hour':
      return now.getTime() + MUTE_HOUR_MS;
    case 'tomorrow': {
      const t = new Date(now);
      t.setHours(TOMORROW_HOUR, 0, 0, 0);
      // set after midnight but before 08:00: that morning is "tomorrow" enough
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
      return t.getTime();
    }
    case 'indefinite':
      return 0;
  }
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** `until 14:30`, `until tomorrow 08:00`, or '' for no expiry or one already past. */
export function muteLabel(until: number, now: Date): string {
  if (until <= 0 || until <= now.getTime()) return '';
  const end = new Date(until);
  return sameDay(end, now) ? `until ${hhmm(end)}` : `until tomorrow ${hhmm(end)}`;
}
