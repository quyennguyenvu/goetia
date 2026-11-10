import { describe, expect, it } from 'vitest';
import { revealLabel, TOAST_MS } from '../../src/shared/toast';

describe('shared toast constants', () => {
  it('keeps the toasts at eight seconds', () => {
    expect(TOAST_MS).toBe(8000);
  });

  it('names the reveal the way each platform does', () => {
    expect(revealLabel('darwin')).toBe('Show in Finder');
    expect(revealLabel('win32')).toBe('Show in folder');
    expect(revealLabel('linux')).toBe('Show in folder');
  });
});
