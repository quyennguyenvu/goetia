import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import { shouldToast, TOAST_MS } from './toast-rules';

function ArrowUpIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

/** Announces a new release and then leaves. No close button, nothing the
 *  user must click: dismissal is a timer, and hovering banks the remainder. */
export default function UpdateToast() {
  const announce = useShell((s) => s.state?.update.announce ?? null);
  const current = useShell((s) => s.state?.version ?? '');
  const [showing, setShowing] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const lastToasted = useRef<string | null>(null);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (!shouldToast(announce, lastToasted.current)) return;
    lastToasted.current = announce;
    remaining.current = TOAST_MS;
    setPaused(false);
    setShowing(announce);
  }, [announce]);

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
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-end"
    >
      {showing && (
        <button
          type="button"
          data-testid="update-toast"
          onClick={() => {
            window.goetia.send('updates:openDownload', {});
            setShowing(null);
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)] transition-colors duration-120 hover:border-accent"
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-gradient-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#2A1403]">
            <ArrowUpIcon />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold text-text-1">Goetia {showing} is available</span>
            <span className="text-text-2">You're on {current} — click to download</span>
          </span>
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
