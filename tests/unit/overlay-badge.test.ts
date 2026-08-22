import { describe, expect, it } from 'vitest';
import { overlayNeedsUpdate } from '../../src/renderer/src/components/overlay-badge';

// R5: App.tsx's effect keyed on [state], and snapshot() returns a fresh object
// per broadcast — so every broadcast built a canvas, PNG-encoded it and shipped
// the data URL over IPC, after which applyOverlay discarded it on non-Windows.
describe('overlayNeedsUpdate', () => {
  it('never redraws on platforms with no taskbar overlay', () => {
    expect(overlayNeedsUpdate({ platform: 'darwin', total: 3, lastSent: null })).toBe(false);
    expect(overlayNeedsUpdate({ platform: 'linux', total: 3, lastSent: null })).toBe(false);
    expect(overlayNeedsUpdate({ platform: 'darwin', total: 0, lastSent: 5 })).toBe(false);
  });

  it('redraws on Windows only when the count changed', () => {
    expect(overlayNeedsUpdate({ platform: 'win32', total: 3, lastSent: null })).toBe(true);
    expect(overlayNeedsUpdate({ platform: 'win32', total: 3, lastSent: 3 })).toBe(false);
    expect(overlayNeedsUpdate({ platform: 'win32', total: 4, lastSent: 3 })).toBe(true);
  });

  it('redraws to clear the overlay when the count falls to zero', () => {
    expect(overlayNeedsUpdate({ platform: 'win32', total: 0, lastSent: 3 })).toBe(true);
  });

  it('asserts the initial empty state once, so a stale overlay is cleared', () => {
    expect(overlayNeedsUpdate({ platform: 'win32', total: 0, lastSent: null })).toBe(true);
    expect(overlayNeedsUpdate({ platform: 'win32', total: 0, lastSent: 0 })).toBe(false);
  });
});
