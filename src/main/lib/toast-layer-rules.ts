import { TOAST_MS } from '../../shared/toast';
import type { ViewBounds } from './layout';

/** the card: PinToast's 340 plus room for a filename beside the action */
export const TOAST_WIDTH = 360;
/** fixed, so main can size the layer without asking the page */
export const TOAST_HEIGHT = 64;
/** below the content area's top edge: clear of the rail, over the chat header */
export const TOAST_INSET = 12;
/** the transparent margin the shadow draws in, and the gutter a narrow window keeps */
export const TOAST_GUTTER = 16;
/** the layer's renderer is dropped this long after the last toast leaves */
export const TOAST_LAYER_IDLE_MS = 60_000;

/** The layer's rect inside the content area: the card plus its shadow margin,
 *  top centre. Only this rectangle takes clicks from the service page. */
export function toastBounds(content: ViewBounds): ViewBounds {
  const card = Math.max(0, Math.min(TOAST_WIDTH, content.width - 2 * TOAST_GUTTER));
  const width = Math.min(content.width, card + 2 * TOAST_GUTTER);
  return {
    x: content.x + Math.round((content.width - width) / 2),
    y: content.y,
    width,
    height: TOAST_INSET + TOAST_HEIGHT + TOAST_GUTTER,
  };
}

/** `remaining` is what was left at `runningSince`; null while hover banks it. */
export interface ToastClock {
  remaining: number;
  runningSince: number | null;
}

export function startClock(now: number): ToastClock {
  return { remaining: TOAST_MS, runningSince: now };
}

export function pauseClock(c: ToastClock, now: number): ToastClock {
  if (c.runningSince === null) return c;
  return { remaining: Math.max(0, c.remaining - (now - c.runningSince)), runningSince: null };
}

export function resumeClock(c: ToastClock, now: number): ToastClock {
  return c.runningSince === null ? { remaining: c.remaining, runningSince: now } : c;
}

export type ToastReply = 'enter' | 'leave' | 'dismiss' | 'reveal';

/** The port's whole vocabulary. No reply carries a path, an id or a URL, so
 *  the page can never name a file: main already holds the one the toast is for. */
export function parseToastReply(data: unknown): ToastReply | null {
  return data === 'enter' || data === 'leave' || data === 'dismiss' || data === 'reveal'
    ? data
    : null;
}
