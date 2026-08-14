import Conf from 'conf';
import { SERVICES } from '../shared/services';
import { DEFAULT_SETTINGS, type ServiceId, type Settings } from '../shared/types';
import { trimToCap } from '../shared/welcome';

/** settings.json written before a service existed persists whole top-level
 *  objects — a shallow merge with defaults never surfaces new ServiceIds.
 *  Reconcile against the catalog: slot missing ids into order at their
 *  catalog position (right after the nearest catalog predecessor the user
 *  already has, so e.g. instagram lands beside messenger even in a
 *  reordered rail), drop unknown ids, fill missing record keys from
 *  defaults, and cap the enabled set at MAX_SUMMONED. */
function normalize(raw: Settings): { settings: Settings; trimmed: ServiceId[] } {
  const ids = SERVICES.map((s) => s.id);
  const known = new Set<ServiceId>(ids);
  const fill = (rec: unknown, defaults: Record<ServiceId, boolean>): Record<ServiceId, boolean> => {
    const r = (rec && typeof rec === 'object' ? rec : {}) as Partial<Record<ServiceId, boolean>>;
    return Object.fromEntries(ids.map((id) => [id, r[id] ?? defaults[id]])) as Record<
      ServiceId,
      boolean
    >;
  };
  const persisted = Array.isArray(raw.order) ? raw.order : DEFAULT_SETTINGS.order;
  const order = persisted.filter((id) => known.has(id));
  for (const [idx, id] of ids.entries()) {
    if (order.includes(id)) continue;
    let at = 0;
    for (let i = idx - 1; i >= 0; i--) {
      const pos = order.indexOf(ids[i]);
      if (pos !== -1) {
        at = pos + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  const capped = trimToCap(order, fill(raw.disabled, DEFAULT_SETTINGS.disabled));
  return {
    settings: {
      ...raw,
      order,
      muted: fill(raw.muted, DEFAULT_SETTINGS.muted),
      disabled: capped.disabled,
      neverHibernate: fill(raw.neverHibernate, DEFAULT_SETTINGS.neverHibernate),
    },
    trimmed: capped.trimmed,
  };
}

/** JSON settings at <cwd>/settings.json. `conf` is electron-store's engine,
 *  used directly so this is testable without an Electron runtime. */
export class SettingsStore {
  private conf: Conf<Settings>;
  /** ids the cap disabled when this store first read the file — persisted
   *  immediately so the trim happens once, surfaced so the shell can say so */
  readonly bootTrimmed: ServiceId[];

  constructor(cwd: string) {
    this.conf = new Conf<Settings>({ cwd, configName: 'settings', defaults: DEFAULT_SETTINGS });
    const first = normalize({ ...DEFAULT_SETTINGS, ...this.conf.store });
    this.bootTrimmed = first.trimmed;
    if (first.trimmed.length > 0) this.conf.set('disabled', first.settings.disabled);
  }

  get(): Settings {
    return normalize({ ...DEFAULT_SETTINGS, ...this.conf.store }).settings;
  }

  update(patch: Partial<Settings>): Settings {
    for (const [k, v] of Object.entries(patch)) {
      this.conf.set(k as keyof Settings, v as Settings[keyof Settings]);
    }
    return this.get();
  }
}
