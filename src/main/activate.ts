import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';

/** Single entry point for switching services: closes any overlay (settings,
 *  quick switcher) first, then activates — keeps shell state and the native
 *  view layer consistent no matter where the switch came from. */
export function activateService(ctx: AppContext, id: ServiceId): void {
  ctx.state.settingsOpen = false;
  ctx.state.switcherOpen = false;
  ctx.state.activeId = id;
  ctx.state.setRuntime(id, { hibernated: false });
  ctx.noteActivated(id);
  ctx.views.activate(id);
  // Broadcast the new activeId. setRuntime above only notifies when it changes
  // a field, so for an already-non-hibernated service it is a no-op and the
  // rail/content would not update until the next state change (e.g. a reload).
  ctx.state.touch();
}
