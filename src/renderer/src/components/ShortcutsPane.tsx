import { useEffect, useRef, useState } from 'react';
import {
  ACCELERATORS,
  devtoolsAccelerator,
  REBINDABLE,
  type RebindableId,
  type RecordResult,
  resolveAccelerators,
  SHORTCUT_LABELS,
} from '../../../shared/shortcuts';
import { comboLabel } from '../../../shared/summon';
import type { Settings } from '../../../shared/types';

const isMac = navigator.platform.startsWith('Mac');
/** platform label for a table chord — '⇧⌘G' here, 'Ctrl+Shift+G' on Windows */
const key = (accelerator: string) => comboLabel(accelerator, isMac);
const MOD = isMac ? '⌘' : 'Ctrl';
const RECORDING = 'Press a shortcut… esc cancels';

type RowSpec = { fixed: string; desc: string } | { ids: readonly RebindableId[]; desc: string };

const NAVIGATE: RowSpec[] = [
  { fixed: `${key('CmdOrCtrl+1')}…9`, desc: 'jump to a service' },
  { ids: ['switcher'], desc: 'quick switcher — services and recent conversations' },
  { ids: ['nextUnread', 'prevUnread'], desc: 'next / previous unread conversation' },
  { ids: ['home'], desc: 'Home — all services and the pinboard' },
  { ids: ['downloads'], desc: 'downloads — your files' },
  { fixed: key(ACCELERATORS.findService), desc: 'find a service (on Home)' },
  { fixed: 'Esc', desc: 'close this window, or leave Home' },
];
const PINS: RowSpec[] = [
  { ids: ['pinSelection'], desc: 'pin the selected text to the pinboard' },
  { fixed: 'Right-click a message', desc: 'Pin Message — where the site allows our menu' },
  { fixed: 'Drag ⠿ on Home', desc: 'reprioritize — the top pin is in progress' },
];
const PAGE: RowSpec[] = [
  { fixed: `${key(ACCELERATORS.reload[0])} or F5`, desc: 'reload the current service' },
  {
    fixed: `${key(ACCELERATORS.zoomIn)} / ${key(ACCELERATORS.zoomOut)} / ${key(ACCELERATORS.zoomReset)}`,
    desc: 'zoom in / out / actual size (remembered per service)',
  },
  { fixed: key(devtoolsAccelerator(isMac ? 'darwin' : 'win32')), desc: 'developer tools' },
];
const RAIL: RowSpec[] = [
  { fixed: key(ACCELERATORS.settings), desc: 'settings' },
  { ids: ['lock'], desc: 'lock Goetia' },
  { fixed: 'Right-click a tile', desc: 'mute or banish the service' },
  { fixed: 'Drag tiles', desc: 'reorder services' },
];

/** the inline line under a refused chord — the cap keeps listening */
export function refusalLine(r: Extract<RecordResult, { ok: false }>): string {
  const chord = r.chord ? key(r.chord) : 'That';
  const tail = ' — press another, or esc';
  switch (r.reason) {
    case 'modifier':
      return `Needs ${MOD}${tail}`;
    case 'reserved':
      return `${chord} is reserved${tail}`;
    case 'taken':
      return `${chord} is taken by ${r.takenBy ? SHORTCUT_LABELS[r.takenBy] : 'another key'}${tail}`;
    case 'pair':
      return `Needs a key with an opposite: brackets, arrows, Page Up/Down, Tab${tail}`;
    case 'cancelled':
      return '';
  }
}

/** Settings → Shortcuts: the chord table as the user has it. A rebindable
 *  row's chord is a key cap: click, press the new chord, done — main records,
 *  validates and writes (shortcuts:record); this pane only asks and shows the
 *  verdict, and re-asks after a refusal so the cap keeps listening. Reset per
 *  row and for all are ordinary settings writes. */
export default function ShortcutsPane({ settings }: { settings: Settings }) {
  const acc = resolveAccelerators(settings.shortcuts);
  const [active, setActive] = useState<RebindableId | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // the row a click started; a stale `cancelled` from a superseded recording
  // must not clear the row that took over
  const activeRef = useRef<RebindableId | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const record = async (id: RebindableId) => {
    activeRef.current = id;
    setActive(id);
    setRefusal(null);
    for (;;) {
      const r = await window.goetia.invoke('shortcuts:record', { id });
      if (!alive.current || activeRef.current !== id) return;
      if (r.ok || r.reason === 'cancelled') {
        activeRef.current = null;
        setActive(null);
        setRefusal(null);
        return;
      }
      setRefusal(refusalLine(r));
    }
  };
  const update = (shortcuts: Settings['shortcuts']) =>
    window.goetia.send('settings:update', { shortcuts });
  const reset = (ids: readonly RebindableId[]) => {
    const next = { ...settings.shortcuts };
    for (const id of ids) delete next[id];
    update(next);
  };
  const changed = REBINDABLE.filter((id) => settings.shortcuts[id] !== undefined).length;

  const group = (title: string, rows: RowSpec[], last = false) => (
    <div className={`py-3 ${last ? '' : 'border-b border-border'}`}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
        {title}
      </h3>
      <dl className="grid grid-cols-[minmax(120px,max-content)_1fr_auto] items-center gap-x-4 gap-y-1">
        {rows.map((row) => {
          if ('fixed' in row) {
            return (
              <div key={row.fixed} className="contents">
                <dt className="tabular text-text-1">{row.fixed}</dt>
                <dd className="text-text-2">{row.desc}</dd>
                <dd />
              </div>
            );
          }
          const id = row.ids[0];
          const label = row.ids.map((i) => key(acc[i])).join(' / ');
          const fallback = row.ids.map((i) => key(ACCELERATORS[i])).join(' / ');
          const isActive = active !== null && row.ids.includes(active);
          const differs = row.ids.some((i) => acc[i] !== ACCELERATORS[i]);
          let capClass = 'border-border bg-bg-2 text-text-1 hover:border-accent';
          if (isActive) {
            capClass = refusal
              ? 'border-danger text-danger'
              : 'border-accent bg-accent/10 text-accent ring-2 ring-accent/25';
          }
          return (
            <div key={id} className="contents" data-testid={`shortcut-row-${id}`}>
              <dt>
                <button
                  type="button"
                  data-testid={`shortcut-cap-${id}`}
                  onClick={() => void record(id)}
                  className={`tabular rounded-ctl border px-2 py-0.5 text-[12px] transition-colors duration-120 ${capClass}`}
                >
                  {isActive && !refusal ? RECORDING : label}
                </button>
              </dt>
              <dd className={isActive && refusal ? 'text-danger' : 'text-text-2'}>
                {isActive && refusal ? refusal : row.desc}
              </dd>
              <dd className="text-right">
                {differs && (
                  <button
                    type="button"
                    data-testid={`shortcut-reset-${id}`}
                    onClick={() => reset(row.ids)}
                    className="whitespace-nowrap text-[11px] text-accent hover:underline"
                  >
                    Reset to {fallback}
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );

  const notifications: RowSpec[] = [
    { ids: ['mute'], desc: 'mute / unmute everything' },
    ...(settings.summonHotkey.enabled
      ? [
          {
            fixed: `${comboLabel(settings.summonHotkey.accelerator, isMac)} (system-wide)`,
            desc: 'summon / dismiss Goetia — chosen in General',
          },
        ]
      : []),
  ];

  return (
    <div>
      <p className="pt-3 text-[11px] text-text-2">
        Goetia's keys work inside every chat page, even where the site binds the same chord. Click a
        key to change it — keep the ones you press with the mouse in your other hand on the left
        half.
      </p>
      {group('Navigate', NAVIGATE)}
      {group('Pins', PINS)}
      {group('Service page', PAGE)}
      {group('Notifications', notifications)}
      {group('Rail', RAIL, changed === 0)}
      {changed > 0 && (
        <div className="flex items-center justify-between py-3 text-[11px] text-text-2">
          <span>
            {changed} {changed === 1 ? 'key' : 'keys'} changed from the defaults.
          </span>
          <button
            type="button"
            data-testid="shortcuts-reset-all"
            onClick={() => update({})}
            className="text-accent hover:underline"
          >
            Reset all to defaults
          </button>
        </div>
      )}
    </div>
  );
}
