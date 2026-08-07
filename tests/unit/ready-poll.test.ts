import { describe, expect, it, vi } from 'vitest';
import { startReadyPoll, visiblyPresent } from '../../src/preload/recipes/ready';
import type { Recipe } from '../../src/preload/recipes/types';

function fakeTimers() {
  const ticks: (() => void)[] = [];
  const setIntervalFn = ((fn: () => void) => {
    ticks.push(fn);
    return ticks.length as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  const cleared: unknown[] = [];
  const clearIntervalFn = ((id: unknown) => {
    cleared.push(id);
  }) as typeof clearInterval;
  return { ticks, cleared, setIntervalFn, clearIntervalFn };
}

const base: Recipe = {
  id: 'messenger',
  intervalMs: 2000,
  count: () => ({ direct: 0, indirect: 0 }),
};

const doc = {} as Document;

describe('startReadyPoll', () => {
  it('reports once when ready flips true, then stops polling', () => {
    let ready = false;
    const recipe: Recipe = { ...base, ready: () => ready };
    const t = fakeTimers();
    const report = vi.fn();
    startReadyPoll(recipe, doc, report, t.setIntervalFn, t.clearIntervalFn);
    t.ticks[0]();
    expect(report).not.toHaveBeenCalled();
    ready = true;
    t.ticks[0]();
    expect(report).toHaveBeenCalledTimes(1);
    expect(t.cleared).toHaveLength(1);
  });

  it('treats a throwing ready() as not ready', () => {
    const recipe: Recipe = {
      ...base,
      ready: () => {
        throw new Error('boom');
      },
    };
    const t = fakeTimers();
    const report = vi.fn();
    startReadyPoll(recipe, doc, report, t.setIntervalFn, t.clearIntervalFn);
    t.ticks[0]();
    expect(report).not.toHaveBeenCalled();
    expect(t.cleared).toHaveLength(0);
  });

  it('does nothing for recipes without ready()', () => {
    const t = fakeTimers();
    startReadyPoll(base, doc, vi.fn(), t.setIntervalFn, t.clearIntervalFn);
    expect(t.ticks).toHaveLength(0);
  });
});

describe('visiblyPresent', () => {
  const rect = { x: 10, y: 10, width: 100, height: 20 };
  function el(containsHit: boolean): Element {
    return {
      getBoundingClientRect: () => rect,
      contains: () => containsHit,
    } as unknown as Element;
  }
  function docWithHit(hit: unknown): Document {
    return { elementFromPoint: () => hit } as unknown as Document;
  }
  const foreign = { contains: () => false } as unknown as Element;

  it('rejects a missing element', () => {
    expect(visiblyPresent(docWithHit(null), null)).toBe(false);
  });

  it('rejects an element covered by something else (boot splash)', () => {
    expect(visiblyPresent(docWithHit(foreign), el(false))).toBe(false);
  });

  it('accepts an element whose descendant is the topmost hit', () => {
    expect(visiblyPresent(docWithHit(foreign), el(true))).toBe(true);
  });

  it('trusts presence when hit-testing yields nothing (no layout engine)', () => {
    expect(visiblyPresent(docWithHit(null), el(false))).toBe(true);
  });

  it('trusts presence when hit-testing is unavailable', () => {
    const doc = {} as unknown as Document;
    expect(visiblyPresent(doc, el(false))).toBe(true);
  });
});
