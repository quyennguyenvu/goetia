/** Any shell-rendered surface that a service view would cover. A visible
 *  WebContentsView is layered above the renderer, so activating one while a
 *  surface is up buries it and steals the keyboard. */
export function anyOverlayOpen(s: {
  settingsOpen: boolean;
  switcherOpen: boolean;
  homeOpen: boolean;
}): boolean {
  return s.settingsOpen || s.switcherOpen || s.homeOpen;
}
