import { describe, expect, it, vi } from 'vitest';
import { HibernationController } from '../../src/main/hibernation';
import { PEEK_INTERVAL_MS, PEEK_STAGGER_MS } from '../../src/main/lib/peek-rules';
import { DEFAULT_SETTINGS, type ServiceId, type Settings } from '../../src/shared/types';

/** Two enabled services, both asleep and both due for a peek. hibernationMinutes
 *  stays at its default so nothing hibernates inside a test. */
function harness(overrides: Partial<Settings> = {}, onBattery = false) {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    order: ['discord', 'instagram'],
    disabled: { ...DEFAULT_SETTINGS.disabled, discord: false, instagram: false },
    lightSleep: true,
    ...overrides,
  };
  const ensured: ServiceId[] = [];
  const destroyed: ServiceId[] = [];
  const live = new Set<ServiceId>();
  const runtimes = new Map<
    ServiceId,
    { hibernated: boolean; unread: { direct: number; indirect: number } }
  >();
  const ctx = {
    settings: { get: () => settings },
    state: {
      // never one of the peek candidates, so a peek is never "under the user"
      activeId: 'whatsapp' as ServiceId,
      runtime: (id: ServiceId) => {
        let r = runtimes.get(id);
        if (!r) {
          r = { hibernated: false, unread: { direct: 0, indirect: 0 } };
          runtimes.set(id, r);
        }
        return r;
      },
      setRuntime: (id: ServiceId, patch: { hibernated?: boolean }) => {
        if (patch.hibernated !== undefined) {
          ctx.state.runtime(id).hibernated = patch.hibernated;
        }
      },
    },
    views: {
      has: (id: ServiceId) => live.has(id),
      ensure: (id: ServiceId) => {
        ensured.push(id);
        live.add(id);
      },
      destroy: (id: ServiceId) => {
        destroyed.push(id);
        live.delete(id);
      },
    },
    waking: { end: () => {} },
    onBattery: () => onBattery,
  } as unknown as ConstructorParameters<typeof HibernationController>[0];
  /** simulate a peek finding a new message before it reports */
  const arrive = (id: ServiceId) => {
    ctx.state.runtime(id).unread.direct += 1;
  };
  return { ctx, ensured, destroyed, arrive };
}

/** start() defers the first sweep by BOOT_DELAY_MS (5 s). */
const BOOT = 5_000;

describe('HibernationController peek walk', () => {
  it('peeks the first due service after the boot delay', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness();
    const h = new HibernationController(ctx);
    h.start();
    expect(ensured).toEqual([]);
    vi.advanceTimersByTime(BOOT);
    expect(ensured).toEqual(['discord']);
    h.dispose();
    vi.useRealTimers();
  });

  // R1a: endPeek chained straight into sweep(), so with every service due at
  // boot the first minutes were a back-to-back queue of cold page loads.
  it('staggers the next peek instead of chaining it immediately', () => {
    vi.useFakeTimers();
    const { ctx, ensured, destroyed } = harness();
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(ensured).toEqual(['discord']);

    // the peek reports and is torn down — the next one must not start in the
    // same tick, or launch is one cold load immediately after another
    h.noteUnreadReport('discord');
    expect(destroyed).toEqual(['discord']);
    expect(ensured).toEqual(['discord']);

    vi.advanceTimersByTime(PEEK_STAGGER_MS);
    expect(ensured).toEqual(['discord', 'instagram']);
    h.dispose();
    vi.useRealTimers();
  });

  it('still walks the whole roster, just spread out', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness();
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    h.noteUnreadReport('discord');
    vi.advanceTimersByTime(PEEK_STAGGER_MS);
    h.noteUnreadReport('instagram');
    expect(ensured).toEqual(['discord', 'instagram']);
    h.dispose();
    vi.useRealTimers();
  });

  it('cancels a staggered peek on dispose', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness();
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    h.noteUnreadReport('discord');
    h.dispose();
    vi.advanceTimersByTime(PEEK_STAGGER_MS * 4);
    expect(ensured).toEqual(['discord']); // nothing woke after teardown
    vi.useRealTimers();
  });

  it('never peeks while light sleep is off', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness({ lightSleep: false });
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(ensured).toEqual([]);
    h.dispose();
    vi.useRealTimers();
  });
});

// R1b: opt-in only. With the saver off nothing about the cadence may change.
describe('HibernationController peek backoff', () => {
  /** sweeps run on a 60s timer, so "due" is only acted on at the next one */
  const SWEEP = 60_000;
  /** enough time for a service on `multiple` × base to come due and be swept */
  const past = (multiple: number) => PEEK_INTERVAL_MS * multiple + 2 * SWEEP;

  /** walk both services through one peek each, both reporting nothing new */
  function quietWalk(h: HibernationController) {
    vi.advanceTimersByTime(BOOT);
    h.noteUnreadReport('discord');
    vi.advanceTimersByTime(PEEK_STAGGER_MS);
    h.noteUnreadReport('instagram');
    vi.advanceTimersByTime(PEEK_STAGGER_MS);
  }

  it('keeps the base interval when the saver is off, however quiet the peek', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness({ peekSaver: false });
    const h = new HibernationController(ctx);
    h.start();
    quietWalk(h);
    expect(ensured).toEqual(['discord', 'instagram']);
    vi.advanceTimersByTime(past(1));
    expect(ensured.length).toBeGreaterThan(2); // due exactly as it always was
    h.dispose();
    vi.useRealTimers();
  });

  it('with the saver on, a quiet peek pushes the next one past the base interval', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness({ peekSaver: true });
    const h = new HibernationController(ctx);
    h.start();
    quietWalk(h);
    vi.advanceTimersByTime(past(1));
    expect(ensured).toEqual(['discord', 'instagram']); // backed off to 2× base
    vi.advanceTimersByTime(past(1));
    expect(ensured.length).toBeGreaterThan(2); // due once 2× has passed
    h.dispose();
    vi.useRealTimers();
  });

  it('a peek that found a new message does not back off', () => {
    vi.useFakeTimers();
    const { ctx, ensured, arrive } = harness({ peekSaver: true });
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    arrive('discord'); // the peek loaded and the count moved
    h.noteUnreadReport('discord');
    vi.advanceTimersByTime(PEEK_STAGGER_MS);
    h.noteUnreadReport('instagram');
    vi.advanceTimersByTime(past(1));
    expect(ensured).toContain('discord');
    expect(ensured.length).toBeGreaterThan(2); // still on the base interval
    h.dispose();
    vi.useRealTimers();
  });

  it('opening the service resets a backoff, so an active chat never goes stale', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness({ peekSaver: true });
    const h = new HibernationController(ctx);
    h.start();
    quietWalk(h);
    h.noteActivated('discord'); // the user opened it
    vi.advanceTimersByTime(past(1));
    expect(ensured.length).toBeGreaterThan(2);
    h.dispose();
    vi.useRealTimers();
  });

  it('starts at the longest interval on battery', () => {
    vi.useFakeTimers();
    const { ctx, ensured } = harness({ peekSaver: true }, true);
    const h = new HibernationController(ctx);
    h.start();
    quietWalk(h);
    vi.advanceTimersByTime(PEEK_INTERVAL_MS * 5);
    expect(ensured).toEqual(['discord', 'instagram']); // nothing due inside 6× base
    vi.advanceTimersByTime(past(2));
    expect(ensured.length).toBeGreaterThan(2);
    h.dispose();
    vi.useRealTimers();
  });
});
