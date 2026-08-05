import { useShell } from '../store';

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
      ) : rt.loading ? (
        <span>Waking {active.name}…</span>
      ) : null}
    </div>
  );
}
