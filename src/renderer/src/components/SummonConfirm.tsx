import { useEffect } from 'react';
import CredentialConfirm from './CredentialConfirm';

interface Props {
  /** the services this commit would bring back, named for the dialog */
  names: string[];
  onVerified(): void;
  onCancel(): void;
}

/** Summoning is the direction that exposes: a banished service keeps its
 *  login, so bringing one back reveals conversations the user took off the
 *  rail. Banishing and reordering are unguarded and never open this. */
export default function SummonConfirm({ names, onVerified, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // capture + stopPropagation: Welcome closes itself on Escape and must
      // not fire underneath this, the PurgeConfirm pattern
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const title = names.length === 1 ? `Summon ${names[0]}?` : `Summon ${names.length} services?`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, mirrored on Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on window above
    <div
      data-testid="summon-confirm"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dismissal keys live on window above */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-[380px] rounded-lg border border-border bg-bg-1 p-4
          shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-text-1">{title}</h2>
        <p className="mt-1.5 text-text-2">
          {names.join(', ')} {names.length === 1 ? 'is' : 'are'} banished. Bringing{' '}
          {names.length === 1 ? 'it' : 'them'} back puts the conversations on your rail again.
        </p>
        {/* verifying IS the confirmation — a second button would only be a
            place to forget to disable */}
        <CredentialConfirm autoFocus action={{ kind: 'summon' }} onVerified={onVerified} />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            data-testid="summon-cancel"
            onClick={onCancel}
            className="rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
