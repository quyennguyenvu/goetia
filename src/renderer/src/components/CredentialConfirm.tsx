import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { admittedCredentials, type GuardedAction, type UnlockResult } from '../../../shared/lock';
import { useShell } from '../store';
import FingerprintIcon from './FingerprintIcon';

interface Props {
  action: GuardedAction;
  onVerified(): void;
  autoFocus?: boolean;
}

/** One implementation of "prove it's you", shared by the purge confirm and
 *  Home's summon confirm, so both read identically. It asks and reports; it
 *  decides nothing — main is what refuses the action.
 *
 *  Touch ID is offered here, unlike in Settings → Lock: these authorize
 *  ordinary work rather than weakening the lock itself. */
export default function CredentialConfirm({ action, onVerified, autoFocus }: Props) {
  const touchIdSetting = useShell((s) => s.state?.settings.appLock.touchId ?? false);
  const sensorAvailable = useShell((s) => s.state?.touchIdAvailable ?? false);
  const [passcode, setPasscode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const field = useRef<HTMLInputElement>(null);

  const admitted = admittedCredentials({ touchIdSetting, sensorAvailable });
  const waitMs = Math.max(0, waitUntil - now);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  // ticks only while a backoff is running
  useEffect(() => {
    if (waitMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [waitMs]);

  const apply = useCallback(
    (result: UnlockResult) => {
      if (result.ok) {
        setPasscode('');
        setMessage('');
        onVerified();
        return;
      }
      if (result.waitMs > 0) {
        setWaitUntil(Date.now() + result.waitMs);
        return;
      }
      if (result.reason === 'wrong') {
        setPasscode('');
        setMessage('That is not your passcode.');
      } else if (result.reason === 'unreadable') {
        setMessage('Goetia cannot read its stored passcode on this device.');
      } else if (result.reason === 'cancelled') {
        setMessage('');
      }
    },
    [onVerified],
  );

  const confirm = async (
    credential: { method: 'touchId' } | { method: 'passcode'; passcode: string },
  ) => {
    setBusy(true);
    apply(await window.goetia.invoke('lock:confirm', { action, credential }));
    setBusy(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || waitMs > 0 || passcode === '') return;
    void confirm({ method: 'passcode', passcode });
  };

  return (
    <form onSubmit={submit} data-testid="credential-confirm" className="mt-3.5">
      <div className="flex items-center gap-2">
        <input
          ref={field}
          type="password"
          value={passcode}
          data-testid="credential-passcode"
          aria-label="Your passcode"
          placeholder="Your passcode"
          autoComplete="off"
          disabled={busy || waitMs > 0}
          onChange={(e) => setPasscode(e.target.value)}
          className="min-w-0 flex-1 rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1
            outline-none transition-colors duration-120 focus:border-accent disabled:opacity-50"
        />
        {admitted.touchId && (
          <button
            type="button"
            data-testid="credential-touchid"
            aria-label="Use Touch ID"
            title="Use Touch ID"
            disabled={busy}
            onClick={() => void confirm({ method: 'touchId' })}
            className="flex flex-none items-center justify-center rounded-ctl border border-border
              bg-bg-2 px-2.5 py-1.5 text-text-1 transition-colors duration-120 hover:border-accent
              disabled:opacity-50"
          >
            <FingerprintIcon />
          </button>
        )}
      </div>
      <p role="alert" data-testid="credential-message" className="h-4 pt-1 text-[11px] text-danger">
        {waitMs > 0 ? `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.` : message}
      </p>
    </form>
  );
}
