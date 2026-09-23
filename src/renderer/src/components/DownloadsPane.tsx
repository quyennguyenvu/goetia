import { useCallback, useEffect, useState } from 'react';
import { extensionChip, formatBytes, formatProgress } from '../../../shared/format';
import type { DownloadView } from '../../../shared/types';
import { useShell } from '../store';
import { relativeTime } from './relative-time';

/** while a row is downloading the pane re-fetches this often; never otherwise */
const POLL_MS = 1000;
const isMac = navigator.platform.startsWith('Mac');
export const REVEAL_LABEL = isMac ? 'Show in Finder' : 'Show in folder';

/** whole percent, or null while Chromium does not know the total */
export function percent(r: { received: number; total: number }): number | null {
  return r.total > 0 ? Math.min(100, Math.round((r.received / r.total) * 100)) : null;
}

const btn =
  'flex-none rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 transition-colors duration-120';

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

function Action({
  r,
  onReveal,
  onCancel,
}: {
  r: DownloadView;
  onReveal: () => void;
  onCancel: () => void;
}) {
  if (r.state === 'downloading') {
    const pct = percent(r);
    return (
      <span className="flex flex-none items-center gap-2">
        <span className="tabular text-[12px] text-text-2">{pct === null ? '…' : `${pct}%`}</span>
        <button
          type="button"
          data-testid="download-cancel"
          onClick={onCancel}
          className={`${btn} hover:border-danger`}
        >
          Cancel
        </button>
      </span>
    );
  }
  if (r.state === 'saved') {
    return (
      <button
        type="button"
        data-testid="download-reveal"
        onClick={onReveal}
        className={`${btn} hover:border-accent`}
      >
        {REVEAL_LABEL}
      </button>
    );
  }
  return <span className="flex-none px-2 text-text-2">—</span>;
}

/** Settings → Downloads → Recent: this session's files, in flight first.
 *  Fetched when the pane opens and polled once a second only while a row is
 *  still downloading. A row's one action is reveal, or Cancel while it runs;
 *  nothing here is persisted and no path ever reaches this process — see
 *  main/downloads.ts. `landing` names the folder for the empty state, null
 *  under Always ask. */
export default function DownloadsPane({ landing }: { landing: string | null }) {
  const services = useShell((s) => s.state?.services);
  const [rows, setRows] = useState<DownloadView[] | null>(null);
  const load = useCallback(() => {
    window.goetia.invoke('downloads:recent').then(setRows);
  }, []);
  useEffect(load, [load]);

  const live = rows?.some((r) => r.state === 'downloading') ?? false;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const reveal = (id: number) => {
    window.goetia.send('downloads:reveal', { id });
    load();
  };
  const cancel = (id: number) => {
    window.goetia.send('downloads:cancel', { id });
    load();
  };

  if (rows === null) return null;
  const now = Date.now();
  if (rows.length === 0) {
    return (
      <p className="py-3 text-[11px] text-text-2" data-testid="downloads-empty">
        Nothing downloaded yet this session.
        {landing !== null && ` Files a chat sends land in ${landing}.`}
      </p>
    );
  }
  return (
    <div>
      <p className="pt-2 text-right text-[11px] text-text-2">
        Click a file to show it in {isMac ? 'Finder' : 'its folder'}
      </p>
      <ul className="pb-1">
        {rows.map((r) => {
          const svc = services?.find((s) => s.id === r.serviceId);
          const gone = r.state === 'missing';
          return (
            <li
              key={r.id}
              data-testid="download-row"
              data-state={r.state}
              className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: svc?.color ?? 'transparent' }}
              />
              <span className="flex h-[30px] w-[28px] flex-none items-center justify-center rounded-ctl border border-border bg-bg-2 text-[8px] font-extrabold tracking-wide text-text-2">
                {extensionChip(r.filename)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={`truncate font-medium ${
                    gone ? 'text-text-2 line-through decoration-border' : 'text-text-1'
                  }`}
                >
                  {r.filename}
                </span>
                <span className="text-[11px] text-text-2">
                  <Sub r={r} service={svc?.name ?? r.serviceId} now={now} />
                </span>
                {r.state === 'downloading' && (
                  <span className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-bg-2">
                    <span
                      className="block h-full bg-accent"
                      style={{
                        width: `${percent(r) ?? 100}%`,
                        opacity: percent(r) === null ? 0.4 : 1,
                      }}
                    />
                  </span>
                )}
              </span>
              <Action r={r} onReveal={() => reveal(r.id)} onCancel={() => cancel(r.id)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
