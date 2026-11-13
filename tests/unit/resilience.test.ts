import { describe, expect, it, vi } from 'vitest';
import { ResilienceManager } from '../../src/main/resilience';

function harness() {
  const reloads: string[] = [];
  const runtime = { crashed: false };
  const notes: string[] = [];
  const net = { online: true };
  const live = { has: true };
  const shown = { hides: 0, shows: 0 };
  const ctx = {
    state: {
      setRuntime: (_id: string, patch: { crashed?: boolean }) => {
        if (patch.crashed !== undefined) runtime.crashed = patch.crashed;
      },
      runtime: () => runtime,
      activeId: 'messenger',
    },
    views: {
      reload: (id: string) => reloads.push(id),
      has: () => live.has,
      hideActive: () => shown.hides++,
      showActive: () => shown.shows++,
    },
    online: () => net.online,
    diag: { note: (tag: string, line: string) => notes.push(`[${tag}] ${line}`) },
  } as unknown as ConstructorParameters<typeof ResilienceManager>[0];
  return { ctx, reloads, notes, runtime, net, live, shown };
}

describe('ResilienceManager crash cap', () => {
  it('gives up after MAX_AUTO_RELOADS crashes that never dwell', () => {
    vi.useFakeTimers();
    const { ctx, reloads } = harness();
    const r = new ResilienceManager(ctx);
    for (let i = 0; i < 8; i++) {
      r.onCrashed('messenger');
      vi.advanceTimersByTime(60_000); // fire the backoff reload
      r.noteRecovered('messenger'); // did-finish-load right after reload
      vi.advanceTimersByTime(1_000); // …but crashes again before the dwell
    }
    expect(reloads.length).toBe(5); // capped, not unbounded
    vi.useRealTimers();
  });

  it('forgets the count after the page dwells', () => {
    vi.useFakeTimers();
    const { ctx, reloads } = harness();
    const r = new ResilienceManager(ctx);
    r.onCrashed('messenger');
    vi.advanceTimersByTime(60_000);
    r.noteRecovered('messenger');
    vi.advanceTimersByTime(31_000); // exceeds DWELL_MS -> count reset
    for (let i = 0; i < 5; i++) {
      r.onCrashed('messenger');
      vi.advanceTimersByTime(60_000);
      r.noteRecovered('messenger');
      vi.advanceTimersByTime(31_000);
    }
    expect(reloads.length).toBeGreaterThan(5); // each dwell re-armed the budget
    vi.useRealTimers();
  });

  // B5: the crash-reload timeout and the dwell timers were never cleared, and
  // ResilienceManager was the one controller missing from before-quit.
  it('cancels a pending auto-reload on dispose', () => {
    vi.useFakeTimers();
    const { ctx, reloads } = harness();
    const r = new ResilienceManager(ctx);
    r.onCrashed('messenger');
    r.dispose();
    vi.advanceTimersByTime(120_000);
    expect(reloads).toEqual([]);
    vi.useRealTimers();
  });

  it('cancels a pending dwell timer on dispose', () => {
    vi.useFakeTimers();
    const { ctx } = harness();
    const r = new ResilienceManager(ctx);
    r.onCrashed('messenger');
    vi.advanceTimersByTime(60_000);
    r.noteRecovered('messenger'); // arms the DWELL_MS forget timer
    expect(() => {
      r.dispose();
      vi.advanceTimersByTime(60_000);
    }).not.toThrow();
    vi.useRealTimers();
  });
});

describe('ResilienceManager diagnostics', () => {
  it('notes each crash with its attempt, the cap once reached, and recovery', () => {
    vi.useFakeTimers();
    const { ctx, notes } = harness();
    const r = new ResilienceManager(ctx);
    r.onCrashed('messenger', 'reason=oom exit=5');
    expect(notes).toEqual([
      '[view] messenger crashed: reason=oom exit=5 (attempt 1/5, reload in 1s)',
    ]);
    vi.advanceTimersByTime(60_000);
    r.noteRecovered('messenger');
    expect(notes.at(-1)).toBe('[view] messenger recovered');
    // a clean load with nothing crashed notes nothing
    r.noteRecovered('messenger');
    expect(notes).toHaveLength(2);
    for (let i = 0; i < 6; i++) {
      r.onCrashed('messenger');
      vi.advanceTimersByTime(60_000);
    }
    expect(notes.filter((l) => l.includes('cap reached'))).toEqual([
      '[view] messenger crashed (cap reached; manual Retry)',
      '[view] messenger crashed (cap reached; manual Retry)',
    ]);
    vi.useRealTimers();
  });

  it('notes a failed load with its attempt', () => {
    vi.useFakeTimers();
    const { ctx, notes } = harness();
    new ResilienceManager(ctx).onLoadFailed('messenger', '-105 ERR_NAME_NOT_RESOLVED');
    expect(notes).toEqual([
      '[view] messenger load failed: -105 ERR_NAME_NOT_RESOLVED (attempt 1/5, reload in 1s)',
    ]);
    vi.useRealTimers();
  });
});

// 2026-11-13: after a cold boot the app launched before the network was up;
// every never-sleep service failed with -106, was marked recovered 50ms later
// by Electron's own error page, and stayed blank until a manual reload.
describe('ResilienceManager failed loads', () => {
  it("does not take the error page's did-finish-load for a recovery", () => {
    vi.useFakeTimers();
    const { ctx, notes, runtime } = harness();
    const r = new ResilienceManager(ctx);
    r.onLoadFailed('messenger', '-106 ERR_INTERNET_DISCONNECTED');
    r.noteRecovered('messenger'); // the blank error document, 12ms later
    expect(runtime.crashed).toBe(true);
    expect(notes.some((l) => l.includes('recovered'))).toBe(false);
    vi.useRealTimers();
  });

  it('retries a failed load with the crash backoff', () => {
    vi.useFakeTimers();
    const { ctx, reloads } = harness();
    new ResilienceManager(ctx).onLoadFailed('messenger', '-106 ERR_INTERNET_DISCONNECTED');
    expect(reloads).toEqual([]);
    vi.advanceTimersByTime(1_000);
    expect(reloads).toEqual(['messenger']);
    vi.useRealTimers();
  });

  it('recovers on the finish of the load that follows, and presents the view', () => {
    vi.useFakeTimers();
    const { ctx, notes, runtime, shown } = harness();
    const r = new ResilienceManager(ctx);
    r.onLoadFailed('messenger', '-106 ERR_INTERNET_DISCONNECTED');
    expect(shown.hides).toBe(1); // the blank page never sits over Retry
    vi.advanceTimersByTime(1_000);
    r.noteNavigated('messenger'); // the retry's own navigation
    r.noteRecovered('messenger');
    expect(runtime.crashed).toBe(false);
    expect(notes.at(-1)).toBe('[view] messenger recovered');
    expect(shown.shows).toBe(1);
    vi.useRealTimers();
  });

  it('waits for the network instead of spending an attempt', () => {
    vi.useFakeTimers();
    const { ctx, reloads, net } = harness();
    net.online = false;
    new ResilienceManager(ctx).onLoadFailed('messenger', '-106 ERR_INTERNET_DISCONNECTED');
    vi.advanceTimersByTime(10 * 60_000);
    expect(reloads).toEqual([]);
    net.online = true;
    vi.advanceTimersByTime(5_000);
    expect(reloads).toEqual(['messenger']);
    vi.useRealTimers();
  });

  it('stops retrying a service whose view is gone', () => {
    vi.useFakeTimers();
    const { ctx, reloads, net, live } = harness();
    net.online = false;
    new ResilienceManager(ctx).onLoadFailed('messenger', '-106 ERR_INTERNET_DISCONNECTED');
    live.has = false; // hibernated, banished or purged meanwhile
    net.online = true;
    vi.advanceTimersByTime(60_000);
    expect(reloads).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
