import { describe, expect, it } from 'vitest';
import { MAX_SERVICE_ACCELERATORS } from '../../src/main/lib/service-accelerator';
import { MAX_SUMMONED } from '../../src/shared/welcome';

describe('summon cap', () => {
  // the cap exists because ⌘/Ctrl 1…9 runs out; the two must never drift
  it('equals the service-accelerator ceiling', () => {
    expect(MAX_SUMMONED).toBe(MAX_SERVICE_ACCELERATORS);
  });
});
