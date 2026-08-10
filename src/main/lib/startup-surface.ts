import type { ServiceId, Settings } from '../../shared/types';

export interface StartupSurface {
  /** service to activate; null when no enabled service exists */
  activeId: ServiceId | null;
  /** Home covers the surface — the view must be activated hidden */
  homeOpen: boolean;
}

/** Which surface a launch lands on. A recorded service that is still enabled
 *  wins. One that is disabled or gone from the catalog cannot be honored, so
 *  the launch hands the choice back through Home rather than silently
 *  substituting a different service. No record at all is a fresh install or an
 *  upgrade from a build predating the field — not a failed restore — so that
 *  keeps the old rail-order behavior. */
export function resolveStartupSurface(input: {
  order: ServiceId[];
  disabled: Settings['disabled'];
  lastActiveId: ServiceId | null;
  lastHomeOpen: boolean;
}): StartupSurface {
  const { order, disabled, lastActiveId, lastHomeOpen } = input;
  const firstEnabled = order.find((id) => !disabled[id]) ?? null;
  if (lastActiveId === null) return { activeId: firstEnabled, homeOpen: lastHomeOpen };
  const restorable = order.includes(lastActiveId) && !disabled[lastActiveId];
  if (restorable) return { activeId: lastActiveId, homeOpen: lastHomeOpen };
  return { activeId: firstEnabled, homeOpen: true };
}
