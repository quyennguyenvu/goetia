// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { installVisibilitySpoof } from '../../src/preload/lib/visibility-spoof';

describe('visibility spoof', () => {
  it('pins visibilityState/hidden to visible', () => {
    installVisibilitySpoof(window);
    expect(document.visibilityState).toBe('visible');
    expect(document.hidden).toBe(false);
  });

  it('blocks visibilitychange from reaching page listeners', () => {
    installVisibilitySpoof(window);
    const pageListener = vi.fn();
    document.addEventListener('visibilitychange', pageListener);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pageListener).not.toHaveBeenCalled();
  });
});
