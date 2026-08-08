export const TOAST_MS = 8000;

/** Announce a version once. `lastToasted` is the shell's own memory, so a
 *  re-broadcast of unchanged state is a no-op. */
export function shouldToast(announce: string | null, lastToasted: string | null): boolean {
  return announce !== null && announce !== lastToasted;
}
