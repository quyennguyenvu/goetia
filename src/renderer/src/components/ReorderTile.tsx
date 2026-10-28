import { Reorder } from 'motion/react';
import { type ReactNode, useState } from 'react';
import type { ServiceId } from '../../../shared/types';

// drop-shadow, not boxShadow: the wrapper is a rectangle and the tile inside
// it a squircle, so a box-shadow would halo the wrapper's corners;
// drop-shadow follows the rendered alpha.
const LIFTED = { filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))' };
// Motion has no animatable `none` for drop-shadow: it keeps the lifted value
const RESTING = { filter: 'drop-shadow(0 0px 0px rgba(0,0,0,0))' };

interface Props {
  value: ServiceId;
  className: string;
  onPointerDown(): void;
  onDragStart(): void;
  onDragEnd(): void;
  children: ReactNode;
}

/** A `Reorder.Item` that lifts while dragged. The shadow follows drag state
 *  through `animate`, never `whileDrag`: under StrictMode every reorder
 *  re-render re-applies `animate`, which beat `whileDrag` to the filter and
 *  dropped the shadow the moment a dragged tile crossed its neighbour. */
export default function ReorderTile({ onDragStart, onDragEnd, ...props }: Props) {
  const [lifted, setLifted] = useState(false);
  return (
    <Reorder.Item
      as="div"
      {...props}
      initial={false}
      animate={lifted ? LIFTED : RESTING}
      whileDrag={{ scale: 1.1, zIndex: 10 }}
      onDragStart={() => {
        setLifted(true);
        onDragStart();
      }}
      onDragEnd={() => {
        setLifted(false);
        onDragEnd();
      }}
    />
  );
}
