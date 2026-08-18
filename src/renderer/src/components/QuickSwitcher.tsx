import { useEffect, useMemo, useRef, useState } from 'react';
import { badgeLabel } from '../../../shared/badges';
import type { ActivityEntryView, ServiceId } from '../../../shared/types';
import { useShell } from '../store';
import { relativeTime, switcherRows } from './switcher-results';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function SectionLabel({ children }: { children: string }) {
  return (
    <li
      aria-hidden="true"
      className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-2"
    >
      {children}
    </li>
  );
}

export default function QuickSwitcher() {
  const state = useShell((s) => s.state);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<ActivityEntryView[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = state?.switcherOpen ?? false;

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // one fetch per open — recents are never broadcast
      window.goetia
        .invoke('activity:recent')
        .then(setRecents)
        .catch(() => setRecents([]));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const enabled = useMemo(
    () => (state ? state.services.filter((svc) => !state.settings.disabled[svc.id]) : []),
    [state],
  );

  const rows = useMemo(
    () =>
      switcherRows({
        query,
        recents,
        services: enabled.map((svc) => ({ id: svc.id, name: svc.name })),
      }),
    [query, recents, enabled],
  );
  const total = rows.recents.length + rows.services.length;

  if (!state || !open) return null;

  const close = () => window.goetia.send('switcher:setOpen', { open: false });
  const pick = (id: ServiceId) => {
    window.goetia.send('service:activate', { serviceId: id });
    close();
  };
  const openRecent = (entryId: number) => {
    window.goetia.send('activity:open', { entryId });
    close();
  };
  const submit = (i: number) => {
    const recent = rows.recents[i];
    if (recent) {
      openRecent(recent.id);
    } else {
      const svc = rows.services[i - rows.recents.length];
      if (svc) pick(svc.id);
    }
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
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, total - 1));
            if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
            if (e.key === 'Enter') submit(cursor);
          }}
          placeholder="Search services and recent chats…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none placeholder:text-text-2"
        />
        <ul className="max-h-[420px] overflow-y-auto">
          {rows.recents.length > 0 && <SectionLabel>Recent</SectionLabel>}
          {rows.recents.map((r, i) => (
            <li key={`recent-${r.id}`}>
              <button
                type="button"
                onClick={() => openRecent(r.id)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-accent/15' : ''}`}
              >
                <img src={logos[`../assets/logos/${r.serviceId}.svg`]} alt="" className="h-5 w-5" />
                <span className="flex-1 truncate text-text-1">{r.title}</span>
                <span className="tabular text-[11px] text-text-2">
                  {relativeTime(r.at, Date.now())}
                  {r.silenced && <span title="Silenced by mute or quiet hours"> 🌙</span>}
                </span>
              </button>
            </li>
          ))}
          {rows.recents.length > 0 && rows.services.length > 0 && (
            <SectionLabel>Services</SectionLabel>
          )}
          {rows.services.map((svc, j) => {
            const i = rows.recents.length + j;
            const unread = state.runtime[svc.id].unread.direct;
            const accel = enabled.findIndex((s) => s.id === svc.id) + 1;
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
                  <span className="tabular text-text-2">⌘{accel}</span>
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
