import { describe, expect, it } from 'vitest';
import { commitNumberDraft } from '../../src/renderer/src/components/number-field';

// 2026-11-13 audit: the fields saved on every keystroke, so typing "15" over
// 30 saved the "1" clamped to 5 and then made "55" of it.
describe('commitNumberDraft', () => {
  it('takes what was typed, held to the field range', () => {
    expect(commitNumberDraft('15', 5, 240)).toBe(15);
    expect(commitNumberDraft('1', 5, 240)).toBe(5);
    expect(commitNumberDraft('305', 5, 240)).toBe(240);
  });

  it('saves nothing for an empty or unreadable draft', () => {
    expect(commitNumberDraft('', 5, 240)).toBeNull();
    expect(commitNumberDraft('  ', 5, 240)).toBeNull();
    expect(commitNumberDraft('soon', 5, 240)).toBeNull();
  });
});
