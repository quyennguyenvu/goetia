import { describe, expect, it } from 'vitest';
import { viewBounds } from '../../src/main/lib/layout';
import {
  parseToastReply,
  pauseClock,
  resumeClock,
  startClock,
  TOAST_GUTTER,
  TOAST_HEIGHT,
  TOAST_INSET,
  TOAST_LAYER_IDLE_MS,
  TOAST_WIDTH,
  toastBounds,
} from '../../src/main/lib/toast-layer-rules';
import { TOAST_MS } from '../../src/shared/toast';

describe('toastBounds', () => {
  const height = TOAST_INSET + TOAST_HEIGHT + TOAST_GUTTER;

  it('centres the card under a top rail, flush with the content area', () => {
    const content = viewBounds(1280, 800, 'top');
    expect(toastBounds(content)).toEqual({ x: 444, y: content.y, width: 392, height });
  });

  it('centres inside the content area beside a left rail, not the window', () => {
    const content = viewBounds(1280, 800, 'left');
    expect(toastBounds(content)).toEqual({ x: content.x + 416, y: 0, width: 392, height });
  });

  it('never leaves the content area on a window narrower than the card', () => {
    const b = toastBounds({ x: 56, y: 0, width: 300, height: 600 });
    expect(b).toEqual({ x: 56, y: 0, width: 300, height });
  });

  it('survives a content area with no room at all', () => {
    expect(toastBounds({ x: 0, y: 44, width: 0, height: 0 }).width).toBe(0);
  });

  it('keeps the spec sizes', () => {
    expect([TOAST_WIDTH, TOAST_INSET, TOAST_GUTTER, TOAST_LAYER_IDLE_MS]).toEqual([
      360, 12, 16, 60_000,
    ]);
  });
});

describe('toast clock', () => {
  it('starts with the whole toast time, running', () => {
    expect(startClock(1000)).toEqual({ remaining: TOAST_MS, runningSince: 1000 });
  });

  it('banks the remainder while hovered and resumes with it', () => {
    const paused = pauseClock(startClock(1000), 4000);
    expect(paused).toEqual({ remaining: TOAST_MS - 3000, runningSince: null });
    expect(resumeClock(paused, 9000)).toEqual({ remaining: TOAST_MS - 3000, runningSince: 9000 });
  });

  it('never banks below zero', () => {
    expect(pauseClock(startClock(0), TOAST_MS * 2).remaining).toBe(0);
  });

  // a second enter or a leave with no enter must not move the clock
  it('ignores a pause while paused and a resume while running', () => {
    const paused = pauseClock(startClock(0), 1000);
    expect(pauseClock(paused, 5000)).toBe(paused);
    const running = startClock(0);
    expect(resumeClock(running, 5000)).toBe(running);
  });
});

describe('parseToastReply', () => {
  it('accepts the four things the page may say', () => {
    for (const r of ['enter', 'leave', 'dismiss', 'reveal']) expect(parseToastReply(r)).toBe(r);
  });

  it('drops everything else', () => {
    for (const bad of [null, undefined, 7, '', 'open', { type: 'reveal' }, ['reveal']]) {
      expect(parseToastReply(bad)).toBeNull();
    }
  });
});
