/** Comparison form of a conversation name: composed, without the variation
 *  selectors (U+FE0E/U+FE0F) that pick an emoji's text or colour presentation. */
export function nameKey(name: string): string {
  return name.normalize('NFC').replace(/[\uFE0E\uFE0F]/g, '');
}

/** A stored label (a pin, a Recent row) may have been clipped with an
 *  ellipsis; the live name never is, so a clipped label matches on its prefix.
 *  Emoji compare by glyph, not presentation: a banner title is the site's
 *  rendering of the name (WhatsApp qualifies "❤" to "❤️" before it titles a
 *  banner) while the row keeps the raw text. */
export function nameMatches(candidate: string, stored: string): boolean {
  const c = nameKey(candidate);
  const p = nameKey(stored);
  if (c === p) return true;
  return p.endsWith('…') && p.length > 1 && c.startsWith(p.slice(0, -1));
}
