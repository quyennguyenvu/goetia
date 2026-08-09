import { describe, expect, it } from 'vitest';
import {
  RECHECK_MIN_INTERVAL_MS,
  shouldAutoRecheck,
  updatePending,
} from '../../src/renderer/src/components/update-rules';

describe('shouldAutoRecheck', () => {
  it('checks the first time the pane is opened', () => {
    expect(shouldAutoRecheck(1_000, null, 'idle')).toBe(true);
  });

  it('does not stack a check on one already running', () => {
    expect(shouldAutoRecheck(1_000, null, 'checking')).toBe(false);
  });

  it('rate-limits reopening the pane', () => {
    const last = 1_000;
    expect(shouldAutoRecheck(last + RECHECK_MIN_INTERVAL_MS - 1, last, 'available')).toBe(false);
    expect(shouldAutoRecheck(last + RECHECK_MIN_INTERVAL_MS, last, 'available')).toBe(true);
  });

  it('re-checks after an error without waiting out the interval', () => {
    expect(shouldAutoRecheck(1_001, 1_000, 'error')).toBe(true);
  });
});

describe('updatePending', () => {
  it('is a known newer release, whatever the status says', () => {
    expect(updatePending({ status: 'available', latest: '0.3.2', announce: null })).toBe(true);
    // a failed re-check must not hide the Download button we already earned
    expect(updatePending({ status: 'error', latest: '0.3.2', announce: null })).toBe(true);
    expect(updatePending({ status: 'checking', latest: '0.3.2', announce: null })).toBe(true);
  });

  it('is false once a check clears the pending release', () => {
    expect(updatePending({ status: 'current', latest: null, announce: null })).toBe(false);
    expect(updatePending({ status: 'idle', latest: null, announce: null })).toBe(false);
  });
});
