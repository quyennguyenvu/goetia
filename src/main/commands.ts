import { activateService, setHomeOpen, setOverlayOpen } from './activate';
import type { AppContext } from './ipc-handlers';
import { anyOverlayOpen } from './lib/overlay-rules';
import type { ShellCommand } from './lib/shortcuts';
import { stepZoom } from './lib/zoom-rules';
import { toggleDetachedDevTools } from './views';

export function openSettings(ctx: AppContext): void {
  setOverlayOpen(ctx, 'settingsOpen', true);
  ctx.win.webContents.focus(); // so Escape closes the modal immediately
}

/** Zoom acts on the active service view; with no view anywhere (fresh
 *  install on Home) it is a silent no-op. Persist first, then re-apply. */
function setActiveZoom(ctx: AppContext, next: (current: number) => number): void {
  const id = ctx.state.activeId;
  if (!ctx.views.has(id)) return;
  const s = ctx.settings.get();
  // deferred: ⌘+ is a key-repeat path and an atomic write costs ~5 ms. The
  // level is live in the cache immediately, so applyZoom below still reads it;
  // a hard kill inside the window loses one zoom step and nothing else.
  ctx.settings.updateDeferred({ zoom: { ...s.zoom, [id]: next(s.zoom[id]) } });
  ctx.views.applyZoom(id);
}

/** One implementation per chord, shared by the app-menu items and the
 *  `before-input-event` interceptor in the service views — a key pressed
 *  inside a page does exactly what its menu item does. */
export function runShellCommand(ctx: AppContext, command: ShellCommand): void {
  // A locked app must not act on a chord or a menu item: Toggle Developer
  // Tools would open an inspector on the shell, and Cmd-1 would put a service
  // on screen. One guard here covers both routes, because the menu items and
  // the in-view interceptor call this same function.
  if (ctx.lock.locked) return;
  switch (command.kind) {
    case 'home':
      ctx.win.show();
      setHomeOpen(ctx, true);
      ctx.win.webContents.focus();
      return;
    case 'service': {
      const s = ctx.settings.get();
      const id = s.order.filter((x) => !s.disabled[x])[command.index];
      if (!id) return;
      ctx.win.show();
      activateService(ctx, id);
      return;
    }
    case 'pin-selection':
      // only a service page on screen has a selection worth pinning
      if (anyOverlayOpen(ctx.state)) return;
      void ctx.views.pinSelection(ctx.state.activeId);
      return;
    case 'switcher':
      setOverlayOpen(ctx, 'switcherOpen', !ctx.state.switcherOpen);
      ctx.win.webContents.focus();
      return;
    case 'mute':
      // the menu item's own `checked` is stale the moment mute moves
      // elsewhere; read effective silence and let setGlobalMuted rebuild
      ctx.setGlobalMuted(!(ctx.settings.get().globalMuted || ctx.quietNow()));
      return;
    case 'settings':
      openSettings(ctx);
      return;
    case 'lock':
      // lock() refuses when the setting is off or no passcode is set: locking
      // with no door is a lockout, not a lock
      ctx.lock.lock();
      ctx.syncLocked();
      return;
    case 'reload':
      ctx.views.refresh(ctx.state.activeId);
      return;
    case 'zoom':
      setActiveZoom(ctx, (z) => (command.step === 0 ? 0 : stepZoom(z, command.step)));
      return;
    case 'devtools':
      // inspect whatever is on screen: a shell surface, else the service page
      if (anyOverlayOpen(ctx.state)) toggleDetachedDevTools(ctx.win.webContents);
      else ctx.views.toggleDevTools(ctx.state.activeId);
      return;
  }
}
