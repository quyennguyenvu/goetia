import type { Accelerators, RebindableId, RecordResult } from '../shared/shortcuts';
import { chordFromInput, RECORD_TIMEOUT_MS, recordVerdict } from './lib/shortcut-rules';
import type { KeyInput } from './lib/shortcuts';

interface Pending {
  id: RebindableId;
  resolve: (r: RecordResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One recording at a time, fed from the shell window's before-input-event.
 *  While pending, every key is preventDefault'ed — that is what keeps ⌘K
 *  from opening the switcher through the menu accelerator while the user is
 *  trying to record it, and keeps the renderer from seeing the keydown. The
 *  first full chord ends the recording with a verdict; Escape, the timeout,
 *  cancel() (Settings closing, the lock engaging) or a newer start() end it
 *  as `cancelled`. Electron-free: the caller hands in the event. */
export class ShortcutRecorder {
  private pending: Pending | null = null;

  constructor(private deps: { resolved(): Accelerators; platform: string }) {}

  recording(): boolean {
    return this.pending !== null;
  }

  start(id: RebindableId): Promise<RecordResult> {
    this.cancel();
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => this.finish({ ok: false, reason: 'cancelled' }),
        RECORD_TIMEOUT_MS,
      );
      this.pending = { id, resolve, timer };
    });
  }

  onInput(e: { preventDefault(): void }, input: KeyInput): void {
    const p = this.pending;
    if (!p) return;
    e.preventDefault();
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape') {
      this.finish({ ok: false, reason: 'cancelled' });
      return;
    }
    const chord = chordFromInput(input, this.deps.platform);
    if (!chord) return; // a bare modifier: the chord is still being pressed
    this.finish(recordVerdict(p.id, chord, this.deps.resolved()));
  }

  cancel(): void {
    if (this.pending) this.finish({ ok: false, reason: 'cancelled' });
  }

  private finish(r: RecordResult): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.resolve(r);
  }
}
