import { muteExpiry } from '../shared/mute';
import type { AppContext } from './ipc-handlers';
import { globalMuteMenu } from './lib/mute-menu';

/** The global mute entry for the app menu, the tray and the bell's popup —
 *  one shape (`globalMuteMenu`) so the three never drift. `toggle` is the
 *  caller's on/off path (the app menu's runs through `runShellCommand` and
 *  its lock guard; the tray's never did); `guarded` puts the duration clicks
 *  behind the same lock check. The accelerator rides whichever leaf the
 *  toggle lives on, so it is declared exactly once however the entry folds. */
export function globalMuteMenuTemplate(
  ctx: AppContext,
  o: { toggle: () => void; guarded: boolean; accelerator?: string },
): Electron.MenuItemConstructorOptions {
  const s = ctx.settings.get();
  const m = globalMuteMenu({
    silenced: s.globalMuted || ctx.quietNow(),
    until: s.globalMuted ? s.globalMutedUntil : 0,
    now: new Date(),
  });
  if (m.type === 'item') return { label: m.label, accelerator: o.accelerator, click: o.toggle };
  return {
    label: m.label,
    submenu: m.items.map((c) =>
      c.kind === 'indefinite'
        ? { label: c.label, accelerator: o.accelerator, click: o.toggle }
        : {
            label: c.label,
            click: () => {
              if (o.guarded && ctx.lock.locked) return;
              ctx.setGlobalMuted(true, muteExpiry(c.kind, new Date()));
            },
          },
    ),
  };
}
