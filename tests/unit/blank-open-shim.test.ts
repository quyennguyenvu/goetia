// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBlankOpenShim } from '../../src/preload/lib/blank-open-shim';
import { SERVICES } from '../../src/shared/services';

describe('blank open shim', () => {
  const realOpen = vi.fn(() => null);
  const hand = vi.fn();

  beforeEach(() => {
    realOpen.mockClear();
    hand.mockClear();
    window.open = realOpen;
    installBlankOpenShim(window, hand);
  });

  it('answers a blank open with a handle instead of null', () => {
    for (const url of [undefined, '', 'about:blank']) {
      expect(window.open(url)).not.toBeNull();
    }
    expect(realOpen).not.toHaveBeenCalled();
  });

  it("hands the URL Zalo assigns to the handle, the way Zalo's link opener does", () => {
    const w = window.open();
    if (!w) throw new Error('no handle');
    w.opener = null;
    w.location = 'https://www.facebook.com/share/p/x/';
    expect(hand).toHaveBeenCalledWith('https://www.facebook.com/share/p/x/');
  });

  it('resolves a scheme-relative URL against the page', () => {
    const w = window.open();
    if (!w) throw new Error('no handle');
    w.location = '//example.com/p';
    expect(hand).toHaveBeenCalledWith(`${window.location.protocol}//example.com/p`);
  });

  it('hands the URL through location.href too', () => {
    const w = window.open();
    if (!w) throw new Error('no handle');
    w.location.href = 'https://example.com/a';
    expect(hand).toHaveBeenCalledWith('https://example.com/a');
  });

  it('drops a URL that does not parse', () => {
    const w = window.open();
    if (!w) throw new Error('no handle');
    w.location = 'http://[';
    expect(hand).not.toHaveBeenCalled();
  });

  it('closes like a window', () => {
    const w = window.open();
    if (!w) throw new Error('no handle');
    expect(w.closed).toBe(false);
    w.close();
    expect(w.closed).toBe(true);
  });

  it('leaves an open with a real URL to the page', () => {
    window.open('https://example.com/', '_blank');
    expect(realOpen).toHaveBeenCalledWith('https://example.com/', '_blank');
    expect(hand).not.toHaveBeenCalled();
  });
});

describe('opensLinksBlank', () => {
  it('is Zalo alone — every other service keeps the real window.open', () => {
    const flagged = SERVICES.filter((s) => s.opensLinksBlank).map((s) => s.id);
    expect(flagged).toEqual(['zalo']);
  });
});
