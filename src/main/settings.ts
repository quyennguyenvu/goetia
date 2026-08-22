import Conf from 'conf';
import { SERVICES } from '../shared/services';
import { SUMMON_COMBOS } from '../shared/summon';
import {
  DEFAULT_SETTINGS,
  type QuietHoursSchedule,
  type ServiceId,
  type Settings,
} from '../shared/types';
import { trimToCap } from '../shared/welcome';
import { clampZoom } from './lib/zoom-rules';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same job as fill() for the quiet-hours block: a settings.json written
 *  before the field existed, or hand-mangled, must coerce field by field. */
function fillQuietHours(raw: unknown): QuietHoursSchedule {
  const d = DEFAULT_SETTINGS.quietHours;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<QuietHoursSchedule>;
  const days =
    Array.isArray(r.days) && r.days.length === 7 && r.days.every((x) => typeof x === 'boolean')
      ? ([...r.days] as QuietHoursSchedule['days'])
      : d.days;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    start: typeof r.start === 'string' && TIME_RE.test(r.start) ? r.start : d.start,
    end: typeof r.end === 'string' && TIME_RE.test(r.end) ? r.end : d.end,
    days,
  };
}

/** settings.json written before a service existed persists whole top-level
 *  objects — a shallow merge with defaults never surfaces new ServiceIds.
 *  Reconcile against the catalog: slot missing ids into order at their
 *  catalog position (right after the nearest catalog predecessor the user
 *  already has, so e.g. instagram lands beside messenger even in a
 *  reordered rail), drop unknown ids, fill missing record keys from
 *  defaults, and cap the enabled set at MAX_SUMMONED. */
function fillSummonHotkey(raw: unknown): Settings['summonHotkey'] {
  const d = DEFAULT_SETTINGS.summonHotkey;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings['summonHotkey']>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    accelerator:
      typeof r.accelerator === 'string' &&
      (SUMMON_COMBOS as readonly string[]).includes(r.accelerator)
        ? r.accelerator
        : d.accelerator,
  };
}

/** Number-record twin of fill(): missing keys default to 0, corrupt or
 *  out-of-range levels coerce/clamp via clampZoom. */
function fillZoom(raw: unknown): Record<ServiceId, number> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<ServiceId, number>>;
  return Object.fromEntries(SERVICES.map((s) => [s.id, clampZoom(r[s.id])])) as Record<
    ServiceId,
    number
  >;
}

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
      zoom: fillZoom(raw.zoom),
      quietHours: fillQuietHours(raw.quietHours),
      quietOverrideWindowStart:
        typeof raw.quietOverrideWindowStart === 'number' &&
        Number.isFinite(raw.quietOverrideWindowStart)
          ? raw.quietOverrideWindowStart
          : null,
      summonHotkey: fillSummonHotkey(raw.summonHotkey),
    },
    trimmed: capped.trimmed,
  };
}

/** get() hands out a shared reference rather than a fresh normalize() per call,
 *  so a caller mutating it would poison every later read. Freezing turns that
 *  into an immediate TypeError instead of silent corruption; writes are rare,
 *  so the walk costs nothing. Every nested object normalize() emits is freshly
 *  built, so nothing shared with DEFAULT_SETTINGS is frozen by this. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

/** Trailing window for deferred writes. An atomic write costs ~5 ms of
 *  synchronous main-process I/O, and zoom is the one setting on a key-repeat
 *  path (⌘+ held down). Throttle, not debounce: the first call sets the
 *  deadline, so persistence latency stays bounded however long the key is held. */
const DEFER_MS = 400;

/** JSON settings at <cwd>/settings.json. `conf` is electron-store's engine,
 *  used directly so this is testable without an Electron runtime. */
export class SettingsStore {
  private conf: Conf<Settings>;
  /** Authoritative between writes. `conf.store` does a readFileSync plus a
   *  JSON.parse on every access, and normalize() rebuilds four records on top —
   *  which one broadcast used to pay about five times over. This store is the
   *  only writer, so re-reading the file per get() bought nothing but
   *  synchronous I/O on the main thread. An edit made to settings.json
   *  underneath a running app is consequently not observed until restart. */
  private cached: Settings;
  private deferred: Partial<Settings> | null = null;
  private deferTimer: ReturnType<typeof setTimeout> | null = null;
  /** Disk writes performed. Exists so the batching this class does can be
   *  asserted rather than assumed. */
  writeCount = 0;
  /** ids the cap disabled when this store first read the file — persisted
   *  immediately so the trim happens once, surfaced so the shell can say so */
  readonly bootTrimmed: ServiceId[];

  constructor(cwd: string) {
    this.conf = new Conf<Settings>({ cwd, configName: 'settings', defaults: DEFAULT_SETTINGS });
    const first = normalize({ ...DEFAULT_SETTINGS, ...this.conf.store });
    this.bootTrimmed = first.trimmed;
    this.cached = deepFreeze(first.settings);
    if (first.trimmed.length > 0) this.write({ disabled: first.settings.disabled });
  }

  get(): Settings {
    return this.cached;
  }

  /** One atomic write per patch, whatever its size. The old per-key conf.set()
   *  loop paid a full ~5 ms write for each key — 12.3 ms on every service
   *  switch, since rememberSurface writes two. */
  update(patch: Partial<Settings>): Settings {
    return this.write(patch);
  }

  /** Cache now, disk shortly. Only for settings whose loss to a hard kill is
   *  harmless — zoom loses one step. NEVER for the remembered surface: it is
   *  written on change precisely because a crash never runs before-quit. */
  updateDeferred(patch: Partial<Settings>): Settings {
    this.deferred = { ...this.deferred, ...patch };
    this.cached = deepFreeze(normalize({ ...this.cached, ...patch }).settings);
    if (!this.deferTimer) this.deferTimer = setTimeout(() => this.flush(), DEFER_MS);
    return this.cached;
  }

  /** Commit a pending deferred patch now. No-op when nothing is pending. */
  flush(): void {
    if (!this.deferred) return;
    this.write({});
  }

  dispose(): void {
    this.flush();
  }

  private write(patch: Partial<Settings>): Settings {
    if (this.deferTimer) {
      clearTimeout(this.deferTimer);
      this.deferTimer = null;
    }
    // an immediate write carries any pending deferred patch with it, so a
    // flush racing an update can never drop the deferred keys
    const merged = this.deferred ? { ...this.deferred, ...patch } : patch;
    this.deferred = null;
    // assigning the store commits in a single _write, where a conf.set() per
    // key paid a full atomic write each. Merging onto the file's own contents
    // keeps exactly the persisted shape the per-key loop produced.
    this.conf.store = { ...this.conf.store, ...merged };
    this.writeCount++;
    this.cached = deepFreeze(normalize({ ...DEFAULT_SETTINGS, ...this.conf.store }).settings);
    return this.cached;
  }
}
