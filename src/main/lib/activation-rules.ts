import type { ServiceId, Settings } from '../../shared/types';

/** Which service (if any) to activate after the disabled set changes.
 *  Null means activate nothing: with zero enabled services the shell
 *  shows the welcome screen, and a disabled service must never get a
 *  view (disabled = no tile, no view, no network). */
export function resolveActivation(input: {
  order: ServiceId[];
  disabled: Settings['disabled'];
  activeId: ServiceId;
  hasActiveView: boolean;
}): ServiceId | null {
  const { order, disabled, activeId, hasActiveView } = input;
  if (!disabled[activeId]) return hasActiveView ? null : activeId;
  return order.find((id) => !disabled[id]) ?? null;
}
