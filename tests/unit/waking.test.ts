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
    w.begin('messenger', 'wake');
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
    w.begin('messenger', 'wake');
    w.end('messenger', 'recipe-ready');
    expect(state.runtime('messenger').waking).toBe(false);
    const calls = cb.mock.calls.length;
    vi.runAllTimers();
    expect(cb.mock.calls.length).toBe(calls); // disarmed: no extra touch
  });

  it('load-finished keeps waitForReady services covered', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger', 'wake');
    w.end('messenger', 'load-finished');
    expect(state.runtime('messenger').waking).toBe(true);
  });

  it('a reload mid-wake re-arms the timeout', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger', 'wake');
    vi.advanceTimersByTime(8_000);
    w.begin('messenger', 'wake'); // reload restarts the clock
    vi.advanceTimersByTime(8_000);
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(state.runtime('messenger').waking).toBe(false);
  });

  it('begin records the load kind; end clears waking and leaves the kind', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger', 'reload');
    expect(state.runtime('messenger')).toMatchObject({ waking: true, wakeKind: 'reload' });
    w.end('messenger', 'recipe-ready');
    expect(state.runtime('messenger')).toMatchObject({ waking: false, wakeKind: 'reload' });
  });

  // a ⌘R on a service still covered by its cold-start wake: the cover now
  // names the reload the user is waiting on
  it('a re-armed wake with a different kind updates the kind', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger', 'wake');
    w.begin('messenger', 'reload');
    expect(state.runtime('messenger').wakeKind).toBe('reload');
  });
});
