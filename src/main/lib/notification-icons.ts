import { join } from 'node:path';
import type { ServiceId } from '../../shared/types';

/** macOS gets the padded variant so the tile reads smaller than the app icon
 *  in the attachment slot; every other platform gets the full-bleed one. */
export function iconFileName(id: ServiceId, platform: NodeJS.Platform): string {
  return platform === 'darwin' ? `${id}-mac.png` : `${id}.png`;
}

/** Resolved once at startup — a missing asset drops out silently rather than
 *  costing a stat call on every notification. */
export function resolveIcons(
  dir: string,
  ids: readonly ServiceId[],
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): Map<ServiceId, string> {
  const found = new Map<ServiceId, string>();
  for (const id of ids) {
    const path = join(dir, iconFileName(id, platform));
    if (exists(path)) found.set(id, path);
  }
  return found;
}
