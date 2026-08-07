import type { ServiceMeta } from '../../shared/types';

export const WAKE_TIMEOUT_MS = 10_000;

/** Everything that can end a wake (reveal the service). */
export type WakeEnd =
  | 'recipe-ready'
  | 'load-finished'
  | 'timeout'
  | 'crashed'
  | 'load-failed'
  | 'destroyed';

/** load-finished only reveals services without a recipe ready() check
 *  (their chat renders after load); every other end event always
 *  reveals — the cover must never outlive its view or trap a Retry. */
export function endsWake(event: WakeEnd, meta: ServiceMeta): boolean {
  if (event === 'load-finished') return !meta.waitForReady;
  return true;
}
