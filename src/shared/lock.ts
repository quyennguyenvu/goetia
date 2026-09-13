import type { ServiceId } from './types';

/** Minimum passcode length. Rate limiting, not composition rules, is what
 *  makes a local secret survive guessing — so this is a floor, not a policy. */
export const PASSCODE_MIN_LENGTH = 6;

/** Ceiling on the failed-attempt backoff. The delay is paid by the owner far
 *  more often than by an attacker, who can simply walk away. */
export const UNLOCK_BACKOFF_MAX_MS = 30_000;

/** Which door the lock screen is trying. Touch ID carries no secret: main
 *  runs the ceremony itself and the renderer only asks. */
export type UnlockRequest = { method: 'touchId' } | { method: 'passcode'; passcode: string };

/** `waitMs` > 0 means the attempt was refused by the backoff, not by the
 *  credential. `unreadable`: the stored hash would not decrypt, so no
 *  passcode can ever match it — see LockStore. */
export interface UnlockResult {
  ok: boolean;
  waitMs: number;
  reason?: 'wrong' | 'cancelled' | 'throttled' | 'unreadable' | 'unavailable';
}

/** Every configuration carries the passcode, never Touch ID: a credential a
 *  second enrolled finger defeats must not be able to widen or remove the
 *  lock it guards. */
export type LockConfigure =
  /** Check the passcode and change nothing. The pane reveals its controls
   *  only once this has passed, so a rejected write cannot be the first the
   *  user hears of a wrong passcode. */
  | { action: 'verify'; current: string }
  | { action: 'enable'; passcode: string }
  | { action: 'disable'; current: string }
  | { action: 'change'; current: string; next: string }
  | { action: 'setTouchId'; current: string; touchId: boolean }
  | { action: 'setGuardActions'; current: string; guardActions: boolean };

export interface LockConfigResult {
  ok: boolean;
  error?: 'wrong' | 'too-short' | 'already-set' | 'not-set';
}

/** Which doors the lock screen may offer, and which main will accept — one
 *  definition for both processes. The passcode is unconditional: a
 *  configuration admitting neither would lock the owner out of their own app,
 *  with nothing but the documented lock.json removal to recover. */
export function admittedCredentials(opts: { touchIdSetting: boolean; sensorAvailable: boolean }): {
  touchId: boolean;
  passcode: true;
} {
  return { touchId: opts.touchIdSetting && opts.sensorAvailable, passcode: true };
}

/** How long a minted consent stays spendable. Short, because it exists only
 *  to bridge the confirm and the action it authorized — a confirm the user
 *  then abandons must not sit armed. */
export const CONSENT_TTL_MS = 60_000;

/** An action that needs the lock's credential even while the app is unlocked.
 *  See the 2026-09-13 spec: the guard is on the direction that *exposes*
 *  (summon) and on the two that destroy (purge), never on banish or reorder. */
export type GuardedAction =
  | { kind: 'summon' }
  | { kind: 'purge-one'; serviceId: ServiceId }
  | { kind: 'purge-all' };

export interface ConsentRequest {
  action: GuardedAction;
  credential: UnlockRequest;
}

/** Exact match on kind *and* service. Without the service, a consent would be
 *  a capability rather than an authorization, and one logic bug would spend a
 *  confirm for Slack on Discord. */
export function sameAction(a: GuardedAction, b: GuardedAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'purge-one' && b.kind === 'purge-one') return a.serviceId === b.serviceId;
  return true;
}
