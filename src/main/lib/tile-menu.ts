import type { MuteFor } from '../../shared/mute';
import { labelUnmute, MUTE_CHOICES } from './mute-menu';

export type TileMenuAction = 'reload' | 'mute' | 'banish';

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
 *  naming the expiry when there is one, on a muted one. */
export function tileMenuItems(o: {
  muted: boolean;
  live: boolean;
  mutedUntil?: number;
  now?: Date;
}): TileMenuItem[] {
  const mute: TileMenuItem = o.muted
    ? {
        type: 'item',
        action: 'mute',
        label: labelUnmute('Unmute', o.mutedUntil ?? 0, o.now ?? new Date()),
        enabled: true,
      }
    : { type: 'submenu', action: 'mute', label: 'Mute', items: MUTE_CHOICES };
  return [
    { type: 'item', action: 'reload', label: 'Reload', enabled: o.live },
    mute,
    { type: 'separator' },
    { type: 'item', action: 'banish', label: 'Banish', enabled: true },
  ];
}
