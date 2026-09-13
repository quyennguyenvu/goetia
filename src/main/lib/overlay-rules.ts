/** Any shell-rendered surface that a service view would cover. A visible
 *  WebContentsView is layered above the renderer, so activating one while a
 *  surface is up buries it and steals the keyboard. The lock screen is such a
 *  surface, and the one where being buried would defeat the surface entirely. */
export function anyOverlayOpen(s: {
  settingsOpen: boolean;
  switcherOpen: boolean;
  homeOpen: boolean;
  locked: boolean;
}): boolean {
  return s.settingsOpen || s.switcherOpen || s.homeOpen || s.locked;
}
