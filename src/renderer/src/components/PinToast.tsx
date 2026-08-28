import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import Portal from './Portal';
import { TOAST_MS } from './toast-rules';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Acknowledges a Done or unpin on Home and offers one Undo. Same timer
 *  machinery as PurgeToast (hover banks the remainder). Only ever triggered
 *  from Home, which is also the only time it could be seen — a service page
 *  covers everything else. Shares PurgeToast's bottom-centre slot; the two
 *  cannot both be live except by a purge followed by a Done within 8 s. */
export default function PinToast() {
  const toast = useShell((s) => s.pinToast);
  const service = useShell((s) => s.state?.services.find((x) => x.id === toast?.serviceId));
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  // a fresh toast starts unpaused: the pointer that clicked Undo on the last
  // one never left it (it unmounted underneath), so `paused` would otherwise
  // stay stuck on and the next toast would hang until the next hover
  useEffect(() => {
    if (!toast) return;
    remaining.current = TOAST_MS;
    setPaused(false);
  }, [toast]);

  useEffect(() => {
    if (!toast || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => useShell.getState().setPinToast(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [toast, paused]);

  const dismiss = () => useShell.getState().setPinToast(null);
  const pauseWhile = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center"
    >
      {toast && (
        <div
          data-testid="pin-toast"
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-center gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          {/* the pin's service, the way its row showed it — a blank ember
              square said nothing; the sigil only when the catalog is not
              in yet */}
          {service ? (
            <span
              className="flex h-7 w-7 flex-none items-center justify-center rounded-tile text-white"
              style={{ background: service.color }}
            >
              <span
                className="glyph h-4 w-4"
                style={
                  {
                    '--glyph': `url("${logos[`../assets/logos/${service.id}.svg`]}")`,
                  } as React.CSSProperties
                }
              />
            </span>
          ) : (
            <Portal className="h-7 w-7 flex-none" />
          )}
          {/* unlike PurgeToast the toast is two buttons, not one, so each
              banks the timer while hovered or focused */}
          <button
            type="button"
            onClick={dismiss}
            {...pauseWhile}
            className="flex min-w-0 flex-1 flex-col text-left"
          >
            {service && <span className="text-[11px] text-text-2">{service.name}</span>}
            <span className="text-text-1">{toast.message}</span>
          </button>
          <button
            type="button"
            data-testid="pin-undo"
            onClick={() => {
              window.goetia.send('pins:restore', { id: toast.undoId });
              dismiss();
            }}
            {...pauseWhile}
            className="flex-none rounded-ctl px-2 py-1 font-semibold text-accent transition-colors duration-120 hover:bg-bg-2"
          >
            Undo
          </button>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-accent"
          />
        </div>
      )}
    </div>
  );
}
