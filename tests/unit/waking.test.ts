import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainState } from '../../src/main/state';
import { WakingTracker } from '../../src/main/waking';

// every catalog service has waitForReady (a ready() recipe); the
// load-finished reveal for services without one is covered at the rule
// level in waking-rules.test.ts.

describe('WakingTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('begin sets waking; the 10s timeout reveals', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger');
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(9_999);
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.runtime('messenger').waking).toBe(false);
  });

  it('recipe-ready reveals immediately and disarms the timer', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    const w = new WakingTracker(state);
    w.begin('messenger');
    w.end('messenger', 'recipe-ready');
    expect(state.runtime('messenger').waking).toBe(false);
    const calls = cb.mock.calls.length;
    vi.runAllTimers();
    expect(cb.mock.calls.length).toBe(calls); // disarmed: no extra touch
  });

  it('load-finished keeps waitForReady services covered', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger');
    w.end('messenger', 'load-finished');
    expect(state.runtime('messenger').waking).toBe(true);
  });

  it('a reload mid-wake re-arms the timeout', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger');
    vi.advanceTimersByTime(8_000);
    w.begin('messenger'); // reload restarts the clock
    vi.advanceTimersByTime(8_000);
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(state.runtime('messenger').waking).toBe(false);
  });
});
