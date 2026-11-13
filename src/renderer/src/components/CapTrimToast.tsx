import { useEffect, useMemo, useRef, useState } from 'react';
import type { ServiceId, ServiceMeta } from '../../../shared/types';
import { useShell } from '../store';
import Portal from './Portal';
import { capTrimMessage } from './toast-rules';
import { ToastDrain, useToastTimer } from './toast-timer';

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
  const shown = useRef(false);
  const token = useMemo(() => (showing ? { showing } : null), [showing]);
  const clock = useToastTimer<HTMLButtonElement>(token, () => setShowing(null));

  const names = trimmed.map((id) => services.find((svc) => svc.id === id)?.name ?? id);
  const message = capTrimMessage(names);

  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    setShowing(message);
  }, [message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-start"
    >
      {showing && (
        <button
          ref={clock.surface}
          type="button"
          data-testid="cap-trim-toast"
          onClick={() => setShowing(null)}
          {...clock.pauseWhile}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          {/* the app speaking, so its sigil — not a blank ember square */}
          <Portal className="h-7 w-7 flex-none" />
          <span className="min-w-0 text-text-1">{showing}</span>
          <ToastDrain
            paused={clock.paused}
            className="bottom-0 bg-gradient-to-r from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]"
          />
        </button>
      )}
    </div>
  );
}
