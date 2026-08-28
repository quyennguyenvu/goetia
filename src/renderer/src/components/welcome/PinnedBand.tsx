import { Reorder, useDragControls } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { PIN_NOTE_MAX } from '../../../../shared/pins';
import type { PinView, ServiceId, ServiceMeta } from '../../../../shared/types';
import { useShell } from '../../store';
import { pinRemovedMessage } from '../toast-rules';
import ServiceBand from './ServiceBand';

const logos = import.meta.glob<string>('../../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const DRAG_CURSOR = 'tile-dragging';

interface Props {
  pins: PinView[];
  services: ServiceMeta[];
  disabled: Record<ServiceId, boolean>;
}

/** Home's pinboard: pin 0 is the altar (in progress), the rest the queue.
 *  One Reorder.Group holds all of them, so dragging into slot 0 is how the
 *  in-progress item changes. The drag runs on a local draft and reaches main
 *  once, on drop — the rail's useTileReorder rule, for pin ids. The band's
 *  max-height caps it at the altar plus about six rows; the queue scrolls
 *  inside, so Summoned and a row of Unbound always stay on screen. Pin
 *  actions commit immediately — a todo list has no multi-part edit to stage. */
export default function PinnedBand({ pins, services, disabled }: Props) {
  const liveIds = pins.map((p) => p.id);
  const liveKey = liveIds.join(',');
  const [draft, setDraft] = useState<number[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const shown = draft ?? liveIds;
  const byId = new Map(pins.map((p) => [p.id, p]));
  const svcById = new Map(services.map((s) => [s.id, s]));

  // never cleared on commit (one frame of snap-back); cleared when the
  // broadcast lands — the arriving order equals the draft — or when anything
  // else moves the list under it
  // biome-ignore lint/correctness/useExhaustiveDependencies: liveKey (the live order) is the trigger; the draft is reset on purpose
  useEffect(() => setDraft(null), [liveKey]);
  useEffect(() => () => document.body.classList.remove(DRAG_CURSOR), []);

  const remove = (id: number, kind: 'done' | 'unpin') => {
    const pin = byId.get(id);
    if (!pin) return;
    window.goetia.send('pins:unpin', { id });
    useShell
      .getState()
      .setPinToast({ message: pinRemovedMessage(kind), undoId: id, serviceId: pin.serviceId });
  };
  const open = (id: number) => window.goetia.send('pins:open', { id });
  const commitNote = (id: number, note: string) => {
    setEditing(null);
    if (note.trim() !== (byId.get(id)?.note ?? ''))
      window.goetia.send('pins:setNote', { id, note });
  };
  const dragEnd = () => {
    document.body.classList.remove(DRAG_CURSOR);
    if (shown.join(',') === liveKey) {
      setDraft(null);
      return;
    }
    window.goetia.send('pins:reorder', { ids: shown });
  };

  return (
    <ServiceBand
      testid="welcome-section-pinned"
      label="Pinned"
      count={pins.length}
      className="max-h-[344px] min-h-[124px] flex-[0_1_auto]"
    >
      {pins.length === 0 ? (
        <p className="text-xs text-text-2 opacity-70">
          Nothing pinned — right-click a message in any service, or select text and press ⌘/Ctrl ⇧
          S.
        </p>
      ) : (
        <Reorder.Group
          as="div"
          axis="y"
          values={shown}
          onReorder={setDraft}
          className="flex flex-col gap-1.5"
        >
          {shown.map((id, index) => {
            const pin = byId.get(id);
            const svc = pin && svcById.get(pin.serviceId);
            if (!pin || !svc) return null;
            return (
              <PinRow
                key={id}
                pin={pin}
                service={svc}
                logo={logos[`../../assets/logos/${svc.id}.svg`]}
                altar={index === 0}
                banished={disabled[svc.id]}
                editing={editing === id}
                onEdit={() => setEditing(id)}
                onCommitNote={(note) => commitNote(id, note)}
                onOpen={() => open(id)}
                onDone={() => remove(id, 'done')}
                onUnpin={() => remove(id, 'unpin')}
                onDragStart={() => document.body.classList.add(DRAG_CURSOR)}
                onDragEnd={dragEnd}
              />
            );
          })}
        </Reorder.Group>
      )}
    </ServiceBand>
  );
}

interface RowProps {
  pin: PinView;
  service: ServiceMeta;
  logo: string;
  altar: boolean;
  banished: boolean;
  editing: boolean;
  onEdit(): void;
  onCommitNote(note: string): void;
  onOpen(): void;
  onDone(): void;
  onUnpin(): void;
  onDragStart(): void;
  onDragEnd(): void;
}

function PinRow({
  pin,
  service,
  logo,
  altar,
  banished,
  editing,
  onEdit,
  onCommitNote,
  onOpen,
  onDone,
  onUnpin,
  onDragStart,
  onDragEnd,
}: RowProps) {
  // a handle, not the whole row: the row is buttons end to end, and a click
  // on the text opens the conversation
  const controls = useDragControls();
  const openTitle = banished
    ? 'Banished — summon it on this board to open'
    : `Open in ${service.name}`;

  const handle = (
    <span
      role="presentation"
      title="Drag to reprioritize"
      onPointerDown={(e) => controls.start(e)}
      className="flex-none cursor-grab select-none text-text-2 opacity-50 hover:opacity-100"
    >
      ⠿
    </span>
  );
  const chip = (
    <span className="flex min-w-[88px] flex-none items-center gap-1.5 text-[11px] text-text-2">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-[5px] text-white"
        style={{ background: service.color }}
      >
        <span
          className="glyph h-2.5 w-2.5"
          style={{ '--glyph': `url("${logo}")` } as React.CSSProperties}
        />
      </span>
      {service.name}
    </span>
  );
  // best-effort from the page title; absent for sites whose title is only
  // their own name
  const where = pin.conversation ? (
    <span
      className="max-w-[22%] flex-none truncate text-[11px] text-text-2"
      title={`in ${pin.conversation}`}
    >
      · {pin.conversation}
    </span>
  ) : null;
  const text = (
    <button
      type="button"
      onClick={onOpen}
      disabled={banished}
      title={openTitle}
      className={`min-w-0 flex-1 truncate text-left text-text-1 disabled:opacity-50 ${
        altar ? 'text-sm' : ''
      }`}
    >
      {pin.text}
    </button>
  );
  const note = editing ? (
    <input
      type="text"
      // biome-ignore lint/a11y/noAutofocus: the user just clicked the note to edit it
      autoFocus
      defaultValue={pin.note}
      aria-label="Pin note"
      maxLength={PIN_NOTE_MAX}
      onBlur={(e) => onCommitNote(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Enter/Escape are Home's too (Escape leaves Home): keep them here
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = pin.note;
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded-ctl border border-border bg-bg-1 px-1.5 py-0.5 text-xs text-text-1 outline-none focus:border-accent"
    />
  ) : (
    <button
      type="button"
      onClick={onEdit}
      title="Edit note"
      className={`max-w-[40%] flex-none truncate text-xs italic text-text-2 hover:text-text-1 ${
        pin.note ? '' : 'opacity-50'
      }`}
    >
      {pin.note || 'add a note'}
    </button>
  );
  const done = (
    <button
      type="button"
      aria-label="Done"
      title="Done — removes the pin"
      onClick={onDone}
      className={`flex-none rounded-ctl text-ok transition-colors duration-120 hover:bg-ok/20 ${
        altar ? 'border border-ok/40 bg-ok/10 px-2.5 py-0.5 text-xs font-semibold' : 'px-1'
      }`}
    >
      {altar ? '✓ Done' : '✓'}
    </button>
  );
  const unpin = (
    <button
      type="button"
      aria-label="Unpin"
      title="Unpin"
      onClick={onUnpin}
      className="flex-none px-1 text-text-2 hover:text-text-1"
    >
      ×
    </button>
  );

  return (
    <Reorder.Item
      as="div"
      value={pin.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, zIndex: 10, boxShadow: '0 8px 16px rgba(0,0,0,0.35)' }}
      data-testid={altar ? 'pin-altar' : 'pin-row'}
      className={`${banished ? 'opacity-60' : ''} ${
        altar
          ? 'flex flex-col gap-1 rounded-tile border border-accent/50 bg-bg-2 bg-[linear-gradient(90deg,rgba(232,89,12,0.09),transparent_60%)] px-3 py-2 shadow-[inset_3px_0_0_var(--accent)]'
          : 'flex items-center gap-2 rounded-ctl border border-border bg-bg-2 px-2.5 py-1'
      }`}
    >
      {altar ? (
        <>
          <div className="flex items-center gap-2">
            {handle}
            {chip}
            {where}
            <span className="rounded-full border border-accent/45 bg-bg-1 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-accent">
              In progress
            </span>
            <span className="ml-auto flex items-center gap-2">
              {done}
              {unpin}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            {text}
            {note}
          </div>
        </>
      ) : (
        <>
          {handle}
          {chip}
          {where}
          {text}
          {note}
          {done}
          {unpin}
        </>
      )}
    </Reorder.Item>
  );
}
