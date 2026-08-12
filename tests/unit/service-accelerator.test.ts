import { describe, expect, it } from 'vitest';
import {
  MAX_SERVICE_ACCELERATORS,
  serviceAccelerator,
} from '../../src/main/lib/service-accelerator';

describe('serviceAccelerator', () => {
  it('numbers the first service from 1, not 0', () => {
    expect(serviceAccelerator(0)).toBe('CmdOrCtrl+1');
  });

  it('covers every position up to the ninth', () => {
    const accelerators = Array.from({ length: MAX_SERVICE_ACCELERATORS }, (_, i) =>
      serviceAccelerator(i),
    );
    expect(accelerators).toEqual([
      'CmdOrCtrl+1',
      'CmdOrCtrl+2',
      'CmdOrCtrl+3',
      'CmdOrCtrl+4',
      'CmdOrCtrl+5',
      'CmdOrCtrl+6',
      'CmdOrCtrl+7',
      'CmdOrCtrl+8',
      'CmdOrCtrl+9',
    ]);
  });

  it('never emits a multi-digit key — the accelerator parser rejects those', () => {
    for (let i = MAX_SERVICE_ACCELERATORS; i < MAX_SERVICE_ACCELERATORS + 20; i++) {
      expect(serviceAccelerator(i)).toBeUndefined();
    }
  });

  it('leaves CmdOrCtrl+0 to Home', () => {
    const accelerators = Array.from({ length: 40 }, (_, i) => serviceAccelerator(i));
    expect(accelerators).not.toContain('CmdOrCtrl+0');
  });
});
