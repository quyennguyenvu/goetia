/** What a number field saves when it is left: the typed value held to the
 *  field's range, or null (save nothing) for an empty or unreadable draft. */
export function commitNumberDraft(draft: string, min: number, max: number): number | null {
  const n = Number(draft);
  if (draft.trim() === '' || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
