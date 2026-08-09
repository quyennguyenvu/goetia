import { describe, expect, it } from 'vitest';
import { anyOverlayOpen } from '../../src/main/lib/overlay-rules';

const flags = (patch: Partial<Parameters<typeof anyOverlayOpen>[0]> = {}) => ({
  settingsOpen: false,
  switcherOpen: false,
  homeOpen: false,
  ...patch,
});

describe('anyOverlayOpen', () => {
  it('is false when every surface is closed', () => {
    expect(anyOverlayOpen(flags())).toBe(false);
  });

  it('is true for settings alone', () => {
    expect(anyOverlayOpen(flags({ settingsOpen: true }))).toBe(true);
  });

  it('is true for the quick switcher alone', () => {
    expect(anyOverlayOpen(flags({ switcherOpen: true }))).toBe(true);
  });

  it('is true for home alone', () => {
    expect(anyOverlayOpen(flags({ homeOpen: true }))).toBe(true);
  });

  it('is true when several are open at once', () => {
    expect(anyOverlayOpen(flags({ homeOpen: true, settingsOpen: true }))).toBe(true);
  });
});
