import type { ServiceId } from '../../shared/types';

/** the adopted call window's load gets this many tries before it closes */
export const CALL_LOAD_ATTEMPTS = 2;
/** a resolver hiccup clears in well under this; a page that is down does not */
export const CALL_RETRY_DELAY_MS = 1_500;

export type CallLoadFailure = 'ignore' | 'retry' | 'close';

/** What a did-fail-load in the adopted call window earns. Only the main
 *  frame matters, and -3 (ERR_ABORTED) is the page moving on by itself. A
 *  failed load otherwise leaves Electron's blank error document behind
 *  (white, untitled, so the window reads "Goetia"), so it is retried once and
 *  then closed rather than left on screen. `attempt` counts the load that
 *  just failed, from 1. */
export function callLoadFailureAction(o: {
  isMainFrame: boolean;
  code: number;
  attempt: number;
}): CallLoadFailure {
  if (!o.isMainFrame || o.code === -3) return 'ignore';
  return o.attempt < CALL_LOAD_ATTEMPTS ? 'retry' : 'close';
}

/** The Diagnostics line: ids, Chromium's own error name and the outcome —
 *  the caller appends the redacted page with withPage. */
export function callLoadFailureLine(
  id: ServiceId,
  code: number,
  desc: string,
  action: Exclude<CallLoadFailure, 'ignore'>,
): string {
  return `${id} call window load failed: ${code} ${desc}, ${action === 'retry' ? 'retrying' : 'closed'}`;
}
