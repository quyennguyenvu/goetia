import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { admittedCredentials, type UnlockResult } from '../../../shared/lock';
import { useShell } from '../store';
import FingerprintIcon from './FingerprintIcon';
import Portal from './Portal';

/** Goetia is locked. z-50 puts this above every other shell surface —
 *  PurgeConfirm at z-40 included — and `locked` is in anyOverlayOpen, so main
 *  has already hidden the service views that would otherwise cover it.
 *
 *  Where both doors are open the screen asks which one, rather than drawing
 *  the passcode field, the Unlock button and a Touch ID link at once and then
 *  raising the system sheet on top of all three. One choice, then one door.
 *  With Touch ID off or absent there is nothing to choose, so the passcode
 *  field is the screen. */
export default function LockScreen() {
  const locked = useShell((s) => s.state?.locked ?? false);
  const touchIdSetting = useShell((s) => s.state?.settings.appLock.touchId ?? false);
  const sensorAvailable = useShell((s) => s.state?.touchIdAvailable ?? false);
  const [typing, setTyping] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const field = useRef<HTMLInputElement>(null);

  const admitted = admittedCredentials({ touchIdSetting, sensorAvailable });
  const waitMs = Math.max(0, waitUntil - now);
  // with one door there is nothing to choose: go straight to it
  const choosing = admitted.touchId && !typing;

  const apply = useCallback((result: UnlockResult) => {
    if (result.ok) {
      setPasscode('');
      setMessage('');
      return;
    }
    if (result.waitMs > 0) {
      setWaitUntil(Date.now() + result.waitMs);
      return;
    }
    if (result.reason === 'wrong') {
      setPasscode('');
      setMessage('That is not the passcode.');
    } else if (result.reason === 'unreadable') {
      setMessage(
        'Goetia cannot read its stored passcode on this device. Use Touch ID, or remove lock.json from the Goetia profile folder to turn the lock off.',
      );
    } else if (result.reason === 'cancelled') {
      setMessage('');
    }
  }, []);

  const tryTouchId = useCallback(async () => {
    setBusy(true);
    apply(await window.goetia.invoke('lock:unlock', { method: 'touchId' }));
    setBusy(false);
  }, [apply]);

  // a fresh lock starts at the chooser, whatever the last one ended on
  useEffect(() => {
    if (locked) return;
    setTyping(false);
    setMessage('');
  }, [locked]);

  useEffect(() => {
    if (locked && !choosing) field.current?.focus();
  }, [locked, choosing]);

  // ticks only while a backoff is running
  useEffect(() => {
    if (waitMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [waitMs]);

  if (!locked) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || waitMs > 0 || passcode === '') return;
    setBusy(true);
    apply(await window.goetia.invoke('lock:unlock', { method: 'passcode', passcode }));
    setBusy(false);
  };

  const choice =
    'flex w-full items-center justify-center gap-2 rounded-ctl border border-border bg-bg-1 px-3 py-2.5 text-text-1 transition-colors duration-120 hover:border-accent disabled:opacity-50';

  return (
    <div
      data-testid="lock-screen"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg-0 text-text-1"
    >
      <Portal className="h-16 w-16" />
      <h1 className="text-[13px] font-medium">Goetia is locked</h1>

      {choosing ? (
        <div className="flex w-[280px] flex-col gap-2">
          <button
            type="button"
            data-testid="lock-touchid"
            disabled={busy}
            onClick={() => void tryTouchId()}
            className={choice}
          >
            <FingerprintIcon />
            Use Touch ID
          </button>
          <button
            type="button"
            data-testid="lock-choose-passcode"
            onClick={() => setTyping(true)}
            className={choice}
          >
            Enter passcode
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex w-[280px] flex-col gap-2">
          <input
            ref={field}
            type="password"
            value={passcode}
            data-testid="lock-passcode"
            aria-label="Passcode"
            autoComplete="off"
            disabled={busy || waitMs > 0}
            onChange={(e) => setPasscode(e.target.value)}
            className="rounded-ctl border border-border bg-bg-1 px-3 py-2 text-center text-text-1 outline-none transition-colors duration-120 focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            data-testid="lock-submit"
            disabled={busy || waitMs > 0 || passcode === ''}
            className="rounded-ctl border border-border bg-bg-2 px-3 py-2 text-text-1 transition-colors duration-120 hover:border-accent disabled:opacity-50"
          >
            Unlock
          </button>
          {admitted.touchId && (
            <button
              type="button"
              data-testid="lock-back"
              onClick={() => {
                setTyping(false);
                setPasscode('');
              }}
              className="rounded-ctl px-3 py-1.5 text-[11px] text-text-2 transition-colors duration-120 hover:text-text-1"
            >
              Use Touch ID instead
            </button>
          )}
        </form>
      )}

      <p
        role="status"
        data-testid="lock-message"
        className="h-8 max-w-[320px] text-center text-[11px] text-text-2"
      >
        {waitMs > 0 ? `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.` : message}
      </p>
    </div>
  );
}
