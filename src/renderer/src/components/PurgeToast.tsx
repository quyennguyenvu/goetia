import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

/** Acknowledges a completed purge sweep, then leaves. Same machinery as
 *  CapTrimToast — timer dismissal, hovering banks the remainder — but driven
 *  by the store rather than ShellState, because the trigger is an invoke
 *  result. Sits bottom-centre: UpdateToast owns bottom-right, CapTrimToast
 *  bottom-left, and a startup cap-trim toast can still be on screen when the
 *  user clicks purge on the Home it opened onto. */
export default function PurgeToast() {
  const message = useShell((s) => s.purgeToast);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (message) remaining.current = TOAST_MS;
  }, [message]);

  useEffect(() => {
    if (!message || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => useShell.getState().setPurgeToast(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [message, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center"
    >
      {message && (
        <button
          type="button"
          data-testid="purge-toast"
          onClick={() => useShell.getState().setPurgeToast(null)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          {/* danger tint, not the ember gradient: this toast reports a
              destructive action and the gradient is the summon signature */}
          <span className="h-7 w-7 flex-none rounded-tile bg-danger/20" />
          <span className="min-w-0 text-text-1">{message}</span>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-danger"
          />
        </button>
      )}
    </div>
  );
}
