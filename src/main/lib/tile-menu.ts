export type TileMenuAction = 'reload' | 'mute' | 'banish';

export type TileMenuItem =
  | { type: 'separator' }
  | { type: 'item'; action: TileMenuAction; label: string; enabled: boolean };

/** The rail tile's right-click menu. Labels are bare verbs — the tile the menu
 *  hangs off already names the service. Reload is disabled for a service with
 *  no live view: hibernated means nothing to reload, and the tile click wakes it. */
export function tileMenuItems(o: { muted: boolean; live: boolean }): TileMenuItem[] {
  return [
    { type: 'item', action: 'reload', label: 'Reload', enabled: o.live },
    { type: 'item', action: 'mute', label: o.muted ? 'Unmute' : 'Mute', enabled: true },
    { type: 'separator' },
    { type: 'item', action: 'banish', label: 'Banish', enabled: true },
  ];
}
