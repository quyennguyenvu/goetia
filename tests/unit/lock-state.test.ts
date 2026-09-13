import { describe, expect, it } from 'vitest';
import { MainState } from '../../src/main/state';
import { DEFAULT_SETTINGS, type PinView } from '../../src/shared/types';

const pin = (id: number): PinView => ({
  id,
  serviceId: 'whatsapp',
  text: 'the rent is due friday',
  note: '',
  conversation: 'Landlord',
  at: 1,
});

const snap = (state: MainState, pins: PinView[], configured = false) =>
  state.snapshot(DEFAULT_SETTINGS, 'dark', '1.0.0', false, pins, configured);

describe('MainState locked snapshot', () => {
  it('starts unlocked with no sensor assumed', () => {
    const state = new MainState();
    expect(state.locked).toBe(false);
    expect(snap(state, []).locked).toBe(false);
    expect(snap(state, []).touchIdAvailable).toBe(false);
  });

  it('broadcasts the pinboard while unlocked', () => {
    const state = new MainState();
    expect(snap(state, [pin(1), pin(2)]).pins).toHaveLength(2);
  });

  // pinned text is the one piece of conversation content that touches disk;
  // it must not reach the renderer at all while the app is locked
  it('withholds every pin while locked', () => {
    const state = new MainState();
    state.locked = true;
    const s = snap(state, [pin(1), pin(2)]);
    expect(s.pins).toEqual([]);
    expect(JSON.stringify(s)).not.toContain('rent is due');
    expect(JSON.stringify(s)).not.toContain('Landlord');
  });

  it('still broadcasts counts while locked — a badge is not content', () => {
    const state = new MainState();
    state.setRuntime('whatsapp', { unread: { direct: 4, indirect: 0 } });
    state.locked = true;
    expect(snap(state, []).runtime.whatsapp.unread.direct).toBe(4);
  });

  it('carries the configured flag and the sensor answer through', () => {
    const state = new MainState();
    state.touchIdAvailable = true;
    expect(snap(state, [], true).lockConfigured).toBe(true);
    expect(snap(state, [], true).touchIdAvailable).toBe(true);
  });
});
