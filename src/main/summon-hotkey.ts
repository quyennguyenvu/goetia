import { globalShortcut } from 'electron';

/** One registration at a time; apply() swaps it to match the setting and
 *  reports whether the OS granted the combo (off is never a failure). */
export class SummonHotkey {
  private registered: string | null = null;

  constructor(private onSummon: () => void) {}

  apply(setting: { enabled: boolean; accelerator: string }): boolean {
    if (this.registered) {
      globalShortcut.unregister(this.registered);
      this.registered = null;
    }
    if (!setting.enabled) return true;
    const ok = globalShortcut.register(setting.accelerator, this.onSummon);
    if (ok) this.registered = setting.accelerator;
    return ok;
  }

  dispose(): void {
    if (this.registered) {
      globalShortcut.unregister(this.registered);
      this.registered = null;
    }
  }
}
