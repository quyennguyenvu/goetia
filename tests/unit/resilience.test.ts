import { describe, expect, it, vi } from 'vitest';
import { ResilienceManager } from '../../src/main/resilience';

function harness() {
  const reloads: string[] = [];
  const runtime = { crashed: false };
  const notes: string[] = [];
  const ctx = {
    state: {
      setRuntime: (_id: string, patch: { crashed?: boolean }) => {
        if (patch.crashed !== undefined) runtime.crashed = patch.crashed;
      },
      runtime: () => runtime,
      activeId: 'messenger',
    },
    views: { reload: (id: string) => reloads.push(id), hideActive: () => {} },
    diag: { note: (tag: string, line: string) => notes.push(`[${tag}] ${line}`) },
  } as unknown as ConstructorParameters<typeof ResilienceManager>[0];
  return { ctx, reloads, notes };
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
    r.onCrashed('messenger');
    expect(notes).toEqual(['[view] messenger crashed (attempt 1/5, reload in 1s)']);
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

  it('notes a failed load', () => {
    const { ctx, notes } = harness();
    new ResilienceManager(ctx).onLoadFailed('messenger');
    expect(notes).toEqual(['[view] messenger load failed']);
  });
});
