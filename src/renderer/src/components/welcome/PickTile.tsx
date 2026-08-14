import type React from 'react';
import type { ServiceMeta } from '../../../../shared/types';

const logos = import.meta.glob<string>('../../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface Props {
  service: ServiceMeta;
  on: boolean;
  /** the staged set is full and this tile is not in it — inert until a slot
   *  frees. aria-disabled + no-op click, NOT disabled: a disabled button
   *  swallows pointer events, which would break drag-reorder on an unpicked
   *  Summoned tile. */
  capped?: boolean;
  onToggle(): void;
}

export default function PickTile({ service, on, capped = false, onToggle }: Props) {
  const logo = logos[`../../assets/logos/${service.id}.svg`];
  // same molten-squircle language as the rail's active tile
  const face = on
    ? `scale-105 bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#15181F]
       shadow-[0_0_10px_rgba(255,158,44,0.45),0_2px_14px_rgba(240,78,62,0.5)]`
    : capped
      ? 'bg-bg-2 text-accent opacity-30 grayscale'
      : `bg-bg-2 text-accent opacity-70 group-hover:opacity-100
       group-hover:shadow-[0_0_0_1px_rgba(255,158,44,0.35)]`;
  return (
    <button
      type="button"
      data-testid="pick-tile"
      aria-pressed={on}
      aria-disabled={capped}
      onClick={() => {
        if (!capped) onToggle();
      }}
      title={capped ? '9 services is the maximum' : service.name}
      // width comes from the grid track, not the tile
      className={`group flex w-full min-w-0 flex-col items-center gap-1.5 rounded-tile p-1 outline-none
        focus-visible:ring-2 focus-visible:ring-accent ${capped ? 'cursor-not-allowed' : ''}`}
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
      {/* a two-line name would push its whole row taller than its neighbours */}
      <span className={`max-w-full truncate ${on ? 'text-text-1' : 'text-text-2'}`}>
        {service.name}
      </span>
    </button>
  );
}
