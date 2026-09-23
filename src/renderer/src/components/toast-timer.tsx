import { useEffect, useRef, useState } from 'react';
import { TOAST_MS } from './toast-rules';

/** The toasts' clock for a transient line that is not a toast card: `TOAST_MS`
 *  from the moment `token` last changed, then `onExpire`; while the surface is
 *  hovered or focused the remainder is banked, as PurgeToast and PinToast do
 *  inline. `token` is the thing shown — a fresh object per showing, so a repeat
 *  restarts the clock — and null while nothing is. */
export function useToastTimer<E extends HTMLElement = HTMLElement>(
  token: object | null,
  onExpire: () => void,
) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);
  const expire = useRef(onExpire);
  /** the hovered surface; attach it to the element that carries `pauseWhile` */
  const surface = useRef<E>(null);
  expire.current = onExpire;

  // a fresh showing reads the pointer from `:hover` instead of assuming: the
  // line can mount under a resting pointer (Remove was clicked where Undo now
  // sits), which never enters yet should already be banking, and the pointer
  // that clicked Undo on the last showing never left, so `paused` cannot carry
  useEffect(() => {
    if (!token) return;
    remaining.current = TOAST_MS;
    setPaused(surface.current?.matches(':hover') ?? false);
  }, [token]);

  useEffect(() => {
    if (!token || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => expire.current(), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [token, paused]);

  // `onMouseMove`, not only enter: the line can mount under a resting pointer
  // (Remove was clicked where Undo now sits), and a pointer that starts inside
  // never enters — it only ever moves. A same-value set is a no-op for React.
  return {
    paused,
    surface,
    pauseWhile: {
      onMouseEnter: () => setPaused(true),
      onMouseMove: () => setPaused(true),
      onMouseLeave: () => setPaused(false),
      onFocus: () => setPaused(true),
      onBlur: () => setPaused(false),
    },
  };
}

/** The thin bar that drains over `TOAST_MS`. Decorative — the timeout above
 *  decides — so reduced motion changes nothing. `className` places and colours
 *  it (`bottom-0 bg-accent` on a card, `-bottom-1` under a text line). */
export function ToastDrain({ paused, className }: { paused: boolean; className: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="toast-drain"
      style={{
        animationDuration: `${TOAST_MS}ms`,
        animationPlayState: paused ? 'paused' : 'running',
      }}
      className={`toast-drain absolute inset-x-0 h-0.5 ${className}`}
    />
  );
}
