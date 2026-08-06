import Conf from 'conf';
import { SERVICES } from '../shared/services';
import { DEFAULT_SETTINGS, type ServiceId, type Settings } from '../shared/types';

/** settings.json written before a service existed persists whole top-level
 *  objects — a shallow merge with defaults never surfaces new ServiceIds.
 *  Reconcile against the catalog: append missing ids to order (in catalog
 *  order), drop unknown ids, fill missing record keys from defaults. */
function normalize(raw: Settings): Settings {
  const ids = SERVICES.map((s) => s.id);
  const known = new Set<ServiceId>(ids);
  const fill = (
    rec: Partial<Record<ServiceId, boolean>>,
    defaults: Record<ServiceId, boolean>,
  ): Record<ServiceId, boolean> =>
    Object.fromEntries(ids.map((id) => [id, rec[id] ?? defaults[id]])) as Record<
      ServiceId,
      boolean
    >;
  return {
    ...raw,
    order: [
      ...raw.order.filter((id) => known.has(id)),
      ...ids.filter((id) => !raw.order.includes(id)),
    ],
    muted: fill(raw.muted, DEFAULT_SETTINGS.muted),
    disabled: fill(raw.disabled, DEFAULT_SETTINGS.disabled),
    neverHibernate: fill(raw.neverHibernate, DEFAULT_SETTINGS.neverHibernate),
  };
}

/** JSON settings at <cwd>/settings.json. `conf` is electron-store's engine,
 *  used directly so this is testable without an Electron runtime. */
export class SettingsStore {
  private conf: Conf<Settings>;

  constructor(cwd: string) {
    this.conf = new Conf<Settings>({ cwd, configName: 'settings', defaults: DEFAULT_SETTINGS });
  }

  get(): Settings {
    return normalize({ ...DEFAULT_SETTINGS, ...this.conf.store });
  }

  update(patch: Partial<Settings>): Settings {
    for (const [k, v] of Object.entries(patch)) {
      this.conf.set(k as keyof Settings, v as Settings[keyof Settings]);
    }
    return this.get();
  }
}
