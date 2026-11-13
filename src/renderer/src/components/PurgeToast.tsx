import { useMemo } from 'react';
import { useShell } from '../store';
import { ToastDrain, useToastTimer } from './toast-timer';

/** Acknowledges a completed purge sweep, then leaves. The toasts' shared
 *  clock (useToastTimer: timer dismissal, hovering banks the remainder), driven
 *  by the store rather than ShellState, because the trigger is an invoke
 *  result. Sits bottom-centre: UpdateToast owns bottom-right, CapTrimToast
 *  bottom-left, and a startup cap-trim toast can still be on screen when the
 *  user clicks purge on the Home it opened onto. */
export default function PurgeToast() {
  const message = useShell((s) => s.purgeToast);
  // a fresh token per showing, so the clock and its hover state start over
  const token = useMemo(() => (message ? { message } : null), [message]);
  const clock = useToastTimer<HTMLButtonElement>(token, () =>
    useShell.getState().setPurgeToast(null),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center"
    >
      {message && (
        <button
          ref={clock.surface}
          type="button"
          data-testid="purge-toast"
          onClick={() => useShell.getState().setPurgeToast(null)}
          {...clock.pauseWhile}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          {/* danger tint, not the ember gradient: this toast reports a
              destructive action and the gradient is the summon signature */}
          <span className="h-7 w-7 flex-none rounded-tile bg-danger/20" />
          <span className="min-w-0 text-text-1">{message}</span>
          <ToastDrain paused={clock.paused} className="bottom-0 bg-danger" />
        </button>
      )}
    </div>
  );
}
