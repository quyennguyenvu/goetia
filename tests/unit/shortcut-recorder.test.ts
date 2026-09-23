import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORD_TIMEOUT_MS } from '../../src/main/lib/shortcut-rules';
import type { KeyInput } from '../../src/main/lib/shortcuts';
import { ShortcutRecorder } from '../../src/main/shortcut-recorder';
import { resolveAccelerators } from '../../src/shared/shortcuts';

const press = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keyDown',
  key: '',
  code: '',
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...over,
});

function harness() {
  const recorder = new ShortcutRecorder({
    resolved: () => resolveAccelerators({}),
    platform: 'darwin',
  });
  const e = { preventDefault: vi.fn() };
  return { recorder, e };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ShortcutRecorder', () => {
  it('is inert while idle', () => {
    const { recorder, e } = harness();
    recorder.onInput(e, press({ code: 'KeyE', meta: true, shift: true }));
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(recorder.recording()).toBe(false);
  });

  it('swallows every event while recording and resolves on the first full chord', async () => {
    const { recorder, e } = harness();
    const p = recorder.start('home');
    expect(recorder.recording()).toBe(true);
    recorder.onInput(e, press({ type: 'keyDown', code: 'ShiftLeft', shift: true })); // bare modifier
    recorder.onInput(e, press({ type: 'keyUp', code: 'KeyE', meta: true, shift: true })); // key-up
    recorder.onInput(e, press({ code: 'KeyE', meta: true, shift: true }));
    expect(e.preventDefault).toHaveBeenCalledTimes(3);
    await expect(p).resolves.toEqual({ ok: true, patch: { home: 'CmdOrCtrl+Shift+E' } });
    expect(recorder.recording()).toBe(false);
  });

  it('resolves a refusal and goes idle — the pane re-asks', async () => {
    const { recorder, e } = harness();
    const p = recorder.start('pinSelection');
    recorder.onInput(e, press({ key: 'k', code: 'KeyK', meta: true }));
    await expect(p).resolves.toEqual({
      ok: false,
      reason: 'taken',
      chord: 'CmdOrCtrl+K',
      takenBy: 'switcher',
    });
    expect(recorder.recording()).toBe(false);
  });

  it('cancels on Escape, on timeout, on cancel(), and when a second start takes over', async () => {
    const { recorder, e } = harness();
    const a = recorder.start('home');
    recorder.onInput(e, press({ key: 'Escape', code: 'Escape' }));
    await expect(a).resolves.toEqual({ ok: false, reason: 'cancelled' });

    const b = recorder.start('home');
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS);
    await expect(b).resolves.toEqual({ ok: false, reason: 'cancelled' });

    const c = recorder.start('home');
    recorder.cancel();
    await expect(c).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(recorder.recording()).toBe(false);

    const d = recorder.start('home');
    const f = recorder.start('lock');
    await expect(d).resolves.toEqual({ ok: false, reason: 'cancelled' });
    recorder.onInput(e, press({ code: 'KeyE', meta: true, shift: true }));
    await expect(f).resolves.toEqual({ ok: true, patch: { lock: 'CmdOrCtrl+Shift+E' } });
  });
});
