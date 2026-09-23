import type React from 'react';
import { useState } from 'react';
import { type LockConfigure, PASSCODE_MIN_LENGTH } from '../../../shared/lock';
import { useShell } from '../store';

const errorText = (error?: string): string => {
  if (error === 'wrong') return 'That is not your passcode.';
  if (error === 'too-short') return `Use at least ${PASSCODE_MIN_LENGTH} characters.`;
  return 'That did not work.';
};

/** Settings → Lock.
 *
 *  Nothing here is reachable until the passcode has actually been checked:
 *  the pane asks, main verifies, and only then do the controls exist. An
 *  earlier cut greyed them until the field held *any* text, which meant a
 *  wrong passcode was reported by a rejected write — after the click, next to
 *  nothing, with a checkbox left showing the change it had not made.
 *
 *  Touch ID unlocks the app but never authorizes a change here: it opens
 *  Goetia for any finger enrolled on the machine, so it must not be able to
 *  weaken or remove the lock itself.
 *
 *  The unlock lives in component state, so leaving the pane — closing Settings
 *  or switching section, both of which unmount this — re-locks it. That is
 *  load-bearing, not incidental: do not hoist this into the store. */
export default function LockPane() {
  const enabled = useShell((s) => s.state?.settings.appLock.enabled ?? false);
  const useTouchId = useShell((s) => s.state?.settings.appLock.touchId ?? true);
  const guardActions = useShell((s) => s.state?.settings.appLock.guardActions ?? true);
  const configured = useShell((s) => s.state?.lockConfigured ?? false);
  const sensor = useShell((s) => s.state?.touchIdAvailable ?? false);

  /** the passcode main has accepted, held to authorize each change; null = locked */
  const [verified, setVerified] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const box =
    'w-[180px] rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 outline-none transition-colors duration-120 focus:border-accent disabled:opacity-50';
  const btn =
    'rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent disabled:opacity-50';

  const relock = () => {
    setVerified(null);
    setEntry('');
    setNext('');
    setError('');
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || entry === '') return;
    setBusy(true);
    const result = await window.goetia.invoke('lock:configure', {
      action: 'verify',
      current: entry,
    });
    setBusy(false);
    if (!result.ok) {
      setEntry('');
      setError(errorText(result.error));
      return;
    }
    setVerified(entry);
    setEntry('');
    setError('');
    setStatus('');
  };

  /** Every change re-sends the verified passcode. A rejection here means it is
   *  no longer current (changed in another window), so the pane drops back to
   *  the gate rather than leaving controls live against a stale credential. */
  const change = async (req: LockConfigure, done: string) => {
    setBusy(true);
    const result = await window.goetia.invoke('lock:configure', req);
    setBusy(false);
    if (!result.ok) {
      setStatus('');
      setError(errorText(result.error));
      if (result.error === 'wrong') relock();
      return;
    }
    setStatus(done);
    setError('');
    setNext('');
    if (req.action === 'change') setVerified(req.next);
    if (req.action === 'disable') relock();
  };

  return (
    <div>
      <p className="pt-3 pb-1 text-[11px] text-text-2">
        Locks the whole app, at launch and whenever you choose. It keeps someone at your keyboard
        out of your chats; it is not encryption, and it does not protect the files on this computer.
      </p>

      {!configured ? (
        <div
          className="flex items-center justify-between gap-4 border-b border-border py-2"
          data-testid="lock-setup"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-text-1">Require Touch ID or a passcode to unlock Goetia</span>
            <span className="text-[11px] text-text-2">
              Set a passcode of at least {PASSCODE_MIN_LENGTH} characters. It is the door that
              always works — Touch ID cannot prompt with the lid shut.
            </span>
          </span>
          <span className="flex flex-none items-center gap-2">
            <input
              type="password"
              value={next}
              data-testid="lock-new-passcode"
              aria-label="New passcode"
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setNext(e.target.value)}
              className={box}
            />
            <button
              type="button"
              data-testid="lock-enable"
              disabled={busy || next === ''}
              onClick={() => change({ action: 'enable', passcode: next }, 'Lock on.')}
              className={btn}
            >
              Turn on
            </button>
          </span>
        </div>
      ) : verified === null ? (
        <form
          onSubmit={unlock}
          className="flex flex-col gap-2 rounded-ctl border border-border bg-bg-2 px-3 py-2.5"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-text-1">Enter your passcode to change these settings</span>
            <span className="text-[11px] text-text-2">
              {enabled
                ? 'The lock is on. Goetia asks at launch, and whenever you lock it.'
                : 'The lock is off, but your passcode is still stored on this device.'}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <input
              type="password"
              value={entry}
              data-testid="lock-current-passcode"
              aria-label="Your passcode"
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setEntry(e.target.value)}
              className={box}
            />
            <button
              type="submit"
              data-testid="lock-unlock"
              disabled={busy || entry === ''}
              className={btn}
            >
              Unlock
            </button>
          </span>
          {error && (
            <p role="alert" data-testid="lock-error" className="text-[11px] text-danger">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div
            className="flex items-center justify-between gap-4 rounded-ctl border border-border bg-bg-2 px-3 py-2"
            data-testid="lock-unlocked"
          >
            <span className="text-text-1">Settings unlocked</span>
            <button type="button" data-testid="lock-relock" onClick={relock} className={btn}>
              Lock again
            </button>
          </div>

          {sensor && (
            <div
              className="flex items-center justify-between gap-4 border-b border-border py-2"
              data-testid="lock-touchid-row"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-text-1">Use Touch ID</span>
                <span className="text-[11px] text-text-2">
                  Touch ID opens Goetia for any finger enrolled on this Mac. Turn it off if anyone
                  else's is — then only your passcode works.
                </span>
              </span>
              <input
                type="checkbox"
                checked={useTouchId}
                data-testid="lock-touchid-toggle"
                disabled={busy}
                onChange={(e) =>
                  change(
                    { action: 'setTouchId', current: verified, touchId: e.target.checked },
                    e.target.checked ? 'Touch ID on.' : 'Touch ID off.',
                  )
                }
              />
            </div>
          )}

          <div
            className="flex items-center justify-between gap-4 border-b border-border py-2"
            data-testid="lock-guard-row"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-text-1">
                Ask before summoning a service, purging a login or removing download history
              </span>
              <span className="text-[11px] text-text-2">
                A banished service keeps its login, so summoning one back reveals its conversations
                — a purge cannot be undone, and removing download history erases the record of what
                was downloaded. This asks even while Goetia is unlocked. It does not guard services
                already on your rail.
              </span>
            </span>
            <input
              type="checkbox"
              checked={guardActions}
              data-testid="lock-guard-toggle"
              disabled={busy}
              onChange={(e) =>
                change(
                  { action: 'setGuardActions', current: verified, guardActions: e.target.checked },
                  e.target.checked ? 'Asking before those actions.' : 'No longer asking.',
                )
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-b border-border py-2">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-text-1">Change passcode</span>
              <span className="text-[11px] text-text-2">
                At least {PASSCODE_MIN_LENGTH} characters.
              </span>
            </span>
            <span className="flex flex-none items-center gap-2">
              <input
                type="password"
                value={next}
                data-testid="lock-change-passcode"
                aria-label="New passcode"
                autoComplete="off"
                disabled={busy}
                onChange={(e) => setNext(e.target.value)}
                className={box}
              />
              <button
                type="button"
                data-testid="lock-change"
                disabled={busy || next === ''}
                onClick={() =>
                  change({ action: 'change', current: verified, next }, 'Passcode changed.')
                }
                className={btn}
              >
                Change
              </button>
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 py-2">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-text-1">Turn the lock off</span>
              <span className="text-[11px] text-text-2">
                Forgets the passcode on this device. Goetia stops asking.
              </span>
            </span>
            <button
              type="button"
              data-testid="lock-disable"
              disabled={busy}
              onClick={() => change({ action: 'disable', current: verified }, 'Lock off.')}
              className={btn}
            >
              Turn off
            </button>
          </div>

          {error && (
            <p role="alert" data-testid="lock-error" className="pt-1 text-[11px] text-danger">
              {error}
            </p>
          )}
        </>
      )}

      {!sensor && (
        <p className="pt-2 text-[11px] text-text-2">
          Touch ID is not available on this computer, so the passcode is the only way in.
        </p>
      )}
      <p role="status" data-testid="lock-status" className="h-5 pt-1 text-[11px] text-text-2">
        {status}
      </p>
    </div>
  );
}
