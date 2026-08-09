import type React from 'react';
import { badgeLabel } from '../../../shared/badges';
import type { ServiceMeta, ServiceRuntime } from '../../../shared/types';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface Props {
  service: ServiceMeta;
  runtime: ServiceRuntime;
  muted: boolean;
  active: boolean;
  onActivate(): void;
  onContextMenu(e: React.MouseEvent): void;
  onReorder(fromId: string, toId: string): void;
}

export default function ServiceTile({
  service,
  runtime,
  muted,
  active,
  onActivate,
  onContextMenu,
  onReorder,
}: Props) {
  const logo = logos[`../assets/logos/${service.id}.svg`];
  const showBadge = runtime.unread.direct > 0;
  const waking = runtime.waking && !runtime.crashed;
  // "Molten Squircle": ember-toned tiles; the active one floods with the warm
  // gradient so it stays unmistakable on dark graphite.
  const stateClasses = active
    ? `scale-105 bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#15181F]
       shadow-[0_0_10px_rgba(255,158,44,0.45),0_2px_14px_rgba(240,78,62,0.5),inset_0_1px_0_rgba(255,255,255,0.25)]`
    : runtime.hibernated
      ? 'bg-bg-2 text-accent opacity-40 hover:opacity-75'
      : 'bg-bg-2 text-accent opacity-70 hover:opacity-100 hover:shadow-[0_0_0_1px_rgba(255,158,44,0.35)]';
  return (
    <button
      type="button"
      data-testid="service-tile"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/goetia-service', service.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/goetia-service');
        if (from && from !== service.id) onReorder(from, service.id);
      }}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      title={`${service.name}${showBadge ? ` — ${runtime.unread.direct} unread` : ''}`}
      aria-label={service.name}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-8 w-8 items-center justify-center rounded-[11px] transition-all duration-150 ease-out outline-none
        focus-visible:ring-2 focus-visible:ring-accent ${stateClasses}
        ${waking ? 'tile-breathe' : ''}`}
    >
      <span
        className="glyph h-4.5 w-4.5"
        style={{ '--glyph': `url("${logo}")` } as React.CSSProperties}
      />
      {showBadge && (
        <span className="tabular absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-bg-1 bg-badge px-0.5 text-[9px] font-bold text-white">
          {badgeLabel(runtime.unread.direct)}
        </span>
      )}
      {!showBadge && runtime.unread.indirect > 0 && (
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-bg-1 bg-text-2" />
      )}
      {runtime.crashed && (
        <span className="absolute -right-1 bottom-0 h-2 w-2 rounded-full border border-bg-1 bg-warn" />
      )}
      {runtime.stale && !runtime.crashed && (
        <span
          className="absolute -right-1 bottom-0 h-2 w-2 rounded-full border border-bg-1 bg-text-2"
          title="count may be stale"
        />
      )}
      {muted && (
        <span
          className="absolute -left-1 -bottom-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-bg-2"
          title="muted"
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            aria-hidden="true"
            className="text-text-2"
          >
            <path d="M18 13.5V11a6 6 0 1 0-12 0v2.5c0 1.2-.7 2.2-1.6 3-.4.4-.1 1 .4 1h14.4c.5 0 .8-.6.4-1-.9-.8-1.6-1.8-1.6-3Z" />
            <line x1="4" y1="3.5" x2="20" y2="20.5" />
          </svg>
        </span>
      )}
    </button>
  );
}
