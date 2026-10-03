/** facebook's calls-off switch as the rail shows it. Process-agnostic, so the
 *  renderer can label the tile without main code. `until` is
 *  ServiceRuntime.callsOffUntil: 0 = not known to be off, -1 = off until
 *  turned back on, epoch ms = off until then. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function isCallsOff(until: number, now: number): boolean {
  return until === -1 || until > now;
}

/** `until 14:30`, `until tomorrow 08:00`, `until 10 Oct 09:05`; '' with no end.
 *  Not muteLabel: facebook's blocks can outlast tomorrow. */
export function callsOffLabel(until: number, now: Date): string {
  if (until <= now.getTime()) return '';
  const end = new Date(until);
  // rounded: a DST day is 23 or 25 hours long
  const days = Math.round((dayStart(end) - dayStart(now)) / 86_400_000);
  if (days === 0) return `until ${hhmm(end)}`;
  if (days === 1) return `until tomorrow ${hhmm(end)}`;
  return `until ${end.getDate()} ${MONTHS[end.getMonth()]} ${hhmm(end)}`;
}

export function callsOffTooltip(until: number, now: Date): string {
  const when = callsOffLabel(until, now);
  return `Incoming calls are off on Facebook${when ? ` ${when}` : ''} — right-click to turn on`;
}
