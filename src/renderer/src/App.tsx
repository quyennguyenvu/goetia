import { useEffect } from 'react';
import { aggregateBadges, badgeLabel } from '../../shared/badges';
import ContentPlaceholder from './components/ContentPlaceholder';
import { renderOverlayDataUrl } from './components/overlay-badge';
import QuickSwitcher from './components/QuickSwitcher';
import Rail from './components/Rail';
import SettingsView from './components/SettingsView';
import UpdateToast from './components/UpdateToast';
import Welcome from './components/Welcome';
import { connectShell, useShell } from './store';

export default function App() {
  const state = useShell((s) => s.state);

  useEffect(() => connectShell(), []);

  // Windows taskbar overlay: drawn here (main has no canvas), applied in main.
  useEffect(() => {
    if (!state) return;
    const { total } = aggregateBadges(
      state.services.map((svc) => ({
        ...state.runtime[svc.id].unread,
        muted: state.muted[svc.id],
      })),
      state.globalMuted,
    );
    window.goetia.send('badge:overlay', {
      dataUrl: total > 0 ? renderOverlayDataUrl(badgeLabel(total)) : null,
      count: total,
    });
  }, [state]);

  const pos = state?.settings.railPosition ?? 'top';
  const allDisabled = state
    ? state.services.every((svc) => state.settings.disabled[svc.id])
    : false;
  const showWelcome = (state?.homeOpen ?? false) || allDisabled;

  return (
    <div
      className={`relative flex h-full bg-bg-0 text-text-1 ${pos === 'top' ? 'flex-col' : 'flex-row'}`}
    >
      {pos !== 'right' && <Rail />}
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {showWelcome ? <Welcome /> : <ContentPlaceholder />}
        <UpdateToast />
      </div>
      {pos === 'right' && <Rail />}
      <SettingsView />
      <QuickSwitcher />
    </div>
  );
}
