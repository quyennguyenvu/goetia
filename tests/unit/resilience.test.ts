import { describe, expect, it, vi } from 'vitest';
import { ResilienceManager } from '../../src/main/resilience';

function harness() {
  const reloads: string[] = [];
  const runtime = { crashed: false };
  const ctx = {
    state: {
      setRuntime: (_id: string, patch: { crashed?: boolean }) => {
        if (patch.crashed !== undefined) runtime.crashed = patch.crashed;
      },
      runtime: () => runtime,
      activeId: 'messenger',
    },
    views: { reload: (id: string) => reloads.push(id), hideActive: () => {} },
  } as unknown as ConstructorParameters<typeof ResilienceManager>[0];
  return { ctx, reloads };
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
});
