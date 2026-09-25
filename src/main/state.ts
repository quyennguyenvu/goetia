import { serviceById } from '../shared/services';
import type {
  PinView,
  ServiceId,
  ServiceRuntime,
  Settings,
  SettingsFocus,
  ShellState,
  UpdateState,
} from '../shared/types';
import type { Walk } from './lib/recents-walk';

const defaultRuntime = (): ServiceRuntime => ({
  unread: { direct: 0, indirect: 0 },
  hibernated: false,
  crashed: false,
  stale: false,
  loading: false,
  waking: false,
  wakeKind: null,
});

const defaultUpdate = (): UpdateState => ({ status: 'idle', latest: null, announce: null });

export class MainState {
  activeId: ServiceId = 'whatsapp';
  switcherOpen = false;
  settingsOpen = false;
  /** Home (the welcome screen) is a shell surface, not a persisted
   *  preference: a restart lands on the active service. */
  homeOpen = false;
  /** the pane a main-side command asked Settings to open on (⌘⇧D); cleared
   *  by setOverlayOpen when Settings closes, so it never re-selects later */
  settingsFocus: SettingsFocus | null = null;
  /** The lock screen is up. Joins anyOverlayOpen, so every service view is
   *  hidden by the same machinery settings and Home already use. */
  locked = false;
  /** Whether Touch ID answered "can prompt" at the last sample (boot and
   *  window focus). Sampled rather than read per broadcast: canPromptTouchID
   *  is a synchronous system call and broadcasts are frequent. */
  touchIdAvailable = false;
  /** set once at boot from SettingsStore.bootTrimmed; constant for the run */
  capTrimmed: ServiceId[] = [];
  /** set by the summon-hotkey wiring; true when disabled or registered */
  summonHotkeyOk = true;
  /** the chord walk in flight (lib/recents-walk.ts): a snapshot of ⌘K's
   *  Recent order, the cursor and a deadline; in-memory and never broadcast.
   *  Cleared by activateService, so any other activation ends it. */
  walk: Walk | null = null;
  /** the Recent row key (recents-rules conversationKey) each service last
   *  reported on screen; read only for the active service while Home is
   *  closed. In-memory, never broadcast. */
  onScreen = new Map<ServiceId, string>();
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

  snapshot(
    settings: Settings,
    theme: 'light' | 'dark',
    version: string,
    quietActive: boolean,
    pins: PinView[] = [],
    lockConfigured = false,
    pinsUnreadable = false,
  ): ShellState {
    const runtime = {} as ShellState['runtime'];
    for (const id of settings.order) runtime[id] = { ...this.runtime(id) };
    return {
      services: settings.order.map(serviceById),
      activeId: this.activeId,
      runtime,
      muted: settings.muted,
      mutedUntil: settings.mutedUntil,
      globalMuted: settings.globalMuted,
      globalMutedUntil: settings.globalMutedUntil,
      quietActive,
      summonHotkeyOk: this.summonHotkeyOk,
      switcherOpen: this.switcherOpen,
      settingsOpen: this.settingsOpen,
      homeOpen: this.homeOpen,
      settingsFocus: this.settingsFocus,
      capTrimmed: [...this.capTrimmed],
      // pinned text is conversation content; a locked app hands the renderer
      // none of it, so not even devtools on the shell shows a message
      pins: this.locked ? [] : pins,
      pinsUnreadable: this.locked ? false : pinsUnreadable,
      locked: this.locked,
      lockConfigured,
      touchIdAvailable: this.touchIdAvailable,
      theme,
      settings,
      version,
      update: { ...this.updateState },
    };
  }
}
