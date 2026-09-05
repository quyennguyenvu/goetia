import { describe, expect, it } from 'vitest';
import { MainLoads } from '../../src/main/lib/main-loads';

// the waking cover is for loads main asked for (cold start, reload, a dead
// view's banner open); a navigation the page made on its own — the in-page
// route's fallback load, a site's own full-page thread switch — is not one.
// The mark carries WHICH load, so the cover can name it.
describe('MainLoads', () => {
  it('a marked load is claimed by the first navigation, once, with its kind', () => {
    const loads = new MainLoads();
    loads.mark('messenger', 'reload');
    expect(loads.claim('messenger')).toBe('reload');
    expect(loads.claim('messenger')).toBeNull();
  });

  it('a navigation nobody asked for claims nothing', () => {
    expect(new MainLoads().claim('messenger')).toBeNull();
  });

  it('marks are per service', () => {
    const loads = new MainLoads();
    loads.mark('discord', 'wake');
    expect(loads.claim('messenger')).toBeNull();
    expect(loads.claim('discord')).toBe('wake');
  });

  // the later load is the one the navigation belongs to
  it('a second mark before the navigation replaces the kind', () => {
    const loads = new MainLoads();
    loads.mark('messenger', 'wake');
    loads.mark('messenger', 'purge');
    expect(loads.claim('messenger')).toBe('purge');
  });

  // a destroyed view's pending mark must not cover its successor's first
  // page-initiated navigation
  it('forget drops a pending mark', () => {
    const loads = new MainLoads();
    loads.mark('messenger', 'wake');
    loads.forget('messenger');
    expect(loads.claim('messenger')).toBeNull();
  });
});
