import { describe, expect, it } from 'vitest';
import { endsWake, type WakeEnd } from '../../src/main/lib/waking-rules';
import type { ServiceMeta } from '../../src/shared/types';

function meta(waitForReady?: true): ServiceMeta {
  return {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://example.test/',
    color: '#fff',
    waitForReady,
  };
}

describe('endsWake', () => {
  it('load-finished reveals only services without a ready() check', () => {
    expect(endsWake('load-finished', meta())).toBe(true);
    expect(endsWake('load-finished', meta(true))).toBe(false);
  });

  it('every other end event always reveals', () => {
    const events: WakeEnd[] = ['recipe-ready', 'timeout', 'crashed', 'load-failed', 'destroyed'];
    for (const e of events) {
      expect(endsWake(e, meta(true))).toBe(true);
      expect(endsWake(e, meta())).toBe(true);
    }
  });
});
