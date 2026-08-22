import { describe, expect, it, vi } from 'vitest';
import { coalesce } from '../../src/main/lib/coalesce';

/** Stand-in for queueMicrotask: collects the scheduled work so a test can
 *  decide when the flush happens. */
function manual() {
  const queued: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => {
      queued.push(fn);
    },
    flush: () => {
      for (const fn of queued.splice(0)) fn();
    },
  };
}

describe('coalesce', () => {
  // B3: touch() fanned out synchronously, so a handler that called setRuntime
  // in a loop paid a full snapshot + IPC + dock badge + tray + overlay per
  // iteration.
  it('collapses a burst of calls into one', () => {
    const fn = vi.fn();
    const { schedule, flush } = manual();
    const run = coalesce(fn, schedule);
    run();
    run();
    run();
    expect(fn).not.toHaveBeenCalled(); // nothing runs before the flush
    flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('schedules again after a flush', () => {
    const fn = vi.fn();
    const { schedule, flush } = manual();
    const run = coalesce(fn, schedule);
    run();
    flush();
    run();
    flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('re-arms even when the wrapped call throws', () => {
    const fn = vi.fn(() => {
      throw new Error('broadcast blew up');
    });
    const { schedule, flush } = manual();
    const run = coalesce(fn, schedule);
    run();
    expect(flush).toThrow();
    // a thrown broadcast must not wedge every later one
    run();
    expect(() => flush()).toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('defaults to the microtask queue', async () => {
    const fn = vi.fn();
    const run = coalesce(fn);
    run();
    run();
    expect(fn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
