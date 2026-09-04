import { describe, expect, it } from 'vitest';
import { MainLoads } from '../../src/main/lib/main-loads';

// the waking cover is for loads main asked for (cold start, reload, a dead
// view's banner open); a navigation the page made on its own — the in-page
// route's fallback load, a site's own full-page thread switch — is not one
describe('MainLoads', () => {
  it('a marked load is claimed by the first navigation, once', () => {
    const loads = new MainLoads();
    loads.mark('messenger');
    expect(loads.claim('messenger')).toBe(true);
    expect(loads.claim('messenger')).toBe(false);
  });

  it('a navigation nobody asked for claims nothing', () => {
    expect(new MainLoads().claim('messenger')).toBe(false);
  });

  it('marks are per service', () => {
    const loads = new MainLoads();
    loads.mark('discord');
    expect(loads.claim('messenger')).toBe(false);
    expect(loads.claim('discord')).toBe(true);
  });

  // a destroyed view's pending mark must not cover its successor's first
  // page-initiated navigation
  it('forget drops a pending mark', () => {
    const loads = new MainLoads();
    loads.mark('messenger');
    loads.forget('messenger');
    expect(loads.claim('messenger')).toBe(false);
  });
});
