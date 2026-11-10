/** How long a toast stays before it leaves by itself. Shared because main
 *  runs the download toast's clock and the renderer runs every other one. */
export const TOAST_MS = 8000;

/** The reveal action's name. The Downloads pane and the download toast must
 *  read the same words, and only main knows the platform for the toast. */
export function revealLabel(platform: string): string {
  return platform === 'darwin' ? 'Show in Finder' : 'Show in folder';
}
