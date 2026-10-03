import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CallsHook, CallsSettingWatcher } from '../../src/main/calls-setting';
import {
  CALLS_CHECK_INTERVAL_MS,
  CALLS_CHECK_TIMEOUT_MS,
  CALLS_READY_RECHECK_FLOOR_MS,
  CALLS_TURN_ON_TIMEOUT_MS,
} from '../../src/main/lib/calls-setting-rules';

const NOW = 1_790_000_000_000;
const OFF = "messenger: incoming calls are off in Facebook's chat settings";
const UNREADABLE = "messenger: can't read Facebook's call setting";
const FAILED = 'messenger: turning incoming calls on failed';

/** The page answers each hook call with the next scripted reply; with none
 *  left, calls are on. A reply of null means "no live view". */
function harness() {
  const replies: Array<() => Promise<unknown> | null> = [];
  const calls: CallsHook[] = [];
  const published: number[] = [];
  const notes: string[] = [];
  const watcher = new CallsSettingWatcher({
    exec: (_id, hook) => {
      calls.push(hook);
      const next = replies.shift();
      return next ? next() : Promise.resolve(0);
    },
    publish: (_id, until) => published.push(until),
    note: (_id, line) => notes.push(line),
    now: () => Date.now(),
  });
  const reply = (fn: () => Promise<unknown> | null) => replies.push(fn);
  return { watcher, reply, calls, published, notes };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('CallsSettingWatcher', () => {
  it('checks at ready and shows an indefinite block, noting it once', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(-1));
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.calls).toEqual(['callsBlocked']);
    expect(h.published).toEqual([-1]);
    expect(h.notes).toEqual([OFF]);
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.calls).toEqual(['callsBlocked', 'callsBlocked']);
    expect(h.notes).toEqual([OFF]);
  });

  it('re-checks just after a timed block ends', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(NOW / 1000 + 60));
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.published).toEqual([NOW + 60_000]);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.calls).toHaveLength(2);
    expect(h.published.at(-1)).toBe(0);
  });

  it('fails closed and says so once when the setting cannot be read', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(null));
    h.reply(() => Promise.resolve('garbage'));
    h.watcher.noteReady('messenger');
    await flush();
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.published).toEqual([0, 0]);
    expect(h.notes).toEqual([UNREADABLE]);
  });

  it('treats a page that never answers as unreadable', async () => {
    const h = harness();
    h.reply(() => new Promise(() => {}));
    h.watcher.noteReady('messenger');
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_TIMEOUT_MS);
    expect(h.published).toEqual([0]);
    expect(h.notes).toEqual([UNREADABLE]);
  });

  it('skips a round while the page is mid-navigation', async () => {
    const h = harness();
    h.reply(() => Promise.reject(new Error('navigated')));
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.published).toEqual([]);
    expect(h.notes).toEqual([]);
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.calls).toHaveLength(2);
  });

  it('stops with the view: the mark clears and nothing runs after', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.watcher.noteReady('messenger');
    await flush();
    h.watcher.stop('messenger');
    expect(h.published).toEqual([-1, 0]);
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS * 3);
    expect(h.calls).toHaveLength(1);
  });

  it('stops itself when the view is already gone', async () => {
    const h = harness();
    h.reply(() => null);
    h.watcher.noteReady('messenger');
    await flush();
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.calls).toHaveLength(1);
  });

  it('turns calls on and clears the mark, writing nothing on success', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(0));
    h.watcher.noteReady('messenger');
    await flush();
    await h.watcher.turnOn('messenger');
    expect(h.calls).toEqual(['callsBlocked', 'allowCalls']);
    expect(h.published).toEqual([-1, 0]);
    expect(h.notes).toEqual([OFF]);
  });

  it('keeps the mark and says so when turning calls on fails', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(-1));
    h.watcher.noteReady('messenger');
    await flush();
    await h.watcher.turnOn('messenger');
    expect(h.published).toEqual([-1, -1]);
    expect(h.notes).toEqual([OFF, FAILED]);
  });

  it('does not let an unreadable Turn On answer flip the tile', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(null));
    h.watcher.noteReady('messenger');
    await flush();
    await h.watcher.turnOn('messenger');
    expect(h.published).toEqual([-1]);
    expect(h.notes).toEqual([OFF, FAILED]);
  });

  it('waits longer for Turn On than for a check: facebook loads its settings code first', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(
      () => new Promise((resolve) => setTimeout(() => resolve(0), CALLS_CHECK_TIMEOUT_MS + 3_000)),
    );
    h.watcher.noteReady('messenger');
    await flush();
    const turning = h.watcher.turnOn('messenger');
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_TIMEOUT_MS + 3_000);
    await turning;
    expect(h.published).toEqual([-1, 0]);
    expect(h.notes).toEqual([OFF]);
  });

  it('gives up on Turn On after its own ceiling', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => new Promise(() => {}));
    h.watcher.noteReady('messenger');
    await flush();
    const turning = h.watcher.turnOn('messenger');
    await vi.advanceTimersByTimeAsync(CALLS_TURN_ON_TIMEOUT_MS);
    await turning;
    expect(h.published).toEqual([-1]);
    expect(h.notes).toEqual([OFF, FAILED]);
  });

  it('runs one page call at a time: Turn On waits for the check in flight', async () => {
    const h = harness();
    let answer: (v: unknown) => void = () => {};
    h.reply(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    h.reply(() => Promise.resolve(0));
    h.watcher.noteReady('messenger');
    const turning = h.watcher.turnOn('messenger');
    await flush();
    expect(h.calls).toEqual(['callsBlocked']);
    answer(-1);
    await turning;
    expect(h.calls).toEqual(['callsBlocked', 'allowCalls']);
  });

  it('refreshes on a repeated ready only past the floor', async () => {
    const h = harness();
    h.watcher.noteReady('messenger');
    await flush();
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(CALLS_READY_RECHECK_FLOOR_MS);
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.calls).toHaveLength(2);
  });

  it('does nothing for Turn On before the chat is ready', async () => {
    const h = harness();
    await h.watcher.turnOn('messenger');
    expect(h.calls).toEqual([]);
  });

  it('dispose clears every timer', async () => {
    const h = harness();
    h.watcher.noteReady('messenger');
    await flush();
    h.watcher.dispose();
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS * 2);
    expect(h.calls).toHaveLength(1);
  });
});
