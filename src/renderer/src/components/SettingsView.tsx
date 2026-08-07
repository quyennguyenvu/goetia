import type React from 'react';
import { useEffect } from 'react';
import type { RailPosition, Settings, ThemePref } from '../../../shared/types';
import { useShell } from '../store';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="flex items-center justify-between gap-4 py-2">
      <span className="text-text-1">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
        {title}
      </h2>
      <div className="rounded-modal border border-border bg-bg-1 px-4 py-1">{children}</div>
    </>
  );
}

const close = () => window.goetia.send('settings:setOpen', { open: false });

export default function SettingsView() {
  const state = useShell((s) => s.state);
  const open = state?.settingsOpen ?? false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // switcher may be layered on top and owns Escape while open
      if (e.key === 'Escape' && !useShell.getState().state?.switcherOpen) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!state?.settingsOpen) return null;
  const s = state.settings;
  const update = (patch: Partial<Settings>) => window.goetia.send('settings:update', patch);

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
        className="flex max-h-full w-[620px] max-w-full flex-col overflow-hidden rounded-modal border border-border bg-bg-0 shadow-[0_8px_32px_rgba(0,0,0,.4)]"
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

        <div className="overflow-y-auto px-6 pb-6">
          <Section title="General">
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
          </Section>

          <Section title="Services">
            {state.services.map((svc) => (
              <div
                key={svc.id}
                className={`flex items-center justify-between gap-4 border-b border-border py-2 last:border-0 ${
                  s.disabled[svc.id] ? 'opacity-50' : ''
                }`}
              >
                <span className="text-text-1">{svc.name}</span>
                <span className="flex items-center gap-4 text-text-2">
                  <label
                    className="flex items-center gap-1.5"
                    title="Disabled services load nothing — no tile, no requests"
                  >
                    <input
                      type="checkbox"
                      checked={!s.disabled[svc.id]}
                      onChange={(e) =>
                        update({ disabled: { ...s.disabled, [svc.id]: !e.target.checked } })
                      }
                    />
                    enabled
                  </label>
                  <label className="flex items-center gap-1.5">
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
                    className="rounded-ctl border border-border px-2 py-0.5 hover:bg-bg-2"
                    onClick={() => window.goetia.send('service:reload', { serviceId: svc.id })}
                  >
                    reload
                  </button>
                </span>
              </div>
            ))}
          </Section>

          <Section title="Notifications">
            <Row label="Mute all notifications">
              <input
                type="checkbox"
                checked={s.globalMuted}
                onChange={(e) => window.goetia.send('global:setMuted', { muted: e.target.checked })}
              />
            </Row>
          </Section>

          <Section title="Shortcuts">
            <div className="py-2 text-text-2">
              <p className="py-1">⌘/Ctrl + 1…6 — jump to service</p>
              <p className="py-1">⌘/Ctrl + K — quick switcher</p>
              <p className="py-1">⌘/Ctrl + , — settings</p>
              <p className="py-1">⌘/Ctrl + R or F5 — reload current service</p>
              <p className="py-1">Esc — close this window</p>
              <p className="py-1">Right-click a tile — mute/unmute service</p>
              <p className="py-1">Drag tiles — reorder services</p>
            </div>
          </Section>

          <Section title="About">
            <p className="py-2 text-text-2">
              Goetia {state.version} — personal multi-service chat client.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
