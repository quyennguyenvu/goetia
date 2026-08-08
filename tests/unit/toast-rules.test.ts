import { describe, expect, it } from 'vitest';
import { shouldToast, TOAST_MS } from '../../src/renderer/src/components/toast-rules';

describe('shouldToast', () => {
  it('announces a version the shell has not shown yet', () => {
    expect(shouldToast('0.3.0', null)).toBe(true);
    expect(shouldToast('0.3.1', '0.3.0')).toBe(true);
  });

  // shell:state is re-broadcast on every unrelated change; a repeat of the
  // same announce value must not re-toast
  it('ignores a repeat of the version it already showed', () => {
    expect(shouldToast('0.3.0', '0.3.0')).toBe(false);
  });

  it('never toasts when nothing is announced', () => {
    expect(shouldToast(null, null)).toBe(false);
    expect(shouldToast(null, '0.3.0')).toBe(false);
  });
});

describe('TOAST_MS', () => {
  it('is the eight seconds the design specifies', () => {
    expect(TOAST_MS).toBe(8000);
  });
});
