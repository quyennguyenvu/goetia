import { useEffect, useMemo, useRef, useState } from 'react';
import { badgeLabel } from '../../../shared/badges';
import type { ServiceId } from '../../../shared/types';
import { useShell } from '../store';
import { fuzzyScore } from './fuzzy';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export default function QuickSwitcher() {
  const state = useShell((s) => s.state);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = state?.switcherOpen ?? false;

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const enabled = useMemo(
    () => (state ? state.services.filter((svc) => !state.settings.disabled[svc.id]) : []),
    [state],
  );

  const results = useMemo(() => {
    return enabled
      .map((svc) => ({ svc, score: fuzzyScore(query, svc.name) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [enabled, query]);

  if (!state || !open) return null;

  const close = () => window.goetia.send('switcher:setOpen', { open: false });
  const pick = (id: ServiceId) => {
    window.goetia.send('service:activate', { serviceId: id });
    close();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; Escape handled on the input
    <div
      role="presentation"
      className="absolute inset-0 z-10 flex items-start justify-center bg-black/40 pt-32"
      onMouseDown={close}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: swallows backdrop mousedown */}
      <div
        role="presentation"
        data-testid="switcher"
        className="w-[560px] overflow-hidden rounded-modal border border-border bg-bg-2 shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, results.length - 1));
            if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
            if (e.key === 'Enter' && results[cursor]) pick(results[cursor].svc.id);
          }}
          placeholder="Jump to service…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none placeholder:text-text-2"
        />
        <ul>
          {results.map(({ svc }, i) => {
            const unread = state.runtime[svc.id].unread.direct;
            return (
              <li key={svc.id}>
                <button
                  type="button"
                  onClick={() => pick(svc.id)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-accent/15' : ''}`}
                >
                  <img src={logos[`../assets/logos/${svc.id}.svg`]} alt="" className="h-5 w-5" />
                  <span className="flex-1 text-text-1">{svc.name}</span>
                  <span className="tabular text-text-2">⌘{enabled.indexOf(svc) + 1}</span>
                  {unread > 0 && (
                    <span className="tabular rounded-full bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {badgeLabel(unread)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
