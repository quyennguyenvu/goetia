import { PASSCODE_MIN_LENGTH, UNLOCK_BACKOFF_MAX_MS } from '../../shared/lock';

/** How long the next unlock attempt waits after `failures` consecutive wrong
 *  passcodes: nothing, then 1s, 2s, 4s … capped. Same shape as lib/backoff.ts,
 *  kept separate because that one paces network retries and this one paces a
 *  human being who has just mistyped their own passcode. */
export function unlockDelay(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(UNLOCK_BACKOFF_MAX_MS, 1000 * 2 ** (failures - 1));
}

export function passcodeAcceptable(passcode: string): boolean {
  return passcode.length >= PASSCODE_MIN_LENGTH;
}

/** What a banner says while the app is locked. The body is emptied rather
 *  than substituted — every platform renders an empty body as a one-line
 *  banner, and any replacement text would be one more thing to read. */
export function redactBanner(serviceName: string): { title: string; body: string } {
  return { title: serviceName, body: '' };
}
