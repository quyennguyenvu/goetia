import { useEffect } from 'react';

interface Props {
  onConfirm(): void;
  onCancel(): void;
}

/** Confirm gate for a rail drop while the Home board holds an unapplied
 *  edit: committing would silently invalidate the order the user is
 *  previewing, so the choice is theirs. Escape and the backdrop both keep
 *  the edit. */
export default function RailReorderPrompt({ onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // capture + stopPropagation: Welcome's own Escape handler (leave Home)
      // must never fire underneath the prompt
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, mirrored on Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on window above
    <div
      data-testid="rail-reorder-prompt"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dismissal keys live on window above */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reorder the rail?"
        className="w-[340px] rounded-lg border border-border bg-bg-1 p-4
          shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-text-1">Reorder the rail?</h2>
        <p className="mt-1.5 text-text-2">
          The Home board has unapplied changes. Reordering the rail now discards them.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A]
              to-[#F04E3E] px-4 py-2.5 font-semibold text-[#15181F]
              shadow-[0_0_12px_rgba(255,158,44,0.35)] transition-opacity duration-150
              hover:opacity-90"
          >
            Discard changes &amp; reorder
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
