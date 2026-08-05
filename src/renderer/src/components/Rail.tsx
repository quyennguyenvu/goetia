import type { ServiceId } from '../../../shared/types';
import { useShell } from '../store';
import ServiceTile from './ServiceTile';

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
  if (!state) return null;
  const pos = state.settings.railPosition;
  const horizontal = pos === 'top';
  const visible = state.services.filter((svc) => !state.settings.disabled[svc.id]);

  const reorder = (fromId: string, toId: string) => {
    const ids = state.services.map((s) => s.id);
    const from = ids.indexOf(fromId as ServiceId);
    const to = ids.indexOf(toId as ServiceId);
    ids.splice(to, 0, ...ids.splice(from, 1));
    window.goetia.send('service:reorder', { orderedIds: ids });
  };

  return (
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
      {visible.map((svc) => (
        <ServiceTile
          key={svc.id}
          service={svc}
          runtime={state.runtime[svc.id]}
          muted={state.muted[svc.id]}
          active={state.activeId === svc.id}
          onActivate={() => window.goetia.send('service:activate', { serviceId: svc.id })}
          onContextMenu={(e) => {
            e.preventDefault();
            window.goetia.send('service:setMuted', {
              serviceId: svc.id,
              muted: !state.muted[svc.id],
            });
          }}
          onReorder={reorder}
        />
      ))}
      <div
        className={
          horizontal
            ? 'ml-auto flex flex-row items-center gap-1'
            : 'mt-auto flex flex-col items-center gap-1'
        }
      >
        <button
          type="button"
          title={state.globalMuted ? 'Unmute all notifications' : 'Mute all notifications'}
          onClick={() => window.goetia.send('global:setMuted', { muted: !state.globalMuted })}
          className={`flex h-7 w-7 items-center justify-center rounded-ctl transition-colors duration-120 ${
            state.globalMuted
              ? 'bg-badge/15 text-badge hover:bg-badge/25'
              : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
          }`}
        >
          <BellIcon muted={state.globalMuted} />
        </button>
        <button
          type="button"
          title="Settings (⌘,)"
          data-testid="settings-btn"
          onClick={() => window.goetia.send('settings:setOpen', { open: !state.settingsOpen })}
          className={`group flex h-7 w-7 items-center justify-center rounded-ctl transition-colors duration-120 ${
            state.settingsOpen
              ? 'bg-bg-2 text-accent'
              : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
          }`}
        >
          <span className="transition-transform duration-120 group-hover:rotate-45">
            <GearIcon />
          </span>
        </button>
      </div>
    </nav>
  );
}
