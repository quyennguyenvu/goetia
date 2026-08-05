export interface BadgeEntry {
  direct: number;
  indirect: number;
  muted: boolean;
}

export interface BadgeSummary {
  total: number;
  indirectOnly: boolean;
}

export function aggregateBadges(entries: BadgeEntry[], globalMuted: boolean): BadgeSummary {
  if (globalMuted) return { total: 0, indirectOnly: false };
  const audible = entries.filter((e) => !e.muted);
  const total = audible.reduce((sum, e) => sum + e.direct, 0);
  return { total, indirectOnly: total === 0 && audible.some((e) => e.indirect > 0) };
}

export function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}
