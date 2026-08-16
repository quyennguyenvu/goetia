import type { QuietHoursSchedule } from '../../shared/types';

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Window starting on `day` — end lands next day when the window crosses
 *  midnight. Built from local date parts so DST moves boundaries with the
 *  wall clock instead of shifting them. */
function windowStartingOn(day: Date, startMin: number, endMin: number): { start: Date; end: Date } {
  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(startMin / 60),
    startMin % 60,
  );
  const endDayOffset = endMin > startMin ? 0 : 1;
  const end = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + endDayOffset,
    Math.floor(endMin / 60),
    endMin % 60,
  );
  return { start, end };
}

/** The engaged window covering `now`, or null. A crossing window belongs to
 *  the day it starts, so only the windows starting today and yesterday can
 *  cover `now`. `start` doubles as the window's identity. */
export function quietWindowFor(
  now: Date,
  q: QuietHoursSchedule,
): { start: Date; end: Date } | null {
  if (!q.enabled) return null;
  const startMin = minutesOf(q.start);
  const endMin = minutesOf(q.end);
  if (startMin === endMin) return null; // empty window, not 24h quiet
  for (const dayOffset of [0, -1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    if (!q.days[day.getDay()]) continue;
    const w = windowStartingOn(day, startMin, endMin);
    if (now >= w.start && now < w.end) return w;
  }
  return null;
}

/** Engaged and not the one window the user dismissed by unmuting. */
export function quietNow(
  now: Date,
  q: QuietHoursSchedule,
  overrideWindowStart: number | null,
): boolean {
  const w = quietWindowFor(now, q);
  return w !== null && w.start.getTime() !== overrideWindowStart;
}

/** The next instant engagement can change — the current window's end, or the
 *  next start within a week. Null when the schedule can never engage. */
export function nextBoundary(now: Date, q: QuietHoursSchedule): Date | null {
  if (!q.enabled || q.days.every((d) => !d)) return null;
  const startMin = minutesOf(q.start);
  const endMin = minutesOf(q.end);
  if (startMin === endMin) return null;
  const current = quietWindowFor(now, q);
  if (current) return current.end;
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    if (!q.days[day.getDay()]) continue;
    const { start } = windowStartingOn(day, startMin, endMin);
    if (start > now) return start;
  }
  return null;
}

/** The mute toggle's two cases: silence on is a plain persistent mute;
 *  silence off mid-window dismisses exactly that window. */
export function muteToggleResult(o: { wantSilence: boolean; engagedWindowStart: number | null }): {
  globalMuted: boolean;
  quietOverrideWindowStart: number | null;
} {
  if (o.wantSilence) return { globalMuted: true, quietOverrideWindowStart: null };
  return { globalMuted: false, quietOverrideWindowStart: o.engagedWindowStart };
}
