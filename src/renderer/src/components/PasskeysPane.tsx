import { useCallback, useEffect, useState } from 'react';
import type { PasskeyView } from '../../../shared/types';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

const dateOf = (t: number) => (t > 0 ? new Date(t).toLocaleDateString() : '—');

/** Settings → Passkeys: Goetia's own credentials, one row each. Forget has
 *  no confirm — a self-dismissing Undo row, the pin pattern. The list is
 *  fetched when the pane opens and returned by every mutation, never
 *  broadcast in ShellState. */
export default function PasskeysPane() {
  // no `?? []` fallback: a fresh array per render would defeat the store's Object.is check
  const services = useShell((s) => s.state?.services);
  const [list, setList] = useState<PasskeyView[] | null>(null);
  const [undo, setUndo] = useState<{ id: string; rpId: string } | null>(null);

  const load = useCallback(() => {
    window.goetia.invoke('passkeys:list').then(setList);
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const forget = async (p: PasskeyView) => {
    setList(await window.goetia.invoke('passkeys:forget', { id: p.id }));
    setUndo({ id: p.id, rpId: p.rpId });
  };
  const restore = async () => {
    if (!undo) return;
    setList(await window.goetia.invoke('passkeys:restore', { id: undo.id }));
    setUndo(null);
  };

  if (list === null) return null;
  if (list.length === 0 && !undo) {
    return (
      <p className="pt-3 text-[11px] text-text-2" data-testid="passkeys-empty">
        No passkeys yet. Sign in to a service with your password — when it offers to create a
        passkey, accept it and Goetia keeps it here.
      </p>
    );
  }
  return (
    <div>
      <p className="pt-3 pb-1 text-[11px] text-text-2">
        Passkeys Goetia made on this device. Forgetting one here leaves a dead entry on the site's
        own security page — remove it there too. A site with more than four accounts offers the four
        most recently used.
      </p>
      {list.map((p) => {
        const svc = services?.find((s) => s.id === p.createdIn);
        return (
          <div
            key={p.id}
            data-testid={`passkey-${p.rpId}`}
            className="flex items-center justify-between gap-4 border-b border-border py-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-text-1">
                {p.rpId} <span className="text-text-2">· {p.account}</span>
              </span>
              <span className="text-[11px] text-text-2">
                {svc ? `via ${svc.name} · ` : ''}created {dateOf(p.createdAt)} · last used{' '}
                {dateOf(p.lastUsedAt)}
              </span>
            </span>
            <button
              type="button"
              data-testid={`forget-${p.rpId}`}
              onClick={() => forget(p)}
              className="rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
            >
              Forget
            </button>
          </div>
        );
      })}
      {undo && (
        <div
          role="status"
          data-testid="passkey-undo"
          className="mt-3 flex items-center justify-between gap-4 rounded-ctl bg-bg-2 px-3 py-2"
        >
          <span className="text-text-1">Forgot the passkey for {undo.rpId}.</span>
          <button
            type="button"
            onClick={restore}
            className="font-semibold text-accent transition-colors duration-120 hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
