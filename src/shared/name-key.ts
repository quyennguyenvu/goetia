/** Comparison form of a conversation name: composed, without the variation
 *  selectors (U+FE0E/U+FE0F) that pick an emoji's text or colour presentation. */
export function nameKey(name: string): string {
  return name.normalize('NFC').replace(/[\uFE0E\uFE0F]/g, '');
}
