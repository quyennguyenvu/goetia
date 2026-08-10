export interface BadgeEntry {
  direct: number;
  indirect: number;
}

export interface BadgeSummary {
  total: number;
  indirectOnly: boolean;
}

/** Mute takes the sound and the banner, never the count: the badge is the one
 *  place a muted service is still allowed to say something, and it's how you
 *  find what arrived while muted. Matches the rail, which always badged
 *  muted tiles. */
export function aggregateBadges(entries: BadgeEntry[]): BadgeSummary {
  const total = entries.reduce((sum, e) => sum + e.direct, 0);
  return { total, indirectOnly: total === 0 && entries.some((e) => e.indirect > 0) };
}

export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
