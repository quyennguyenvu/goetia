import { describe, expect, it } from 'vitest';
import { unreadFromTitle } from '../../src/preload/recipes/title';

describe('unreadFromTitle', () => {
  it.each([
    ['(3) WhatsApp', 3],
    ['(12) Telegram', 12],
    ['(1) Messenger', 1],
    ['(7) Discord | Friends', 7],
    ['WhatsApp', 0],
    ['Zalo - Đăng nhập', 0],
    ['', 0],
  ])('%s -> %d', (title, expected) => {
    expect(unreadFromTitle(title)).toBe(expected);
  });
});
