import { useEffect, useMemo, useState } from 'react';
import {
  DIAG_TAGS,
  type DiagFilter,
  diagFilterNarrows,
  matchesDiagFilter,
} from '../../../shared/diag-filter';
import type { DiagEntry, DiagTag } from '../../../shared/types';
import { useShell } from '../store';
import { relativeTime } from './relative-time';
import { TOAST_MS } from './toast-rules';

/** The button says what it will copy: the whole report, or the shown rows. */
export function copyLabel(shown: number, total: number, narrows: boolean): string {
  return narrows ? `Copy ${shown} of ${total}` : 'Copy report';
}

const chipClass = (on: boolean) =>
  `rounded-ctl px-2 py-1 text-[11px] transition-colors duration-120 ${
    on ? 'bg-accent/15 font-medium text-accent' : 'bg-bg-2 text-text-2 hover:text-text-1'
  }`;

/** Settings → Diagnostics: the evidence ring, newest first, narrowed by a
 *  search field and tag chips, and one button that puts the pasteable
 *  report — the shown rows, when narrowed — on the clipboard. Fetched on
 *  open, never broadcast; the filter is component state and dies with the
 *  pane. See main/lib/diagnostics.ts and shared/diag-filter.ts. */
export default function DiagnosticsPane() {
  const services = useShell((s) => s.state?.services);
  const [entries, setEntries] = useState<DiagEntry[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [tags, setTags] = useState<DiagTag[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.goetia.invoke('diagnostics:recent').then(setEntries);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), TOAST_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const filter = useMemo<DiagFilter>(() => ({ tags, query }), [tags, query]);
  const shown = useMemo(
    () => (entries ?? []).filter((e) => matchesDiagFilter(e, filter)),
    [entries, filter],
  );
  // chips only for tags the ring holds, so a chip alone never empties the list
  const present = useMemo(
    () => DIAG_TAGS.filter((t) => entries?.some((e) => e.tag === t)),
    [entries],
  );
  const narrows = diagFilterNarrows(filter);

  const toggleTag = (t: DiagTag) =>
    setTags((prev) =>
      prev.includes(t)
        ? prev.filter((x) => x !== t)
        : DIAG_TAGS.filter((x) => x === t || prev.includes(x)),
    );
  const showAll = () => {
    setTags([]);
    setQuery('');
  };

  const copy = async () => {
    const text = await window.goetia.invoke('diagnostics:report', { filter });
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  if (entries === null) return null;
  const now = Date.now();
  const total = entries.length;
  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <p className="text-[11px] text-text-2">
          What Goetia noticed going wrong since it started: a badge counter that stopped, a login it
          had to contain, a page that crashed. Never a message, a name or a file.
        </p>
        <button
          type="button"
          data-testid="diag-copy"
          onClick={() => void copy()}
          className="flex-none rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
        >
          {copied ? 'Copied' : copyLabel(shown.length, total, narrows)}
        </button>
      </div>
      {total === 0 ? (
        <p className="pb-3 text-[11px] text-text-2" data-testid="diag-empty">
          Nothing to report yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 pb-2">
            <input
              type="text"
              value={query}
              placeholder="Filter lines…"
              aria-label="Filter lines"
              data-testid="diag-search"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape with text clears the field and stops there; empty, it
                // reaches the Settings handler and closes Settings as anywhere else
                if (e.key === 'Escape' && query !== '') {
                  e.stopPropagation();
                  setQuery('');
                }
              }}
              className="w-[160px] rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 placeholder:text-text-2"
            />
            {present.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`diag-tag-${t}`}
                  aria-pressed={on}
                  onClick={() => toggleTag(t)}
                  className={chipClass(on)}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="pb-3 text-[11px] text-text-2" data-testid="diag-no-match">
              No lines match.{' '}
              <button
                type="button"
                data-testid="diag-show-all"
                onClick={showAll}
                className="text-accent hover:underline"
              >
                Show all
              </button>
            </p>
          ) : (
            <ul className="pb-2">
              {shown.map((e) => {
                const svc = e.serviceId ? services?.find((s) => s.id === e.serviceId) : undefined;
                return (
                  <li
                    key={`${e.at}-${e.tag}-${e.line}`}
                    data-testid="diag-row"
                    className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-b-0"
                  >
                    <span className="tabular w-[72px] flex-none text-[11px] text-text-2">
                      {relativeTime(e.at, now)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1 h-[7px] w-[7px] flex-none self-center rounded-full"
                      style={{ background: svc?.color ?? 'transparent' }}
                    />
                    <span className="min-w-0 break-words text-[12px] text-text-1">
                      <span className="text-text-2">[{e.tag}]</span> {e.line}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
