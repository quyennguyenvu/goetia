// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countUnreadRows, isUnreadRow } from '../../src/preload/recipes/meta-unread';

/** Count the style reads a call makes. In Chromium each one can flush a pending
 *  style recalc, which is why this is the number that matters and not wall time. */
function countingWindow(): { win: Window & typeof globalThis; reads: () => number } {
  let reads = 0;
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(((el: Element) => {
    reads++;
    return real(el);
  }) as typeof window.getComputedStyle);
  return { win: window as Window & typeof globalThis, reads: () => reads };
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('isUnreadRow style-read cost', () => {
  // R2: the probe read a computed style for every span, div and i in the row.
  // Only spans can carry the bold-text signal, and only a childless, textless
  // element can be the unread dot — a text-bearing wrapper can be neither.
  it('reads no style for text-bearing elements that are not spans', () => {
    document.body.innerHTML = `
      <div role="row">
        <span>Ana Bui</span>
        <div>see you then</div>
        <i>12m</i>
      </div>`;
    const { win, reads } = countingWindow();
    const row = document.querySelector('[role=row]') as Element;
    expect(isUnreadRow(row, win)).toBe(false);
    expect(reads()).toBe(1); // the span only; the div and the i are skipped
  });

  it('still reads style for a textless element, which is what a dot is', () => {
    document.body.innerHTML = `
      <div role="row">
        <div>preview text</div>
        <div class="dot"></div>
      </div>`;
    const { win, reads } = countingWindow();
    const row = document.querySelector('[role=row]') as Element;
    isUnreadRow(row, win);
    expect(reads()).toBe(1); // the empty div is a dot candidate, the other is not
  });

  it('cuts the sweep over a realistic inbox row without changing the verdict', () => {
    // 24 elements per row, the shape the 720-reads-per-tick figure came from
    const parts = Array.from({ length: 24 }, (_, j) => {
      const tag = j % 3 === 0 ? 'span' : j % 3 === 1 ? 'div' : 'i';
      return `<${tag}>t${j}</${tag}>`;
    }).join('');
    document.body.innerHTML = `<div role="row">${parts}</div>`;
    const { win, reads } = countingWindow();
    const row = document.querySelector('[role=row]') as Element;
    expect(isUnreadRow(row, win)).toBe(false);
    expect(reads()).toBeLessThanOrEqual(8); // was 24: one per element
  });
});

describe('isUnreadRow verdicts are unchanged', () => {
  it('still counts the literal Unread string, reading no styles at all', () => {
    document.body.innerHTML = `<div role="row"><span>Unread</span></div>`;
    const { win, reads } = countingWindow();
    const row = document.querySelector('[role=row]') as Element;
    expect(isUnreadRow(row, win)).toBe(true);
    expect(reads()).toBe(0); // the cheap check still short-circuits first
  });

  it('still counts a bold span', () => {
    document.body.innerHTML = `<div role="row"><span style="font-weight:700">Ana</span></div>`;
    const row = document.querySelector('[role=row]') as Element;
    expect(isUnreadRow(row, window as Window & typeof globalThis)).toBe(true);
  });

  it('still counts a blue unread dot and still ignores a green presence dot', () => {
    document.body.innerHTML = `
      <div role="row" id="unread">
        <span>Ana</span>
        <div style="border-radius:999px;background-color:rgb(0,100,209)"></div>
      </div>
      <div role="row" id="present">
        <span>Bao</span>
        <div style="border-radius:999px;background-color:rgb(49,209,88)"></div>
      </div>`;
    const win = window as Window & typeof globalThis;
    expect(isUnreadRow(document.querySelector('#unread') as Element, win)).toBe(true);
    expect(isUnreadRow(document.querySelector('#present') as Element, win)).toBe(false);
  });

  it('still falls back to the title badge with no thread links', () => {
    document.title = 'Messenger (7)';
    expect(countUnreadRows(document, "a[href*='/t/']", (l) => l)).toEqual({
      direct: 7,
      indirect: 0,
    });
    document.title = '';
  });
});
