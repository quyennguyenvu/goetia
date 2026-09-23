import type React from 'react';

/** A Settings card under an uppercase label. `aside` sits at the label's
 *  right for a hint or a quiet action; `highlight` rides the card, not a
 *  wrapper, because the card is opaque and would paint over a tinted
 *  ancestor. */
export default function Pane({
  title,
  children,
  highlight,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-2">{title}</h2>
        {aside}
      </div>
      <div
        className={`rounded-modal border bg-bg-1 px-4 py-1 transition duration-300 ${
          highlight ? 'border-accent ring-2 ring-accent/25' : 'border-border'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
