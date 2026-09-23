import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { matchesDownloadQuery, normalizeDownloadQuery } from '../../../shared/download-filter';
import { extensionChip, formatBytes, formatProgress } from '../../../shared/format';
import type { GuardedAction } from '../../../shared/lock';
import type { DownloadStorage, DownloadView } from '../../../shared/types';
import { useShell } from '../store';
import CredentialConfirm from './CredentialConfirm';
import Pane from './Pane';
import { relativeTime } from './relative-time';
import { ToastDrain, useToastTimer } from './toast-timer';

/** while a row is downloading the pane re-fetches this often; never otherwise */
const POLL_MS = 1000;
const isMac = navigator.platform.startsWith('Mac');
export const REVEAL_LABEL = isMac ? 'Show in Finder' : 'Show in folder';

/** whole percent, or null while Chromium does not know the total */
export function percent(r: { received: number; total: number }): number | null {
  return r.total > 0 ? Math.min(100, Math.round((r.received / r.total) * 100)) : null;
}

/** the rows a checkbox may select: ended ones — an in-flight row has Cancel */
export function selectable(r: DownloadView): boolean {
  return r.state !== 'downloading';
}

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

const btn =
  'flex-none rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 transition-colors duration-120';
const quiet = 'transition-colors duration-120 hover:underline';

const BAND: Record<Exclude<DownloadStorage, 'sealed'>, string> = {
  unreadable:
    'Goetia cannot read its download history on this device. The file is sealed to a keychain this launch cannot open; it is kept as it is, and downloads this session are not being recorded.',
  plain: 'History is kept unencrypted on this device. The OS keychain is unavailable.',
};

function Sub({ r, service, now }: { r: DownloadView; service: string; now: number }) {
  switch (r.state) {
    case 'downloading':
      return <>{`${service} · downloading · ${formatProgress(r.received, r.total)}`}</>;
    case 'saved':
      return (
        <>{`${service} · ${relativeTime(r.at, now)} · ${formatBytes(r.received || r.total)}`}</>
      );
    case 'failed':
      return (
        <>
          <span className="text-danger">Could not save</span>
          {` · ${service} · ${relativeTime(r.at, now)}`}
        </>
      );
    case 'missing':
      return <>{`${service} · ${relativeTime(r.at, now)} · moved or deleted since`}</>;
  }
}

function Body({ r, service, now }: { r: DownloadView; service: string; now: number }) {
  const gone = r.state === 'missing';
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        className={`truncate font-medium ${
          gone ? 'text-text-2 line-through decoration-border' : 'text-text-1'
        }`}
      >
        {r.filename}
      </span>
      <span className="text-[11px] text-text-2">
        <Sub r={r} service={service} now={now} />
      </span>
      {r.state === 'downloading' && (
        <span className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-bg-2">
          <span
            className="block h-full bg-accent"
            style={{ width: `${percent(r) ?? 100}%`, opacity: percent(r) === null ? 0.4 : 1 }}
          />
        </span>
      )}
    </span>
  );
}

/** Settings → Downloads → History: every file a chat sent, across launches,
 *  in flight first, searchable by name and service. Fetched when the pane
 *  opens and polled once a second only while a row is still downloading.
 *
 *  Layout rule: nothing transient ever moves the rows. The header line's
 *  right side is the one place for list-level state — Clear all… (or Remove
 *  n shown… while the search narrows), then "n selected · Remove · Cancel",
 *  then the Undo line — swapped at one text size; the credential asked under
 *  the guard floats as a card anchored beneath it. A saved row's body is the
 *  reveal; a checkbox selects an ended row. Main enforces the guard; this
 *  only decides when to ask. No path ever reaches this process — see
 *  main/downloads.ts. `landing` names the folder for the empty state, null
 *  under Always ask. */
export default function DownloadsPane({
  landing,
  guarded,
}: {
  landing: string | null;
  guarded: boolean;
}) {
  const services = useShell((s) => s.state?.services);
  const [data, setData] = useState<{ rows: DownloadView[]; storage: DownloadStorage } | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  /** the guarded action waiting on the credential, or null */
  const [asking, setAsking] = useState<GuardedAction | null>(null);
  /** the last removal, while its Undo shows — a fresh object per removal, so a
   *  second removal of the same count restarts the clock */
  const [undo, setUndo] = useState<{ count: number } | null>(null);
  const clock = useToastTimer<HTMLSpanElement>(undo, () => setUndo(null));

  const load = useCallback(() => {
    window.goetia.invoke('downloads:recent').then(setData);
  }, []);
  useEffect(load, [load]);

  const rows = data?.rows ?? null;
  const live = rows?.some((r) => r.state === 'downloading') ?? false;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  // a row that left the list, or started downloading again, cannot stay selected
  useEffect(() => {
    if (!rows) return;
    setSelected((prev) => {
      const next = new Set(
        [...prev].filter((id) => rows.some((r) => r.id === id && selectable(r))),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  // Escape dismisses the credential card and stops there; Settings' own
  // Escape must not fire underneath it (the PurgeConfirm pattern)
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAsking(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [asking]);

  const reveal = (id: number) => {
    window.goetia.send('downloads:reveal', { id });
    load();
  };
  const cancel = (id: number) => {
    window.goetia.send('downloads:cancel', { id });
    load();
  };
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const clearSelection = () => {
    setSelected(new Set());
    setAsking(null);
  };
  // a selection made under one search must not be removed under another
  const search = (value: string) => {
    setQuery(value);
    clearSelection();
  };

  /** main is the enforcer; this sends once the credential passed, or at once
   *  with the guard off */
  const perform = (action: GuardedAction) => {
    if (action.kind === 'downloads-remove') {
      window.goetia.send('downloads:remove', { ids: action.ids });
      setUndo({ count: action.ids.length });
    } else if (action.kind === 'downloads-clear') {
      window.goetia.send('downloads:clear', {});
      setUndo({ count: rows?.filter(selectable).length ?? 0 });
    }
    clearSelection();
    load();
  };
  const request = (action: GuardedAction) => (guarded ? setAsking(action) : perform(action));
  const restore = () => {
    window.goetia.send('downloads:restore', {});
    setUndo(null);
    load();
  };

  if (data === null || rows === null) return null;
  const now = Date.now();
  const serviceName = (r: DownloadView) =>
    services?.find((s) => s.id === r.serviceId)?.name ?? r.serviceId;
  const q = normalizeDownloadQuery(query);
  const shown = rows.filter((r) => matchesDownloadQuery(r, serviceName(r), q));
  const narrows = q !== '' && shown.length !== rows.length;
  const shownEnded = shown.filter(selectable);
  const count = selected.size;
  const askingFor =
    asking?.kind === 'downloads-remove'
      ? asking.ids.length
      : asking?.kind === 'downloads-clear'
        ? rows.filter(selectable).length
        : 0;

  // the header line's right side, every state at one text size: a selection
  // replaces the line; otherwise a pending Undo and the whole-list action sit
  // side by side, so Clear all… never waits out an Undo (user decision, 2026-09-24)
  const wholeList =
    shownEnded.length > 0 &&
    (narrows ? (
      <button
        type="button"
        data-testid="downloads-remove-shown"
        onClick={() => request({ kind: 'downloads-remove', ids: shownEnded.map((r) => r.id) })}
        className={`${quiet} hover:text-danger`}
      >
        Remove {files(shownEnded.length)} shown…
      </button>
    ) : (
      <button
        type="button"
        data-testid="downloads-clear"
        onClick={() => request({ kind: 'downloads-clear' })}
        className={`${quiet} hover:text-danger`}
      >
        Clear all…
      </button>
    ));
  // the toasts' clock: the bar drains over TOAST_MS, and hovering or focusing
  // the line banks the remainder, so a hand reaching for Undo is never raced
  const undoLine = undo !== null && (
    <span
      ref={clock.surface}
      role="status"
      data-testid="downloads-undo"
      {...clock.pauseWhile}
      className="relative flex items-center gap-3"
    >
      <span>{files(undo.count)} removed from the list.</span>
      <button type="button" onClick={restore} className={`${quiet} font-semibold text-accent`}>
        Undo
      </button>
      <ToastDrain paused={clock.paused} className="-bottom-1 bg-accent" />
    </span>
  );
  let state: React.ReactNode = null;
  if (count > 0) {
    state = (
      <span data-testid="downloads-selection" className="flex items-center gap-3">
        <span className="font-semibold text-text-1">{count} selected</span>
        <button
          type="button"
          data-testid="downloads-remove"
          onClick={() => request({ kind: 'downloads-remove', ids: [...selected] })}
          className={`${quiet} text-danger`}
        >
          Remove from list
        </button>
        <button
          type="button"
          data-testid="downloads-remove-cancel"
          onClick={clearSelection}
          className={`${quiet} hover:text-text-1`}
        >
          Cancel
        </button>
      </span>
    );
  } else if (undoLine || wholeList) {
    state = (
      <>
        {undoLine}
        {undoLine && wholeList && <span aria-hidden="true" className="h-3 w-px bg-border" />}
        {wholeList}
      </>
    );
  }

  const aside = (state || asking) && (
    <span className="relative flex items-center gap-3 text-[11px] text-text-2">
      {state}
      {asking && (
        <div
          data-testid="downloads-ask"
          className="absolute top-full right-0 z-10 mt-2 w-[360px] rounded-modal border border-border bg-bg-1 p-3 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          <p className="text-[12px] text-text-1">
            Prove it's you to remove {files(askingFor)} from the list.
          </p>
          <p className="text-[11px] text-text-2">The files themselves stay where they are.</p>
          <CredentialConfirm autoFocus action={asking} onVerified={() => perform(asking)} />
          <button
            type="button"
            data-testid="downloads-ask-cancel"
            onClick={() => setAsking(null)}
            className={`${quiet} text-[11px] text-text-2`}
          >
            Cancel
          </button>
        </div>
      )}
    </span>
  );

  const title = narrows
    ? `History · ${shown.length} of ${files(rows.length)}`
    : `History · ${files(rows.length)}`;

  return (
    <Pane title={title} aside={aside || undefined}>
      {data.storage !== 'sealed' && (
        <p
          data-testid="downloads-band"
          className="my-2 rounded-ctl border border-border bg-bg-2 px-3 py-2 text-[11px] text-text-2"
        >
          {BAND[data.storage]}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="py-3 text-[11px] text-text-2" data-testid="downloads-empty">
          Nothing downloaded yet.
          {landing !== null && ` Files a chat sends land in ${landing}.`}
        </p>
      ) : (
        <>
          <div className="border-b border-border py-2">
            <input
              type="search"
              value={query}
              placeholder="Search files…"
              aria-label="Search files"
              data-testid="downloads-search"
              onChange={(e) => search(e.target.value)}
              onKeyDown={(e) => {
                // Escape with text clears the field and stops there; empty, it
                // reaches the Settings handler and closes Settings as anywhere else
                if (e.key === 'Escape' && query !== '') {
                  e.stopPropagation();
                  search('');
                }
              }}
              className="w-full rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 outline-none transition-colors duration-120 placeholder:text-text-2 focus:border-accent"
            />
          </div>
          {shown.length === 0 ? (
            <p className="py-3 text-[11px] text-text-2" data-testid="downloads-no-match">
              No files match.
            </p>
          ) : (
            <ul className="pb-1">
              {shown.map((r) => {
                const svc = services?.find((s) => s.id === r.serviceId);
                const service = svc?.name ?? r.serviceId;
                return (
                  <li
                    key={r.id}
                    data-testid="download-row"
                    data-state={r.state}
                    className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
                  >
                    {selectable(r) ? (
                      <input
                        type="checkbox"
                        data-testid="download-select"
                        aria-label={`Select ${r.filename}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="h-3.5 w-3.5 flex-none accent-accent"
                      />
                    ) : (
                      <span aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
                    )}
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 flex-none rounded-full"
                      style={{ background: svc?.color ?? 'transparent' }}
                    />
                    <span className="flex h-[30px] w-[28px] flex-none items-center justify-center rounded-ctl border border-border bg-bg-2 text-[8px] font-extrabold tracking-wide text-text-2">
                      {extensionChip(r.filename)}
                    </span>
                    {r.state === 'saved' ? (
                      <button
                        type="button"
                        data-testid="download-reveal"
                        title={REVEAL_LABEL}
                        onClick={() => reveal(r.id)}
                        className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <Body r={r} service={service} now={now} />
                        <span className="flex-none text-[11px] text-text-2 opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-visible:opacity-100">
                          {REVEAL_LABEL}
                        </span>
                      </button>
                    ) : (
                      <Body r={r} service={service} now={now} />
                    )}
                    {r.state === 'downloading' && (
                      <span className="flex flex-none items-center gap-2">
                        <span className="tabular text-[12px] text-text-2">
                          {percent(r) === null ? '…' : `${percent(r)}%`}
                        </span>
                        <button
                          type="button"
                          data-testid="download-cancel"
                          onClick={() => cancel(r.id)}
                          className={`${btn} hover:border-danger`}
                        >
                          Cancel
                        </button>
                      </span>
                    )}
                    {(r.state === 'failed' || r.state === 'missing') && (
                      <span className="flex-none px-2 text-text-2">—</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Pane>
  );
}
