import { serviceById } from '../shared/services';
import type { ServiceId, ServiceRuntime, Settings, ShellState } from '../shared/types';

const defaultRuntime = (): ServiceRuntime => ({
  unread: { direct: 0, indirect: 0 },
  hibernated: false,
  crashed: false,
  stale: false,
  loading: false,
  waking: false,
});

export class MainState {
  activeId: ServiceId = 'whatsapp';
  switcherOpen = false;
  settingsOpen = false;
  private runtimes = new Map<ServiceId, ServiceRuntime>();
  private listeners: (() => void)[] = [];

  runtime(id: ServiceId): ServiceRuntime {
    let r = this.runtimes.get(id);
    if (!r) {
      r = defaultRuntime();
      this.runtimes.set(id, r);
    }
    return r;
  }

  setRuntime(id: ServiceId, patch: Partial<ServiceRuntime>): void {
    Object.assign(this.runtime(id), patch);
    this.touch();
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
      theme,
      settings,
      version,
    };
  }
}
