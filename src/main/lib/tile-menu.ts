import type { MuteFor } from '../../shared/mute';
import { labelUnmute, MUTE_CHOICES } from './mute-menu';

export type TileMenuAction = 'reload' | 'mute' | 'allow-calls' | 'banish';

export type TileMenuItem =
  | { type: 'separator' }
  | { type: 'item'; action: TileMenuAction; label: string; enabled: boolean }
  | {
      type: 'submenu';
      action: 'mute';
      label: string;
      items: { kind: MuteFor; label: string }[];
    };

/** The rail tile's right-click menu. Labels are bare verbs — the tile the menu
 *  hangs off already names the service. Reload is disabled for a service with
 *  no live view: hibernated means nothing to reload, and the tile click wakes it.
 *  Mute is a submenu of durations on an unmuted service and a single Unmute,
 *  naming the expiry when there is one, on a muted one. Turn On Incoming Calls
 *  appears only while facebook's calls-off switch is on and a live page can
 *  run the write — Goetia hides both places facebook offers the switch. */
export function tileMenuItems(o: {
  muted: boolean;
  live: boolean;
  mutedUntil?: number;
  now?: Date;
  callsOff?: boolean;
}): TileMenuItem[] {
  const mute: TileMenuItem = o.muted
    ? {
        type: 'item',
        action: 'mute',
        label: labelUnmute('Unmute', o.mutedUntil ?? 0, o.now ?? new Date()),
        enabled: true,
      }
    : { type: 'submenu', action: 'mute', label: 'Mute', items: MUTE_CHOICES };
  const calls: TileMenuItem[] =
    o.callsOff && o.live
      ? [{ type: 'item', action: 'allow-calls', label: 'Turn On Incoming Calls', enabled: true }]
      : [];
  return [
    { type: 'item', action: 'reload', label: 'Reload', enabled: o.live },
    mute,
    ...calls,
    { type: 'separator' },
    { type: 'item', action: 'banish', label: 'Banish', enabled: true },
  ];
}
