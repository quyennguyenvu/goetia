import type React from 'react';
import { useEffect, useState } from 'react';
import type { ServiceId, ServiceMeta } from '../../../shared/types';
import {
  buildDisabledPatch,
  summonDelta,
  summonLabel,
  welcomeSections,
} from '../../../shared/welcome';
import { useShell } from '../store';
import Portal from './Portal';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function Tip({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="w-60 rounded-modal border border-border bg-bg-1 px-4 py-3">
      <p className="flex items-center gap-2 font-semibold text-text-1">
        <span className="text-accent">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-text-2">{body}</p>
    </div>
  );
}

function PickTile({
  service,
  on,
  onToggle,
}: {
  service: ServiceMeta;
  on: boolean;
  onToggle(): void;
}) {
  const logo = logos[`../assets/logos/${service.id}.svg`];
  // same molten-squircle language as the rail's active tile
  const face = on
    ? `scale-105 bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#15181F]
       shadow-[0_0_10px_rgba(255,158,44,0.45),0_2px_14px_rgba(240,78,62,0.5)]`
    : `bg-bg-2 text-accent opacity-70 group-hover:opacity-100
       group-hover:shadow-[0_0_0_1px_rgba(255,158,44,0.35)]`;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="group flex w-[76px] flex-col items-center gap-1.5 rounded-tile p-1 outline-none
        focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-[15px] transition-all
          duration-150 ease-out ${face}`}
      >
        <span
          className="glyph h-6 w-6"
          style={{ '--glyph': `url("${logo}")` } as React.CSSProperties}
        />
      </span>
      <span className={on ? 'text-text-1' : 'text-text-2'}>{service.name}</span>
    </button>
  );
}

function Section({
  testid,
  label,
  services,
  empty,
  selected,
  onToggle,
}: {
  testid: string;
  label: string;
  services: ServiceMeta[];
  empty: string;
  selected: ReadonlySet<ServiceId>;
  onToggle(id: ServiceId): void;
}) {
  return (
    <div data-testid={testid} className="flex flex-col items-center gap-1.5">
      <p className="text-xs uppercase tracking-wide text-text-2">
        {label}
        <span className="tabular"> · {services.length}</span>
      </p>
      {services.length === 0 ? (
        <p className="text-xs text-text-2 opacity-70">{empty}</p>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-2">
          {services.map((svc) => (
            <PickTile
              key={svc.id}
              service={svc}
              on={selected.has(svc.id)}
              onToggle={() => onToggle(svc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Welcome() {
  const state = useShell((s) => s.state);
  const enabledKey = state
    ? state.services
        .filter((svc) => !state.settings.disabled[svc.id])
        .map((svc) => svc.id)
        .join(',')
    : '';
  const [selected, setSelected] = useState<ReadonlySet<ServiceId>>(new Set());

  // Re-seed every time the screen becomes visible or the live set changes, so
  // a discarded edit never survives to the next visit. A fresh install has an
  // empty enabled set, which reproduces the original empty selection.
  useEffect(() => {
    setSelected(new Set(enabledKey ? (enabledKey.split(',') as ServiceId[]) : []));
  }, [enabledKey]);

  // Home is a place, not a modal — but Escape is the reflex. Guarded the way
  // SettingsView guards its own handler: only when nothing is layered on top,
  // and never when there is no service to go back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useShell.getState().state;
      if (!s?.homeOpen || s.settingsOpen || s.switcherOpen) return;
      if (s.services.every((svc) => s.settings.disabled[svc.id])) return;
      window.goetia.send('home:setOpen', { open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;

  const toggle = (id: ServiceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const enabled = new Set<ServiceId>(
    state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id),
  );
  const order = state.services.map((svc) => svc.id);
  const { label, disabled } = summonLabel(summonDelta(order, enabled, selected), enabled.size > 0);

  // sections follow the LIVE enabled set; the tile glow follows `selected`.
  // Keeping the two axes independent is what stops a tile jumping out from
  // under the cursor when it is deselected.
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const sections = welcomeSections(order, enabled);
  const pick = (ids: ServiceId[]) =>
    ids.map((id) => byId.get(id)).filter((svc) => svc !== undefined);

  const summon = () =>
    window.goetia.send('settings:update', { disabled: buildDisabledPatch(order, selected) });
  // the same reseed the screen does on every visit, under the user's thumb
  const dispel = () => setSelected(enabled);

  return (
    <div
      data-testid="welcome"
      className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto bg-bg-0 px-8"
    >
      <Portal className="h-24 w-24" />
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-1">Welcome to Goetia</h1>
        <p className="mt-1 text-text-2">All your chats. Nothing else.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Tip
          icon={<ChatIcon />}
          title="Chat only"
          body="No feeds, no shops. Reload (⌘/Ctrl R) returns to the chat."
        />
        <Tip
          icon={<LockIcon />}
          title="Stays signed in"
          body="Each service keeps its own session. Sign in once."
        />
        <Tip
          icon={<MoonIcon />}
          title="Quiet & light"
          body="Only messages for you get a count. Idle chats sleep."
        />
      </div>
      {/* wide enough for all seven tiles on one row (7 × 76px + 6 × gap) */}
      <div className="flex w-full max-w-[600px] flex-col items-center gap-3">
        <Section
          testid="welcome-section-summoned"
          label="Summoned"
          services={pick(sections.summoned)}
          empty="Nothing yet."
          selected={selected}
          onToggle={toggle}
        />
        <div className="h-px w-full bg-border" />
        <Section
          testid="welcome-section-unbound"
          label="Unbound"
          services={pick(sections.unbound)}
          empty="Every one is bound."
          selected={selected}
          onToggle={toggle}
        />
      </div>
      <p className="text-xs text-text-2">
        Pick at least one — come back here anytime with ⌘/Ctrl 0.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={dispel}
          className="rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
            transition-colors duration-120 enabled:hover:border-accent disabled:opacity-40"
        >
          Dispel
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={summon}
          className="tabular rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]
            px-6 py-2 font-semibold text-[#15181F] shadow-[0_0_12px_rgba(255,158,44,0.35)]
            transition-opacity duration-150 enabled:hover:opacity-90 disabled:opacity-40
            disabled:shadow-none"
        >
          {label}
        </button>
      </div>
    </div>
  );
}
