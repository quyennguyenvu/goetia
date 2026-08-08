import { isNewer, LATEST_RELEASE_API, parseLatestRelease } from './lib/update-check';
import type { MainState } from './state';

/** Late enough that it never competes with service view boot. */
export const FIRST_CHECK_MS = 10_000;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 10_000;

export interface UpdateCheckerDeps {
  /** the running app version, i.e. app.getVersion() */
  version: string;
  state: MainState;
  /** settings.checkForUpdates */
  autoEnabled(): boolean;
  /** settings.lastNotifiedVersion */
  lastNotified(): string | null;
  setLastNotified(version: string): void;
  /** a hidden window must not be toasted at */
  isVisible(): boolean;
  fetchFn?: typeof fetch;
}

/** Polls GitHub Releases and writes the result into MainState. Owns no
 *  electron objects: everything it needs arrives as a function. */
export class UpdateChecker {
  private inFlight: Promise<void> | null = null;
  private pending: string | null = null;
  private first: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly deps: UpdateCheckerDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  start(): void {
    if (this.interval) return;
    this.first = setTimeout(() => void this.check('auto'), FIRST_CHECK_MS);
    this.interval = setInterval(() => void this.check('auto'), CHECK_INTERVAL_MS);
  }

  dispose(): void {
    if (this.first) clearTimeout(this.first);
    if (this.interval) clearInterval(this.interval);
    this.first = null;
    this.interval = null;
  }

  check(reason: 'auto' | 'manual'): Promise<void> {
    if (reason === 'auto' && !this.deps.autoEnabled()) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (reason === 'manual') this.deps.state.setUpdate({ status: 'checking' });
    this.inFlight = this.run(reason).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Wire to the window's `show` event. */
  flushAnnounce(): void {
    const version = this.pending;
    if (!version) return;
    this.pending = null;
    this.announce(version);
  }

  private async run(reason: 'auto' | 'manual'): Promise<void> {
    try {
      const res = await this.fetchFn(LATEST_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': `Goetia/${this.deps.version}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const latest = parseLatestRelease(await res.json());
      if (!latest) throw new Error('unrecognized release payload');
      this.apply(latest);
    } catch {
      // being offline is not news: only a check the user asked for reports back
      if (reason === 'manual') this.deps.state.setUpdate({ status: 'error' });
    }
  }

  private apply(latest: string): void {
    if (!isNewer(this.deps.version, latest)) {
      this.deps.state.setUpdate({ status: 'current', latest: null });
      return;
    }
    this.deps.state.setUpdate({ status: 'available', latest });
    this.announce(latest);
  }

  /** Toast once per version, and never at a window nobody can see. */
  private announce(version: string): void {
    if (this.deps.lastNotified() === version) return;
    if (!this.deps.isVisible()) {
      this.pending = version;
      return;
    }
    this.deps.setLastNotified(version);
    this.deps.state.setUpdate({ announce: version });
  }
}
