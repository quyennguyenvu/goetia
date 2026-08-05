import type { ServiceId } from '../../../shared/types';
import { useShell } from '../store';
import ServiceTile from './ServiceTile';

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
          ? 'flex h-14 w-full flex-row items-center gap-2 border-b border-border bg-bg-1 px-3'
          : `flex h-full w-[68px] flex-col items-center gap-2 bg-bg-1 py-3 ${
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
          active={state.activeId === svc.id && !state.settingsOpen}
          orientation={horizontal ? 'horizontal' : 'vertical'}
          onActivate={() => {
            window.goetia.send('settings:setOpen', { open: false });
            window.goetia.send('service:activate', { serviceId: svc.id });
          }}
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
            ? 'ml-auto flex flex-row items-center gap-2'
            : 'mt-auto flex flex-col items-center gap-2'
        }
      >
        <button
          type="button"
          title={state.globalMuted ? 'Unmute all notifications' : 'Mute all notifications'}
          onClick={() => window.goetia.send('global:setMuted', { muted: !state.globalMuted })}
          className={`flex h-9 w-9 items-center justify-center rounded-ctl text-base transition-colors duration-120 hover:bg-bg-2 ${state.globalMuted ? 'text-badge' : 'text-text-2'}`}
        >
          {state.globalMuted ? '🔕' : '🔔'}
        </button>
        <button
          type="button"
          title="Settings"
          data-testid="settings-btn"
          onClick={() => window.goetia.send('settings:setOpen', { open: !state.settingsOpen })}
          className="flex h-9 w-9 items-center justify-center rounded-ctl text-base text-text-2 transition-colors duration-120 hover:bg-bg-2"
        >
          ⚙︎
        </button>
      </div>
    </nav>
  );
}
