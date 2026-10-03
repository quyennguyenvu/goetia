import type { ServiceId } from '../shared/types';
import {
  CALLS_CHECK_TIMEOUT_MS,
  CALLS_READY_RECHECK_FLOOR_MS,
  CALLS_TURN_ON_FAILED,
  CALLS_TURN_ON_TIMEOUT_MS,
  type CallsState,
  callsStateOf,
  callsTransition,
  nextCheckDelay,
  parseCallsBlocked,
} from './lib/calls-setting-rules';

/** The two window.__goetia hooks this watcher may call. */
export type CallsHook = 'callsBlocked' | 'allowCalls';

export interface CallsSettingDeps {
  /** The hook's answer from the live page: null with no live view, a
   *  rejection while the page is mid-navigation. */
  exec(id: ServiceId, hook: CallsHook): Promise<unknown> | null;
  /** What the tile draws: ServiceRuntime.callsOffUntil. */
  publish(id: ServiceId, callsOffUntil: number): void;
  note(id: ServiceId, line: string): void;
  now(): number;
}

interface Watch {
  state: CallsState;
  until: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** page calls run one at a time, in order */
  queue: Promise<void>;
  pending: number;
  lastCheckAt: number;
}

const NO_VIEW = Symbol('no view');
const SKIPPED = Symbol('skipped');
const TIMED_OUT = Symbol('timed out');

/** facebook's account-level calls-off switch, kept on the Messenger tile.
 *  Main asks the page through window.__goetia — the page has no channel to
 *  push it — at ready, on CALLS_CHECK_INTERVAL_MS, just after a timed block
 *  ends, and for the user's Turn On, the only caller of allowCalls. Unknown
 *  reads as "not off": a renamed facebook module must never draw a mark. */
export class CallsSettingWatcher {
  private watches = new Map<ServiceId, Watch>();

  constructor(private deps: CallsSettingDeps) {}

  /** service:ready — start watching, or refresh a watch whose last check is
   *  older than the floor; a page may send ready as often as it likes */
  noteReady(id: ServiceId): void {
    const w = this.watches.get(id);
    if (!w) {
      const fresh: Watch = {
        state: 'unset',
        until: 0,
        timer: null,
        queue: Promise.resolve(),
        pending: 0,
        lastCheckAt: Number.NEGATIVE_INFINITY,
      };
      this.watches.set(id, fresh);
      void this.check(id, fresh);
      return;
    }
    if (w.pending === 0 && this.deps.now() - w.lastCheckAt >= CALLS_READY_RECHECK_FLOOR_MS) {
      void this.check(id, w);
    }
  }

  /** the view is gone (hibernation, banish, purge, quit): a sleeping page
   *  cannot ring, so the mark goes with it until the next ready */
  stop(id: ServiceId): void {
    const w = this.watches.get(id);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    this.watches.delete(id);
    this.deps.publish(id, 0);
  }

  dispose(): void {
    for (const w of this.watches.values()) if (w.timer) clearTimeout(w.timer);
    this.watches.clear();
  }

  /** the tile menu's Turn On Incoming Calls */
  turnOn(id: ServiceId): Promise<void> {
    const w = this.watches.get(id);
    if (!w) return Promise.resolve();
    return this.enqueue(w, async () => {
      if (this.watches.get(id) !== w) return;
      const raw = await this.ask(id, 'allowCalls');
      if (this.watches.get(id) !== w) return;
      if (raw === NO_VIEW) {
        this.stop(id);
        return;
      }
      const until =
        raw === SKIPPED || raw === TIMED_OUT ? null : parseCallsBlocked(raw, this.deps.now());
      if (until !== 0) this.deps.note(id, `${id}: ${CALLS_TURN_ON_FAILED}`);
      // an unreadable answer is the action failing, not the setting moving:
      // the next check decides what the tile says
      if (until !== null) this.apply(id, w, until);
      this.schedule(id, w);
    });
  }

  private check(id: ServiceId, w: Watch): Promise<void> {
    if (w.timer) {
      clearTimeout(w.timer);
      w.timer = null;
    }
    return this.enqueue(w, async () => {
      if (this.watches.get(id) !== w) return;
      w.lastCheckAt = this.deps.now();
      const raw = await this.ask(id, 'callsBlocked');
      if (this.watches.get(id) !== w) return;
      if (raw === NO_VIEW) {
        this.stop(id);
        return;
      }
      if (raw !== SKIPPED) {
        this.apply(id, w, raw === TIMED_OUT ? null : parseCallsBlocked(raw, this.deps.now()));
      }
      this.schedule(id, w);
    });
  }

  private enqueue(w: Watch, job: () => Promise<void>): Promise<void> {
    w.pending++;
    w.queue = w.queue
      .then(job)
      .catch(() => {})
      .finally(() => {
        w.pending--;
      });
    return w.queue;
  }

  private async ask(id: ServiceId, hook: CallsHook): Promise<unknown> {
    const answer = this.deps.exec(id, hook);
    if (answer === null) return NO_VIEW;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(
        () => resolve(TIMED_OUT),
        hook === 'allowCalls' ? CALLS_TURN_ON_TIMEOUT_MS : CALLS_CHECK_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([answer, timeout]);
    } catch {
      return SKIPPED; // executeJavaScript rejects while the page navigates
    } finally {
      clearTimeout(timer);
    }
  }

  private apply(id: ServiceId, w: Watch, until: number | null): void {
    const next = callsStateOf(until);
    const line = callsTransition(w.state, next);
    if (line) this.deps.note(id, `${id}: ${line}`);
    w.state = next;
    w.until = until ?? 0;
    this.deps.publish(id, w.until);
  }

  private schedule(id: ServiceId, w: Watch): void {
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(
      () => {
        w.timer = null;
        void this.check(id, w);
      },
      nextCheckDelay(w.until, this.deps.now()),
    );
  }
}
