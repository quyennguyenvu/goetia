import {
  activateService,
  onScreenKey,
  openRecentEntry,
  setHomeOpen,
  setOverlayOpen,
} from './activate';
import type { AppContext } from './ipc-handlers';
import { anyOverlayOpen } from './lib/overlay-rules';
import { conversationKey } from './lib/recents-rules';
import { beginWalk, stepWalk, walkActive, walkTargets } from './lib/recents-walk';
import type { ShellCommand } from './lib/shortcuts';
import { stepZoom } from './lib/zoom-rules';
import { toggleDetachedDevTools } from './views';

export function openSettings(ctx: AppContext): void {
  setOverlayOpen(ctx, 'settingsOpen', true);
  ctx.win.webContents.focus(); // so Escape closes the modal immediately
}

/** Settings, opened on the Downloads pane. `seq` bumps so a second press
 *  with Settings already open on another pane lands there again. */
export function openDownloads(ctx: AppContext): void {
  const seq = (ctx.state.settingsFocus?.seq ?? 0) + 1;
  ctx.state.settingsFocus = { section: 'downloads', seq };
  openSettings(ctx);
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
    case 'conversation': {
      // ⌘K's Recent list from the keyboard: ] is the row below (older), [ the
      // row above (newer), over a snapshot — the row just opened moves to the
      // top, and the live order would turn the second press into a ping-pong
      const now = Date.now();
      const s = ctx.settings.get();
      const walk = walkActive(ctx.state.walk, now)
        ? ctx.state.walk
        : beginWalk(
            walkTargets(ctx.recents.rows(), (x) => !s.disabled[x]),
            onScreenKey(ctx),
            now,
          );
      const stepped = stepWalk(walk, command.step, now);
      ctx.state.walk = stepped.walk;
      if (stepped.target === null) return; // one row, and it is the one on screen
      const entry = ctx.recents.rows().find((r) => conversationKey(r) === stepped.target);
      if (!entry) return; // purged between the snapshot and this press
      ctx.win.show();
      openRecentEntry(ctx, entry);
      // activateService inside cleared the walk; it is stored again so the
      // next press within the deadline keeps stepping the snapshot
      ctx.state.walk = stepped.walk;
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
    case 'downloads':
      openDownloads(ctx);
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
