import { useEffect, useRef, useState } from 'react';
import type { ServiceId, ServiceMeta } from '../../../shared/types';
import { useShell } from '../store';
import { capTrimMessage, TOAST_MS } from './toast-rules';

// stable empties: a selector that returns a fresh [] on every snapshot makes
// useSyncExternalStore loop (React #185) while state is still null
const NO_IDS: ServiceId[] = [];
const NO_SERVICES: ServiceMeta[] = [];

/** Says which services the summon cap banished at startup, once, then leaves.
 *  Same machinery as UpdateToast: timer dismissal, hovering banks the
 *  remainder. Sits bottom-left so a simultaneous update toast keeps its
 *  bottom-right corner. */
export default function CapTrimToast() {
  const trimmed = useShell((s) => s.state?.capTrimmed ?? NO_IDS);
  const services = useShell((s) => s.state?.services ?? NO_SERVICES);
  const [showing, setShowing] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const shown = useRef(false);
  const remaining = useRef(TOAST_MS);

  const names = trimmed.map((id) => services.find((svc) => svc.id === id)?.name ?? id);
  const message = capTrimMessage(names);

  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    remaining.current = TOAST_MS;
    setShowing(message);
  }, [message]);

  useEffect(() => {
    if (!showing || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => setShowing(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [showing, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-start"
    >
      {showing && (
        <button
          type="button"
          data-testid="cap-trim-toast"
          onClick={() => setShowing(null)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          <span className="h-7 w-7 flex-none rounded-tile bg-gradient-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]" />
          <span className="min-w-0 text-text-1">{showing}</span>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]"
          />
        </button>
      )}
    </div>
  );
}
