import { useEffect, useRef } from 'react';
import { aggregateBadges, badgeLabel } from '../../shared/badges';
import CapTrimToast from './components/CapTrimToast';
import ContentPlaceholder from './components/ContentPlaceholder';
import { overlayNeedsUpdate, renderOverlayDataUrl } from './components/overlay-badge';
import QuickSwitcher from './components/QuickSwitcher';
import Rail from './components/Rail';
import SettingsView from './components/SettingsView';
import UpdateToast from './components/UpdateToast';
import Welcome from './components/Welcome';
import { connectShell, useShell } from './store';

export default function App() {
  const state = useShell((s) => s.state);
  const sentOverlay = useRef<number | null>(null);

  useEffect(() => connectShell(), []);

  // Windows taskbar overlay: drawn here (main has no canvas), applied in main.
  // Redrawn only when the count moves — the effect sees a fresh snapshot object
  // on every broadcast, and the canvas + PNG encode is not free.
  useEffect(() => {
    if (!state) return;
    const { total } = aggregateBadges(state.services.map((svc) => state.runtime[svc.id].unread));
    const platform = window.goetia.platform;
    if (!overlayNeedsUpdate({ platform, total, lastSent: sentOverlay.current })) return;
    sentOverlay.current = total;
    window.goetia.send('badge:overlay', {
      dataUrl: total > 0 ? renderOverlayDataUrl(badgeLabel(total)) : null,
      count: total,
    });
  }, [state]);

  // Re-assert after the window comes back: memoizing the overlay above gave up
  // the incidental self-healing that redrawing on every broadcast provided.
  useEffect(() => {
    const invalidate = () => {
      if (document.visibilityState === 'visible') sentOverlay.current = null;
    };
    document.addEventListener('visibilitychange', invalidate);
    return () => document.removeEventListener('visibilitychange', invalidate);
  }, []);

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
        <CapTrimToast />
      </div>
      {pos === 'right' && <Rail />}
      <SettingsView />
      <QuickSwitcher />
    </div>
  );
}
