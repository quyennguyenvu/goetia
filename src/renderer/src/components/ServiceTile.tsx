import type React from 'react';
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
  orientation: 'vertical' | 'horizontal';
  onActivate(): void;
  onContextMenu(e: React.MouseEvent): void;
  onReorder(fromId: string, toId: string): void;
}

export function badgeText(direct: number): string {
  return direct > 99 ? '99+' : String(direct);
}

export default function ServiceTile({
  service,
  runtime,
  muted,
  active,
  orientation,
  onActivate,
  onContextMenu,
  onReorder,
}: Props) {
  const logo = logos[`../assets/logos/${service.id}.svg`];
  const showBadge = runtime.unread.direct > 0;
  const stateClasses = active
    ? 'opacity-100 shadow-[0_2px_10px_rgba(0,0,0,0.35)]'
    : runtime.hibernated
      ? 'opacity-35 saturate-50 hover:opacity-70'
      : 'opacity-55 saturate-[.8] hover:opacity-95 hover:saturate-100';
  return (
    <button
      type="button"
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
      className={`relative flex h-11 w-11 items-center justify-center rounded-tile transition-all duration-120 outline-none
        focus-visible:ring-2 focus-visible:ring-accent ${stateClasses}`}
      style={{ backgroundColor: service.color }}
    >
      {active &&
        (orientation === 'vertical' ? (
          <span className="absolute -left-3 h-7 w-[3px] rounded-full bg-accent" />
        ) : (
          <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-accent" />
        ))}
      <img src={logo} alt="" className="h-7 w-7" draggable={false} />
      {showBadge && (
        <span className="tabular absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg-1 bg-badge px-1 text-[10px] font-bold text-white">
          {badgeText(runtime.unread.direct)}
        </span>
      )}
      {!showBadge && runtime.unread.indirect > 0 && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-bg-1 bg-text-2" />
      )}
      {runtime.crashed && (
        <span className="absolute -right-1 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-bg-1 bg-warn" />
      )}
      {runtime.stale && !runtime.crashed && (
        <span
          className="absolute -right-1 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-bg-1 bg-text-2"
          title="count may be stale"
        />
      )}
      {muted && (
        <span
          className="absolute -left-1 bottom-0 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-bg-2 text-[9px]"
          title="muted"
        >
          🔕
        </span>
      )}
    </button>
  );
}
