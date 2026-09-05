import { wakeCaption } from '../../../shared/wake-caption';
import { useShell } from '../store';

/** The shell's content area, seen only while the active view is hidden
 *  behind ⌘K or Settings. Keyed on `waking`, never `loading`: loading is
 *  did-start-loading, which a live page fires for any subframe fetch, and
 *  it made a rendered Discord read "Waking Discord…" behind the switcher
 *  (2026-09-05). */
export default function ContentPlaceholder() {
  const state = useShell((s) => s.state);
  if (!state) return null;
  const active = state.services.find((s) => s.id === state.activeId);
  if (!active) return null;
  const rt = state.runtime[active.id];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-bg-0 text-text-2">
      {rt.crashed ? (
        <>
          <span>{active.name} stopped responding or failed to load.</span>
          <button
            type="button"
            onClick={() => window.goetia.send('service:reload', { serviceId: active.id })}
            className="rounded-ctl bg-accent px-4 py-1.5 text-on-accent transition-colors duration-120 hover:opacity-90"
          >
            Retry
          </button>
        </>
      ) : rt.waking ? (
        <span>{wakeCaption(rt.wakeKind, active.name)}</span>
      ) : null}
    </div>
  );
}
