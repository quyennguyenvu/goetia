import { motion } from 'motion/react';
import type React from 'react';

interface Props {
  testid: string;
  label: string;
  count: number;
  /** right-aligned slot on the label row — costs no vertical height */
  aside?: React.ReactNode;
  /** false for content that fits by construction (Summoned's single row):
   *  no scroll container means no clipped glow and no scrollbar flicker
   *  when a tile animates */
  scroll?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function ServiceBand({
  testid,
  label,
  count,
  aside,
  scroll = true,
  className = '',
  children,
}: Props) {
  return (
    <section
      data-testid={testid}
      className={`flex min-h-0 flex-col gap-2.5 rounded-modal border border-border bg-bg-1
        px-4 pb-4 pt-3.5 ${className}`}
    >
      <div className="flex flex-none items-center gap-2 text-xs uppercase tracking-wide text-text-2">
        <span>{label}</span>
        <span className="tabular">· {count}</span>
        <span className="flex-1" />
        {aside}
      </div>
      {/* the scroll container: growth stops here and never reaches the page.
          layoutScroll is what lets Motion correct a drag inside it for scroll
          offset — without it a drag in a scrolled band computes crossings
          against stale rects. The -m-3/p-3 pair moves the clip boundary 12px
          out from the tiles, so the selection glow and focus ring render
          whole instead of being cut at the band edge. */}
      {scroll ? (
        <motion.div layoutScroll className="-m-3 min-h-0 overflow-y-auto p-3">
          {children}
        </motion.div>
      ) : (
        <div className="min-h-0">{children}</div>
      )}
    </section>
  );
}
