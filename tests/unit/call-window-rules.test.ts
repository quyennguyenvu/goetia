import { describe, expect, it } from 'vitest';
import {
  CALL_LOAD_ATTEMPTS,
  callLoadFailureAction,
  callLoadFailureLine,
} from '../../src/main/lib/call-window-rules';

describe('callLoadFailureAction', () => {
  it('ignores a subframe failure: the call page itself is still there', () => {
    expect(callLoadFailureAction({ isMainFrame: false, code: -105, attempt: 1 })).toBe('ignore');
  });

  it('ignores ERR_ABORTED: the page moved on by itself, nothing failed', () => {
    expect(callLoadFailureAction({ isMainFrame: true, code: -3, attempt: 1 })).toBe('ignore');
  });

  it('retries the first main-frame failure', () => {
    // a resolver hiccup at the moment of the load
    expect(callLoadFailureAction({ isMainFrame: true, code: -105, attempt: 1 })).toBe('retry');
  });

  it('closes once every attempt has failed', () => {
    expect(
      callLoadFailureAction({ isMainFrame: true, code: -20, attempt: CALL_LOAD_ATTEMPTS }),
    ).toBe('close');
  });
});

describe('callLoadFailureLine', () => {
  it('names the service, the error and the outcome, nothing from the page', () => {
    expect(callLoadFailureLine('messenger', -105, 'ERR_NAME_NOT_RESOLVED', 'retry')).toBe(
      'messenger call window load failed: -105 ERR_NAME_NOT_RESOLVED, retrying',
    );
    expect(callLoadFailureLine('messenger', -20, 'ERR_BLOCKED_BY_CLIENT', 'close')).toBe(
      'messenger call window load failed: -20 ERR_BLOCKED_BY_CLIENT, closed',
    );
  });
});
