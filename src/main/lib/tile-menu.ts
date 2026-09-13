export type TileMenuAction = 'reload' | 'mute' | 'banish';

export type TileMenuItem =
  | { type: 'separator' }
  | { type: 'item'; action: TileMenuAction; label: string; enabled: boolean };

/** The rail tile's right-click menu. Reload is disabled for a service with no
 *  live view: hibernated means nothing to reload, and the tile click wakes it. */
export function tileMenuItems(o: { name: string; muted: boolean; live: boolean }): TileMenuItem[] {
  return [
    { type: 'item', action: 'reload', label: `Reload ${o.name}`, enabled: o.live },
    { type: 'separator' },
    {
      type: 'item',
      action: 'mute',
      label: o.muted ? `Unmute ${o.name}` : `Mute ${o.name}`,
      enabled: true,
    },
    { type: 'separator' },
    { type: 'item', action: 'banish', label: `Banish ${o.name}`, enabled: true },
  ];
}
