import { Reorder } from 'motion/react';
import { useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import { useShell } from '../store';
import Portal from './Portal';
import RailReorderPrompt from './RailReorderPrompt';
import ServiceTile from './ServiceTile';
import { updatePending } from './update-rules';
import { useTileReorder } from './useTileReorder';

function BellIcon({ muted }: { muted: boolean }) {
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
      <path d="M18 13.5V11a6 6 0 1 0-12 0v2.5c0 1.2-.7 2.2-1.6 3-.4.4-.1 1 .4 1h14.4c.5 0 .8-.6.4-1-.9-.8-1.6-1.8-1.6-3Z" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
      {muted && <line x1="4" y1="3.5" x2="20" y2="20.5" />}
    </svg>
  );
}

function GearIcon() {
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
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19 12c0-.4 0-.8-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4.4L9.3 5.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.2 7.2 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.5 2.7h4.4l.5-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

export default function Rail() {
  const state = useShell((s) => s.state);
  // the hook must run before the early return, so its inputs are guarded
  // rather than the call site
  const visible = state ? state.services.filter((svc) => !state.settings.disabled[svc.id]) : [];
  // a drop over a dirty Home board is deferred behind the prompt; the
  // drafted order parks here until the user picks a side
  const [pending, setPending] = useState<ServiceId[] | null>(null);
  const reorder = useTileReorder(
    visible.map((svc) => svc.id),
    state ? state.services.map((svc) => svc.id) : [],
    (orderedIds) => {
      if (!useShell.getState().homeDirty) return false;
      setPending(orderedIds);
      return true;
    },
  );
  if (!state) return null;
  const pos = state.settings.railPosition;
  const horizontal = pos === 'top';
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const updateReady = updatePending(state.update);
  const silenced = state.globalMuted || state.quietActive;

  const confirmPending = () => {
    if (!pending) return;
    // clean the board first, so its follow-live sync adopts the new order
    useShell.getState().discardHomeDraft();
    window.goetia.send('service:reorder', { orderedIds: pending });
    setPending(null);
  };
  const cancelPending = () => {
    reorder.cancelDraft();
    setPending(null);
    // the kept edit lives on Home; make sure that is what the user sees
    window.goetia.send('home:setOpen', { open: true });
  };

  return (
    <>
      <nav
        data-testid="rail"
        className={
          horizontal
            ? 'flex h-11 w-full flex-row items-center gap-1.5 border-b border-border bg-bg-1 px-2'
            : `flex h-full w-[56px] flex-col items-center gap-1.5 bg-bg-1 py-2 ${
                pos === 'right' ? 'border-l' : 'border-r'
              } border-border`
        }
      >
        <button
          type="button"
          data-testid="home-btn"
          aria-label="Home"
          aria-current={state.homeOpen ? 'page' : undefined}
          title="Home — all services (⌘⇧H)"
          // a destination, not a toggle: clicking Home from Home stays on Home
          onClick={() => window.goetia.send('home:setOpen', { open: true })}
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-[11px]
          transition-all duration-150 ease-out outline-none focus-visible:ring-2
          focus-visible:ring-accent ${
            state.homeOpen ? 'bg-bg-2 opacity-100' : 'opacity-60 hover:opacity-100'
          }`}
        >
          <Portal className="h-[22px] w-[22px]" />
        </button>
        <div
          aria-hidden="true"
          className={horizontal ? 'h-5 w-px flex-none bg-border' : 'h-px w-6 flex-none bg-border'}
        />
        <Reorder.Group
          as="div"
          axis={horizontal ? 'x' : 'y'}
          {...reorder.groupProps}
          // same gap and alignment the tiles have inside the nav today, so the
          // rendered result is unchanged — the box exists only so Motion has a
          // container whose children are all items
          className={
            horizontal ? 'flex flex-row items-center gap-1.5' : 'flex flex-col items-center gap-1.5'
          }
        >
          {reorder.shown.map((id) => {
            const svc = byId.get(id);
            if (!svc) return null;
            return (
              <Reorder.Item
                key={id}
                value={id}
                as="div"
                className="relative flex-none"
                // drop-shadow, not boxShadow: this wrapper is a rectangle and the
                // tile inside it is a squircle, so a box-shadow would halo the
                // wrapper's corners. drop-shadow follows the rendered alpha.
                whileDrag={{
                  scale: 1.1,
                  zIndex: 10,
                  filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))',
                }}
                {...reorder.itemProps}
              >
                <ServiceTile
                  service={svc}
                  runtime={state.runtime[svc.id]}
                  muted={state.muted[svc.id]}
                  active={!state.homeOpen && state.activeId === svc.id}
                  onActivate={() => {
                    if (reorder.consumeDrag()) return;
                    window.goetia.send('service:activate', { serviceId: svc.id });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    window.goetia.send('service:tileMenu', { serviceId: svc.id });
                  }}
                />
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        <div
          className={
            horizontal
              ? 'ml-auto flex flex-row items-center gap-1'
              : 'mt-auto flex flex-col items-center gap-1'
          }
        >
          <button
            type="button"
            title={`${
              silenced ? 'Unmute all notifications' : 'Mute all notifications'
            } (⌘/Ctrl+⇧+M) — badges stay${
              state.quietActive && !state.globalMuted
                ? ` — quiet hours until ${state.settings.quietHours.end}`
                : ''
            }`}
            onClick={() => window.goetia.send('global:setMuted', { muted: !silenced })}
            className={`flex h-7 w-7 items-center justify-center rounded-ctl transition-colors duration-120 ${
              silenced
                ? 'bg-badge/15 text-badge hover:bg-badge/25'
                : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
            }`}
          >
            <BellIcon muted={silenced} />
          </button>
          <button
            type="button"
            title={updateReady ? 'Settings — update available (⌘,)' : 'Settings (⌘,)'}
            data-testid="settings-btn"
            onClick={() => {
              if (updateReady) useShell.getState().setFocusSection('updates');
              window.goetia.send('settings:setOpen', { open: !state.settingsOpen });
            }}
            className={`group relative flex h-7 w-7 items-center justify-center rounded-ctl transition-colors duration-120 ${
              state.settingsOpen
                ? 'bg-bg-2 text-accent'
                : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
            }`}
          >
            <span className="transition-transform duration-120 group-hover:rotate-45">
              <GearIcon />
            </span>
            {updateReady && (
              <span
                data-testid="gear-dot"
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 h-[7px] w-[7px] rounded-full bg-accent ring-2 ring-bg-1"
              />
            )}
          </button>
        </div>
      </nav>
      {pending && <RailReorderPrompt onConfirm={confirmPending} onCancel={cancelPending} />}
    </>
  );
}
