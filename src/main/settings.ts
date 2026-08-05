import Conf from 'conf';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

/** JSON settings at <cwd>/settings.json. `conf` is electron-store's engine,
 *  used directly so this is testable without an Electron runtime. */
export class SettingsStore {
  private conf: Conf<Settings>;

  constructor(cwd: string) {
    this.conf = new Conf<Settings>({ cwd, configName: 'settings', defaults: DEFAULT_SETTINGS });
  }

  get(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.conf.store };
  }

  update(patch: Partial<Settings>): Settings {
    for (const [k, v] of Object.entries(patch)) {
      this.conf.set(k as keyof Settings, v as Settings[keyof Settings]);
    }
    return this.get();
  }
}
