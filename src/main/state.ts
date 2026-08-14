import { serviceById } from '../shared/services';
import type { ServiceId, ServiceRuntime, Settings, ShellState, UpdateState } from '../shared/types';

const defaultRuntime = (): ServiceRuntime => ({
  unread: { direct: 0, indirect: 0 },
  hibernated: false,
  crashed: false,
  stale: false,
  loading: false,
  waking: false,
});

const defaultUpdate = (): UpdateState => ({ status: 'idle', latest: null, announce: null });

export class MainState {
  activeId: ServiceId = 'whatsapp';
  switcherOpen = false;
  settingsOpen = false;
  /** Home (the welcome screen) is a shell surface, not a persisted
   *  preference: a restart lands on the active service. */
  homeOpen = false;
  /** set once at boot from SettingsStore.bootTrimmed; constant for the run */
  capTrimmed: ServiceId[] = [];
  private runtimes = new Map<ServiceId, ServiceRuntime>();
  private listeners: (() => void)[] = [];
  private updateState: UpdateState = defaultUpdate();

  get update(): UpdateState {
    return this.updateState;
  }

  /** Same report-on-change discipline as setRuntime: an identical patch must
   *  not cost a broadcast. */
  setUpdate(patch: Partial<UpdateState>): void {
    const entries = Object.entries(patch) as [keyof UpdateState, string | null][];
    if (entries.every(([k, v]) => this.updateState[k] === v)) return;
    Object.assign(this.updateState, patch);
    this.touch();
  }

  runtime(id: ServiceId): ServiceRuntime {
    let r = this.runtimes.get(id);
    if (!r) {
      r = defaultRuntime();
      this.runtimes.set(id, r);
    }
    return r;
  }

  setRuntime(id: ServiceId, patch: Partial<ServiceRuntime>): void {
    const current = this.runtime(id);
    if (this.isNoOp(current, patch)) return;
    Object.assign(current, patch);
    this.touch();
  }

  private isNoOp(current: ServiceRuntime, patch: Partial<ServiceRuntime>): boolean {
    const entries = Object.entries(patch) as [keyof ServiceRuntime, unknown][];
    for (const [k, v] of entries) {
      if (k === 'unread') {
        const u = v as ServiceRuntime['unread'];
        if (u.direct !== current.unread.direct || u.indirect !== current.unread.indirect) {
          return false;
        }
      } else if (current[k] !== v) {
        return false;
      }
    }
    return true;
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  touch(): void {
    for (const cb of this.listeners) cb();
  }

  snapshot(settings: Settings, theme: 'light' | 'dark', version: string): ShellState {
    const runtime = {} as ShellState['runtime'];
    for (const id of settings.order) runtime[id] = { ...this.runtime(id) };
    return {
      services: settings.order.map(serviceById),
      activeId: this.activeId,
      runtime,
      muted: settings.muted,
      globalMuted: settings.globalMuted,
      switcherOpen: this.switcherOpen,
      settingsOpen: this.settingsOpen,
      homeOpen: this.homeOpen,
      capTrimmed: [...this.capTrimmed],
      theme,
      settings,
      version,
      update: { ...this.updateState },
    };
  }
}
