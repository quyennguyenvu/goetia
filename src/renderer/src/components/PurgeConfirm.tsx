import { useEffect, useState } from 'react';
import { purgeAllCopy, purgeLoginCopy } from '../../../shared/purge-copy';
import { type PurgeRequest, useShell } from '../store';
import { purgeToastMessage } from './toast-rules';

/** Confirm gate for both purges. In-app rather than a native dialog for one
 *  reason: `showMessageBox` only reports `checkboxChecked` alongside the
 *  button press, so it can never disable the confirm until the sweep is
 *  acknowledged. Layered at z-40 — above Settings (z-20), the switcher
 *  (z-10) and the rail prompt (z-30) — since it opens from inside them. */
export default function PurgeConfirm() {
  const request = useShell((s) => s.purgeConfirm);
  const [acked, setAcked] = useState(false);

  // a fresh request always starts unacknowledged, however the last one ended
  // biome-ignore lint/correctness/useExhaustiveDependencies: request is the trigger, not a read
  useEffect(() => {
    setAcked(false);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // capture + stopPropagation: Settings and Welcome both close themselves
      // on Escape, and neither may fire underneath this
      e.stopPropagation();
      useShell.getState().setPurgeConfirm(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request]);

  if (!request) return null;

  const copy = request.kind === 'all' ? purgeAllCopy(request.count) : purgeLoginCopy(request.name);
  const gated = copy.checkboxLabel !== undefined;
  const ready = !gated || acked;
  const close = () => useShell.getState().setPurgeConfirm(null);

  const confirm = async (req: PurgeRequest) => {
    close();
    if (req.kind === 'one') {
      window.goetia.send('service:purgeLogin', { serviceId: req.id });
      return;
    }
    const { purged } = await window.goetia.invoke('services:purgeAll');
    useShell.getState().setPurgeToast(purgeToastMessage(purged));
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, mirrored on Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on window above
    <div
      data-testid="purge-confirm"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={close}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dismissal keys live on window above */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="w-[380px] rounded-lg border border-border bg-bg-1 p-4
          shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-text-1">{copy.title}</h2>
        <p className="mt-1.5 text-text-2">{copy.detail}</p>
        {copy.checkboxLabel && (
          <label className="mt-3.5 flex items-center gap-2 text-text-1">
            <input
              type="checkbox"
              data-testid="purge-ack"
              checked={acked}
              onChange={(e) => setAcked(e.target.checked)}
            />
            {copy.checkboxLabel}
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="purge-cancel"
            onClick={close}
            className="rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="purge-confirm-btn"
            disabled={!ready}
            onClick={() => void confirm(request)}
            className="rounded-ctl px-4 py-2 font-semibold transition-opacity duration-120
              enabled:bg-danger enabled:text-white enabled:hover:opacity-90
              disabled:cursor-not-allowed disabled:bg-bg-2 disabled:text-text-2
              disabled:opacity-60"
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
