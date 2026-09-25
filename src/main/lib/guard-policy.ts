import { type GuardedAction, idSet } from '../../shared/lock';
import type { Settings } from '../../shared/types';

/** Row ids as a consent is bound to them: finite positive integers, at most
 *  `cap` of them, sorted and deduplicated. Null for anything else, so a
 *  malformed payload mints nothing and removes nothing. */
export function normalizeRemoveIds(raw: unknown, cap: number): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > cap) return null;
  if (!raw.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) return null;
  return idSet(raw as number[]);
}

/** The bound on a passkey credential id crossing lock:confirm. */
const PASSKEY_ID_MAX = 256;

/** What lock:confirm may mint: the slot must never hold a shape sameAction was
 *  not written for. Renderer data in, exact action out or null. */
export function normalizeAction(raw: GuardedAction, cap: number): GuardedAction | null {
  if (raw.kind === 'downloads-remove') {
    const ids = normalizeRemoveIds(raw.ids, cap);
    return ids ? { kind: 'downloads-remove', ids } : null;
  }
  if (raw.kind === 'passkey-forget') {
    const ok = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= PASSKEY_ID_MAX;
    return ok ? { kind: 'passkey-forget', id: raw.id } : null;
  }
  return raw;
}

/** settings:update never writes appLock — lock:configure is its only writer,
 *  behind the passcode. The shell's own console can send any shell channel,
 *  so this is enforced here rather than trusted to the Lock pane. */
export function stripAppLock(patch: Partial<Settings>): {
  patch: Partial<Settings>;
  carried: boolean;
} {
  if (!('appLock' in patch)) return { patch, carried: false };
  const { appLock: _dropped, ...rest } = patch;
  return { patch: rest, carried: true };
}
