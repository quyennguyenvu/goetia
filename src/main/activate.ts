import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';

/** Remember the surface to restore on the next launch. Written on change, not
 *  at quit: force-quit, a crash, and an OS restart never run before-quit.
 *  Settings and the quick switcher are modals you pass through, so Home is the
 *  only overlay recorded. */
export function rememberSurface(ctx: AppContext): void {
  ctx.settings.update({
    lastActiveId: ctx.state.activeId,
    lastHomeOpen: ctx.state.homeOpen,
  });
}

/** Open or close Home. Both ⌘/Ctrl 0 and the IPC handler route here so the
 *  surface is recorded however Home was reached. Focus stays with the caller:
 *  the two paths deliberately differ there. */
export function setHomeOpen(ctx: AppContext, open: boolean): void {
  ctx.state.homeOpen = open;
  if (open) ctx.views.hideActive();
  else ctx.views.showActive();
  rememberSurface(ctx);
  ctx.state.touch();
}

/** Single entry point for switching services: closes any overlay (settings,
 *  quick switcher) first, then activates — keeps shell state and the native
 *  view layer consistent no matter where the switch came from. */
export function activateService(ctx: AppContext, id: ServiceId): void {
  ctx.state.settingsOpen = false;
  ctx.state.switcherOpen = false;
  ctx.state.homeOpen = false;
  ctx.state.activeId = id;
  ctx.state.setRuntime(id, { hibernated: false });
  ctx.noteActivated(id);
  ctx.views.activate(id);
  rememberSurface(ctx);
  // Broadcast the new activeId. setRuntime above only notifies when it changes
  // a field, so for an already-non-hibernated service it is a no-op and the
  // rail/content would not update until the next state change (e.g. a reload).
  ctx.state.touch();
}
