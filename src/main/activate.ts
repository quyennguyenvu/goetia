import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { type ActivityEntry, openHref } from './lib/activity-log';
import { withPage } from './lib/diagnostics';
import { type BannerClickAction, resolveBannerClick } from './lib/notification-click';
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
  if (key === 'settingsOpen' && !open) {
    ctx.state.settingsFocus = null;
    ctx.recorder.cancel(); // a recording cannot outlive the pane that asked
  }
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

/** Move the shell onto or off the lock screen. Views come back through the
 *  same presentSurface every other surface uses. Returns whether anything
 *  changed, so the caller can skip a menu rebuild and a broadcast.
 *
 *  MainState.locked mirrors LockController.locked; this is its only writer,
 *  and callers pass the controller's answer rather than a literal, so the
 *  flag the renderer sees cannot disagree with the controller. */
export function applyLocked(ctx: AppContext, locked: boolean): boolean {
  if (ctx.state.locked === locked) return false;
  ctx.state.locked = locked;
  presentSurface(ctx);
  ctx.state.touch();
  return true;
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

/** Shared tail of a banner, recents or pin click: land on the service, then
 *  route as deep as the resolved action allows. show-only means the service
 *  was banished — the window is up, nothing else. A live view runs the lane
 *  chain in-page and reports back: a miss is logged as evidence (the row did
 *  nothing but switch services, and this line says which lanes it had), and
 *  a replay that moved the document teaches the activity entry its URL — the
 *  one durable handle a shim-only (Discord) row can have. */
export async function performBannerAction(
  ctx: AppContext,
  id: ServiceId,
  action: BannerClickAction,
  opts: { entryId?: number } = {},
): Promise<void> {
  if (action.kind === 'show-only') return;
  activateService(ctx, id);
  if (action.kind === 'navigate') ctx.views.openConversation(id, action.url);
  if (action.kind !== 'open-in-page') return;
  const { kind: _kind, ...req } = action;
  const result = await ctx.views.openInPage(id, req);
  if (!result) return;
  if (result.lane === 'miss') {
    const lanes = Object.keys(req).join(',');
    ctx.diag.note('open', withPage(`${id} miss: lanes=${lanes}`, ctx.views.pageUrl(id)), id);
  } else if (result.lane === 'replay' && result.url && opts.entryId !== undefined) {
    ctx.activity.learnUrl(opts.entryId, result.url);
  }
}

/** Open the conversation an activity entry names — a banner click, a recents
 *  row, or a click parked behind the lock. The entry is what the log holds
 *  NOW, never the payload the banner was built from: a Notification Center
 *  banner is clicked hours later, and by then onNavigate has forgotten a
 *  replay handle whose document is gone — the shim's ids restart at 1 in the
 *  next one, so the fire-time id replays a DIFFERENT banner, a hit on the
 *  wrong thread that the name lane never gets to correct — and a landed
 *  replay may have taught the row a URL the payload never had. */
export function openActivityEntry(ctx: AppContext, entry: ActivityEntry): void {
  const meta = serviceById(entry.serviceId);
  const action = resolveBannerClick({
    // a stale banner can outlive its service being banished on Home
    disabled: ctx.settings.get().disabled[entry.serviceId],
    hasView: ctx.views.has(entry.serviceId),
    clickId: entry.clickId,
    href: openHref(entry),
    conversation: meta.bannerTitleNamesConversation ? entry.conversation : undefined,
    serviceUrl: meta.url,
    chatPaths: meta.chatPaths,
  });
  void performBannerAction(ctx, entry.serviceId, action, { entryId: entry.id });
}
