import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ACCELERATORS, devtoolsAccelerator } from '../../../shared/shortcuts';
import { comboLabel, SUMMON_COMBOS } from '../../../shared/summon';
import type { RailPosition, Settings, ThemePref, UpdateState } from '../../../shared/types';
import { useShell } from '../store';
import { shouldAutoRecheck, updatePending } from './update-rules';

type SectionId = 'general' | 'appearance' | 'services' | 'notifications' | 'shortcuts' | 'updates';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'services', label: 'Services' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'updates', label: 'Updates' },
];

// display Monday-first; storage stays Date.getDay()-indexed (0 = Sunday)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const isMac = navigator.platform.startsWith('Mac');

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-text-1">{label}</span>
        {hint && <span className="text-[11px] text-text-2">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Pane({
  title,
  children,
  highlight,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-2">
        {title}
      </h2>
      {/* the highlight rides the card, not a wrapper: the card is opaque and
          would paint straight over a tinted ancestor */}
      <div
        className={`rounded-modal border bg-bg-1 px-4 py-1 transition duration-300 ${
          highlight ? 'border-accent ring-2 ring-accent/25' : 'border-border'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** platform label for a table chord — '⇧⌘G' here, 'Ctrl+Shift+G' on Windows */
const key = (accelerator: string) => comboLabel(accelerator, isMac);

function ShortcutGroup({
  title,
  rows,
  last,
}: {
  title: string;
  rows: [string, string][];
  last?: boolean;
}) {
  return (
    <div className={`py-3 ${last ? '' : 'border-b border-border'}`}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
        {title}
      </h3>
      <dl className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-1">
        {rows.map(([chord, action]) => (
          <div key={chord} className="contents">
            <dt className="tabular text-text-1">{chord}</dt>
            <dd className="text-text-2">{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function updateStatusLine(u: UpdateState, current: string): string {
  switch (u.status) {
    case 'checking':
      return 'Checking…';
    case 'current':
      return 'Goetia is up to date';
    case 'available':
      return `You're on ${current}`;
    case 'error':
      return "Couldn't reach GitHub. Try again.";
    default:
      return 'Personal multi-service chat client';
  }
}

function RefreshIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

const close = () => window.goetia.send('settings:setOpen', { open: false });

export default function SettingsView() {
  const state = useShell((s) => s.state);
  const open = state?.settingsOpen ?? false;
  const focusSection = useShell((s) => s.focusSection);
  const setFocusSection = useShell((s) => s.setFocusSection);
  const [active, setActive] = useState<SectionId>('general');
  const [flash, setFlash] = useState(false);
  const updateStatus = state?.update.status;
  const lastRecheck = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // switcher may be layered on top and owns Escape while open
      if (e.key === 'Escape' && !useShell.getState().state?.switcherOpen) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // arriving from the gear dot or from Check for Updates… selects Updates
  // rather than leaving the user on whichever pane they last used
  useEffect(() => {
    if (!open) return;
    if (focusSection !== 'updates' && updateStatus !== 'checking') return;
    setActive('updates');
    setFocusSection(null);
    setFlash(true);
  }, [open, focusSection, updateStatus, setFocusSection]);

  // the fade owns its own effect: parked in the one above, a status change
  // (checking -> current) ran the cleanup and cancelled the timer mid-flight,
  // leaving the highlight stuck on forever
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(id);
  }, [flash]);

  // the poll runs once a day, so the card would otherwise show whatever it
  // last saw — opening the pane is the moment that answer has to be true
  useEffect(() => {
    if (!open || active !== 'updates' || !updateStatus) return;
    if (!shouldAutoRecheck(Date.now(), lastRecheck.current, updateStatus)) return;
    lastRecheck.current = Date.now();
    window.goetia.send('updates:check', {});
  }, [open, active, updateStatus]);

  if (!state?.settingsOpen) return null;
  const s = state.settings;
  const update = (patch: Partial<Settings>) => window.goetia.send('settings:update', patch);
  const u = state.update;
  const pending = updatePending(u);
  const checking = u.status === 'checking';
  const recheck = () => {
    lastRecheck.current = Date.now();
    window.goetia.send('updates:check', {});
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; Escape handled globally
    <div
      role="presentation"
      data-testid="settings"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={close}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: swallows backdrop mousedown */}
      <div
        role="presentation"
        className="flex h-[540px] max-h-full w-[760px] max-w-full flex-col overflow-hidden rounded-modal border border-border bg-bg-0 shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5">
          <h1 className="text-[15px] font-semibold text-text-1">Settings</h1>
          <button
            type="button"
            aria-label="Close settings"
            title="Close (Esc)"
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded-ctl text-text-2 transition-colors duration-120 hover:bg-bg-2 hover:text-text-1"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            data-testid="settings-nav"
            className="flex w-[168px] flex-none flex-col gap-0.5 overflow-y-auto border-r border-border p-3"
          >
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                data-testid={`settings-nav-${sec.id}`}
                aria-current={active === sec.id ? 'page' : undefined}
                onClick={() => setActive(sec.id)}
                className={`flex items-center justify-between gap-2 rounded-ctl px-3 py-1.5 text-left transition-colors duration-120 ${
                  active === sec.id
                    ? 'bg-bg-2 font-medium text-text-1'
                    : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
                }`}
              >
                {sec.label}
                {sec.id === 'updates' && pending && (
                  <span
                    data-testid="nav-update-dot"
                    aria-hidden="true"
                    className="h-[7px] w-[7px] flex-none rounded-full bg-accent"
                  />
                )}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-4">
            {active === 'general' && (
              <Pane title="General">
                <Row label="Close to tray">
                  <input
                    type="checkbox"
                    checked={s.closeToTray}
                    onChange={(e) => update({ closeToTray: e.target.checked })}
                  />
                </Row>
                <Row label="Launch at login">
                  <input
                    type="checkbox"
                    checked={s.launchAtLogin}
                    onChange={(e) => update({ launchAtLogin: e.target.checked })}
                  />
                </Row>
                <Row
                  label="Summoning hotkey"
                  hint={
                    state.summonHotkeyOk
                      ? 'Show or hide Goetia from anywhere.'
                      : 'That combo is taken by another app — pick a different one.'
                  }
                >
                  <input
                    type="checkbox"
                    data-testid="summon-enabled"
                    checked={s.summonHotkey.enabled}
                    onChange={(e) =>
                      update({ summonHotkey: { ...s.summonHotkey, enabled: e.target.checked } })
                    }
                  />
                </Row>
                <Row label="Combo">
                  <select
                    data-testid="summon-combo"
                    disabled={!s.summonHotkey.enabled}
                    value={s.summonHotkey.accelerator}
                    onChange={(e) =>
                      update({ summonHotkey: { ...s.summonHotkey, accelerator: e.target.value } })
                    }
                    className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                  >
                    {SUMMON_COMBOS.map((c) => (
                      <option key={c} value={c}>
                        {comboLabel(c, isMac)}
                      </option>
                    ))}
                  </select>
                </Row>
              </Pane>
            )}

            {active === 'appearance' && (
              <Pane title="Appearance">
                <Row label="Menu position">
                  <select
                    value={s.railPosition}
                    onChange={(e) => update({ railPosition: e.target.value as RailPosition })}
                    className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1"
                  >
                    <option value="top">Top</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </Row>
                <Row label="Theme">
                  <select
                    value={s.theme}
                    onChange={(e) => update({ theme: e.target.value as ThemePref })}
                    className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1"
                  >
                    <option value="system">Follow system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Row>
              </Pane>
            )}

            {active === 'services' && (
              <Pane title="Services">
                {state.services
                  .filter((svc) => !s.disabled[svc.id])
                  .map((svc) => (
                    <div
                      key={svc.id}
                      className="flex items-center justify-between gap-4 border-b border-border py-2"
                    >
                      <span className="text-text-1">{svc.name}</span>
                      <span className="flex items-center gap-4 text-text-2">
                        <label
                          className="flex items-center gap-1.5"
                          title="No banners, and the site's own sounds are silenced"
                        >
                          <input
                            type="checkbox"
                            checked={s.muted[svc.id]}
                            onChange={(e) =>
                              window.goetia.send('service:setMuted', {
                                serviceId: svc.id,
                                muted: e.target.checked,
                              })
                            }
                          />
                          mute
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={s.neverHibernate[svc.id]}
                            onChange={(e) =>
                              update({
                                neverHibernate: { ...s.neverHibernate, [svc.id]: e.target.checked },
                              })
                            }
                          />
                          never hibernate
                        </label>
                        <button
                          type="button"
                          data-testid={`purge-${svc.id}`}
                          title="Clears this service's saved login on this device. Your account stays active — nothing is signed out elsewhere."
                          onClick={() =>
                            useShell
                              .getState()
                              .setPurgeConfirm({ kind: 'one', id: svc.id, name: svc.name })
                          }
                          className="rounded-ctl bg-danger px-2.5 py-1 font-semibold text-white transition-opacity duration-120 hover:opacity-90"
                        >
                          Purge login…
                        </button>
                      </span>
                    </div>
                  ))}
                <Row label="Hibernate idle services after (minutes)">
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={s.hibernationMinutes}
                    onChange={(e) =>
                      update({ hibernationMinutes: Math.max(5, Number(e.target.value) || 30) })
                    }
                    className="tabular w-20 rounded-ctl border border-border bg-bg-2 px-2 py-1 text-right text-text-1"
                  />
                </Row>
                <Row
                  label="Banish unused services"
                  hint="An unused service leaves the rail and returns to Home. Sign-in is kept."
                >
                  <input
                    type="checkbox"
                    data-testid="auto-banish-enabled"
                    checked={s.autoBanish.enabled}
                    onChange={(e) =>
                      update({ autoBanish: { ...s.autoBanish, enabled: e.target.checked } })
                    }
                  />
                </Row>
                <Row label="After (hours)">
                  <input
                    type="number"
                    data-testid="auto-banish-hours"
                    min={1}
                    max={720}
                    disabled={!s.autoBanish.enabled}
                    value={s.autoBanish.hours}
                    onChange={(e) =>
                      update({
                        autoBanish: {
                          ...s.autoBanish,
                          hours: Math.max(1, Number(e.target.value) || 24),
                        },
                      })
                    }
                    className="tabular w-20 rounded-ctl border border-border bg-bg-2 px-2 py-1 text-right text-text-1 disabled:opacity-40"
                  />
                </Row>
                <Row
                  label="Light Sleep"
                  hint="Sleeping services wake hidden every few minutes so badges and banners stay current."
                >
                  <input
                    type="checkbox"
                    data-testid="light-sleep-enabled"
                    checked={s.lightSleep}
                    onChange={(e) => update({ lightSleep: e.target.checked })}
                  />
                </Row>
                <Row
                  label="Battery saver for Light Sleep"
                  hint="Wake a quiet service less often, and least often on battery. Saves a lot of work; its badge can lag by up to an hour."
                >
                  <input
                    type="checkbox"
                    data-testid="peek-saver-enabled"
                    disabled={!s.lightSleep}
                    checked={s.peekSaver}
                    onChange={(e) => update({ peekSaver: e.target.checked })}
                  />
                </Row>
                {/* composition lives on Home: an enable toggle behind a modal
                    is what let a view bury the modal it was toggled from */}
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-text-2">Add or remove services</span>
                  <button
                    type="button"
                    data-testid="manage-services"
                    onClick={() => {
                      window.goetia.send('settings:setOpen', { open: false });
                      window.goetia.send('home:setOpen', { open: true });
                    }}
                    className="rounded-ctl border border-border bg-bg-2 px-3 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
                  >
                    Manage services…
                  </button>
                </div>
              </Pane>
            )}

            {active === 'notifications' && (
              <Pane title="Notifications">
                <Row label="Mute all notifications">
                  <input
                    type="checkbox"
                    checked={state.quietActive || s.globalMuted}
                    onChange={(e) =>
                      window.goetia.send('global:setMuted', { muted: e.target.checked })
                    }
                  />
                </Row>
                <Row
                  label="Play notification sound"
                  hint="Only for services that play none of their own, so nothing ever doubles up."
                >
                  <input
                    type="checkbox"
                    data-testid="notification-sound"
                    checked={s.notificationSound}
                    disabled={s.globalMuted}
                    onChange={(e) => update({ notificationSound: e.target.checked })}
                    className="flex-none disabled:opacity-40"
                  />
                </Row>
                <Row
                  label="Quiet hours"
                  hint="Banners and page sounds pause on schedule. Badges keep counting."
                >
                  <input
                    type="checkbox"
                    data-testid="quiet-enabled"
                    checked={s.quietHours.enabled}
                    onChange={(e) =>
                      update({ quietHours: { ...s.quietHours, enabled: e.target.checked } })
                    }
                  />
                </Row>
                <Row label="From">
                  <span className="flex items-center gap-2 text-text-2">
                    <input
                      type="time"
                      data-testid="quiet-start"
                      value={s.quietHours.start}
                      disabled={!s.quietHours.enabled}
                      onChange={(e) => {
                        if (e.target.value) {
                          update({ quietHours: { ...s.quietHours, start: e.target.value } });
                        }
                      }}
                      className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                    />
                    to
                    <input
                      type="time"
                      data-testid="quiet-end"
                      value={s.quietHours.end}
                      disabled={!s.quietHours.enabled}
                      onChange={(e) => {
                        if (e.target.value) {
                          update({ quietHours: { ...s.quietHours, end: e.target.value } });
                        }
                      }}
                      className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                    />
                  </span>
                </Row>
                <Row label="On days">
                  <span className="flex items-center gap-1">
                    {DAY_ORDER.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        data-testid={`quiet-day-${d}`}
                        aria-pressed={s.quietHours.days[d]}
                        disabled={!s.quietHours.enabled}
                        onClick={() => {
                          const days = [...s.quietHours.days] as Settings['quietHours']['days'];
                          days[d] = !days[d];
                          update({ quietHours: { ...s.quietHours, days } });
                        }}
                        className={`h-7 w-7 rounded-ctl text-[12px] transition-colors duration-120 disabled:opacity-40 ${
                          s.quietHours.days[d]
                            ? 'bg-accent/15 font-medium text-accent'
                            : 'bg-bg-2 text-text-2 hover:text-text-1'
                        }`}
                      >
                        {DAY_LABELS[i]}
                      </button>
                    ))}
                  </span>
                </Row>
              </Pane>
            )}

            {active === 'shortcuts' && (
              <Pane title="Shortcuts">
                <p className="pt-3 text-[11px] text-text-2">
                  Goetia's keys work inside every chat page, even where the site binds the same
                  chord. Home and Pin are on the left half of the keyboard so they can be pressed
                  with the mouse in the other hand.
                </p>
                <ShortcutGroup
                  title="Navigate"
                  rows={[
                    [`${key('CmdOrCtrl+1')}…9`, 'jump to a service'],
                    [
                      key(ACCELERATORS.switcher),
                      'quick switcher — services and recent conversations',
                    ],
                    [key(ACCELERATORS.home), 'Home — all services and the pinboard'],
                    [key(ACCELERATORS.findService), 'find a service (on Home)'],
                    ['Esc', 'close this window, or leave Home'],
                  ]}
                />
                <ShortcutGroup
                  title="Pins"
                  rows={[
                    [key(ACCELERATORS.pinSelection), 'pin the selected text to the pinboard'],
                    ['Right-click a message', 'Pin Message — where the site allows our menu'],
                    ['Drag ⠿ on Home', 'reprioritize — the top pin is in progress'],
                  ]}
                />
                <ShortcutGroup
                  title="Service page"
                  rows={[
                    [`${key(ACCELERATORS.reload[0])} or F5`, 'reload the current service'],
                    [
                      `${key(ACCELERATORS.zoomIn)} / ${key(ACCELERATORS.zoomOut)} / ${key(ACCELERATORS.zoomReset)}`,
                      'zoom in / out / actual size (remembered per service)',
                    ],
                    [key(devtoolsAccelerator(isMac ? 'darwin' : 'win32')), 'developer tools'],
                  ]}
                />
                <ShortcutGroup
                  title="Notifications"
                  rows={[
                    [key(ACCELERATORS.mute), 'mute / unmute everything'],
                    ...(s.summonHotkey.enabled
                      ? [
                          [
                            `${comboLabel(s.summonHotkey.accelerator, isMac)} (system-wide)`,
                            'summon / dismiss Goetia',
                          ] as [string, string],
                        ]
                      : []),
                  ]}
                />
                <ShortcutGroup
                  title="Rail"
                  last
                  rows={[
                    [key(ACCELERATORS.settings), 'settings'],
                    ['Right-click a tile', 'mute or banish the service'],
                    ['Drag tiles', 'reorder services'],
                  ]}
                />
              </Pane>
            )}

            {active === 'updates' && (
              <Pane title="Updates" highlight={flash}>
                <div className="flex items-center justify-between gap-4 border-b border-border py-3">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-text-1">
                      {pending ? `Version ${u.latest} available` : `Version ${state.version}`}
                    </span>
                    <span className="text-text-2">{updateStatusLine(u, state.version)}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {/* Download must not be the only thing here: it used to
                        replace the check button, stranding the card on
                        whatever release the last poll happened to see */}
                    {pending && (
                      <button
                        type="button"
                        data-testid="update-recheck"
                        title="Check for updates"
                        aria-label="Check for updates"
                        disabled={checking}
                        onClick={recheck}
                        className="flex h-8 w-8 items-center justify-center rounded-ctl border border-border bg-bg-2 text-text-2 transition-colors duration-120 hover:border-accent hover:text-text-1 disabled:opacity-50"
                      >
                        <span className={checking ? 'animate-spin' : undefined}>
                          <RefreshIcon />
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="update-action"
                      disabled={checking && !pending}
                      onClick={() =>
                        pending ? window.goetia.send('updates:openDownload', {}) : recheck()
                      }
                      className={`rounded-ctl px-3 py-1.5 transition-colors duration-120 disabled:opacity-50 ${
                        pending
                          ? 'bg-accent font-semibold text-on-accent hover:brightness-110'
                          : 'border border-border bg-bg-2 text-text-1 hover:border-accent'
                      }`}
                    >
                      {pending ? 'Download' : 'Check for updates'}
                    </button>
                  </span>
                </div>
                <Row label="Automatic updates">
                  <input
                    type="checkbox"
                    checked={s.checkForUpdates}
                    onChange={(e) => update({ checkForUpdates: e.target.checked })}
                  />
                </Row>
              </Pane>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
