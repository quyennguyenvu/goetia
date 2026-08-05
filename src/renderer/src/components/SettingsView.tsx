import type React from 'react';
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
      <h2 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wide text-text-2">
        {title}
      </h2>
      <div className="rounded-modal border border-border bg-bg-1 px-4 py-1">{children}</div>
    </>
  );
}

export default function SettingsView() {
  const state = useShell((s) => s.state);
  if (!state?.settingsOpen) return null;
  const s = state.settings;
  const update = (patch: Partial<Settings>) => window.goetia.send('settings:update', patch);

  return (
    <div data-testid="settings" className="absolute inset-0 overflow-y-auto bg-bg-0 p-8">
      <div className="mx-auto max-w-xl pb-8">
        <h1 className="mb-2 text-xl font-semibold text-text-1">Settings</h1>

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
                    disabled={
                      !s.disabled[svc.id] &&
                      state.services.filter((x) => !s.disabled[x.id]).length === 1
                    }
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
            <p className="py-1">⌘/Ctrl + 1…5 — jump to service</p>
            <p className="py-1">⌘/Ctrl + K — quick switcher</p>
            <p className="py-1">⌘/Ctrl + R or F5 — reload current service</p>
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
  );
}
