import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import type { BannerClickAction } from './lib/notification-click';
import { anyOverlayOpen } from './lib/overlay-rules';

/** Remember the surface to restore on the next launch. Written on change, not
 *  at quit: force-quit, a crash, and an OS restart never run before-quit.
 *  Settings and the quick switcher are modals you pass through, so Home is the
 *  only overlay recorded. A service activation also resets the unused clock
 *  auto-banish reads, in the same write. */
export function rememberSurface(ctx: AppContext, usedId?: ServiceId): void {
  ctx.settings.update({
    lastActiveId: ctx.state.activeId,
    lastHomeOpen: ctx.state.homeOpen,
    ...(usedId ? { lastUsedAt: { ...ctx.settings.get().lastUsedAt, [usedId]: Date.now() } } : {}),
  });
}

/** Match the view layer to the shell's surfaces. Every surface toggle routes
 *  here rather than pairing its own hide/show: closing one surface while
 *  another is still open must leave the view down, or it buries what is left
 *  on screen (settings closed over Home). */
function presentSurface(ctx: AppContext): void {
  if (anyOverlayOpen(ctx.state)) ctx.views.hideActive();
  else ctx.views.showActive();
}

/** Open or close a modal surface (settings, quick switcher). */
export function setOverlayOpen(
  ctx: AppContext,
  key: 'settingsOpen' | 'switcherOpen',
  open: boolean,
): void {
  ctx.state[key] = open;
  presentSurface(ctx);
  ctx.state.touch();
}

/** Open or close Home. Both ⌘/Ctrl ⇧ G and the IPC handler route here so the
 *  surface is recorded however Home was reached. Focus stays with the caller:
 *  the two paths deliberately differ there. Home is a destination, not a
 *  toggle — asking for the surface you are already on is a no-op, not a trip
 *  back to the last service (2026-08-25, user decision). */
export function setHomeOpen(ctx: AppContext, open: boolean): void {
  const changed = ctx.state.homeOpen !== open;
  ctx.state.homeOpen = open;
  presentSurface(ctx);
  if (!changed) return; // a repeat click costs no settings write and no broadcast
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
  rememberSurface(ctx, id);
  // Broadcast the new activeId. setRuntime above only notifies when it changes
  // a field, so for an already-non-hibernated service it is a no-op and the
  // rail/content would not update until the next state change (e.g. a reload).
  ctx.state.touch();
}

/** Shared tail of a banner or recents click: land on the service, then route
 *  as deep as the resolved action allows. show-only means the service was
 *  banished after the fact — activate nothing. */
export function performBannerAction(
  ctx: AppContext,
  id: ServiceId,
  action: BannerClickAction,
  /** a pin's conversation name, for sites whose URL cannot single out a thread */
  conversation?: string,
): void {
  if (action.kind === 'show-only') return;
  activateService(ctx, id);
  if (action.kind === 'navigate') ctx.views.openConversation(id, action.url);
  if (action.kind === 'open-in-page') {
    ctx.views.sendOpenConversation(id, action.href, action.url, conversation);
  }
  if (action.kind === 'replay') ctx.views.sendReplayClick(id, action.clickId);
}
