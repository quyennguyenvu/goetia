import { useEffect, useState } from 'react';
import type { DiagEntry } from '../../../shared/types';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

/** `12s ago`, `4 min ago`, `2 h ago`, else a date — read at render time; the
 *  pane is fetched once per open, so a stale relative time is at most the
 *  time the pane has been on screen. */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}

/** Settings → Diagnostics: the evidence ring, newest first, and one button
 *  that puts the pasteable report on the clipboard. Fetched on open, never
 *  broadcast — see main/lib/diagnostics.ts. */
export default function DiagnosticsPane() {
  const services = useShell((s) => s.state?.services);
  const [entries, setEntries] = useState<DiagEntry[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.goetia.invoke('diagnostics:recent').then(setEntries);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), TOAST_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const text = await window.goetia.invoke('diagnostics:report');
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  if (entries === null) return null;
  const now = Date.now();
  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <p className="text-[11px] text-text-2">
          What Goetia noticed going wrong since it started: a badge counter that stopped, a login it
          had to contain, a page that crashed. Never a message, a name or a file.
        </p>
        <button
          type="button"
          data-testid="diag-copy"
          onClick={() => void copy()}
          className="flex-none rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
        >
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="pb-3 text-[11px] text-text-2" data-testid="diag-empty">
          Nothing to report yet.
        </p>
      ) : (
        <ul className="pb-2">
          {entries.map((e) => {
            const svc = e.serviceId ? services?.find((s) => s.id === e.serviceId) : undefined;
            return (
              <li
                key={`${e.at}-${e.tag}-${e.line}`}
                data-testid="diag-row"
                className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-b-0"
              >
                <span className="tabular w-[72px] flex-none text-[11px] text-text-2">
                  {relativeTime(e.at, now)}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 h-[7px] w-[7px] flex-none self-center rounded-full"
                  style={{ background: svc?.color ?? 'transparent' }}
                />
                <span className="min-w-0 break-words text-[12px] text-text-1">
                  <span className="text-text-2">[{e.tag}]</span> {e.line}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
