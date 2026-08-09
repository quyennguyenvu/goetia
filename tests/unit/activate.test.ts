import { describe, expect, it, vi } from 'vitest';
import { activateService } from '../../src/main/activate';
import type { AppContext } from '../../src/main/ipc-handlers';
import { MainState } from '../../src/main/state';

// activate.ts imports AppContext as a type only, so pulling it in here does not
// load electron — a partial ctx with a real MainState is enough.
function makeCtx(state: MainState, activate = vi.fn()): AppContext {
  return { state, views: { activate }, noteActivated: vi.fn() } as unknown as AppContext;
}

describe('activateService', () => {
  it('notifies subscribers when switching to a non-hibernated service', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    // discord starts non-hibernated, so the incidental setRuntime is a no-op —
    // activation itself must still broadcast, or the rail/content never update
    activateService(makeCtx(state), 'discord');
    expect(state.activeId).toBe('discord');
    expect(cb).toHaveBeenCalled();
  });

  it('switches the native view to the target service', () => {
    const state = new MainState();
    const activate = vi.fn();
    activateService(makeCtx(state, activate), 'telegram');
    expect(activate).toHaveBeenCalledWith('telegram');
  });

  it('leaves home when a service is activated', () => {
    const state = new MainState();
    state.homeOpen = true;
    state.settingsOpen = true;
    state.switcherOpen = true;
    activateService(makeCtx(state), 'zalo');
    expect(state.homeOpen).toBe(false);
    expect(state.settingsOpen).toBe(false);
    expect(state.switcherOpen).toBe(false);
  });
});
