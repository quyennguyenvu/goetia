// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clampText, PIN_CONVERSATION_MAX } from '../../src/main/lib/pin-rules';
import zalo, { openZaloConversation, zaloConversation } from '../../src/preload/recipes/zalo';

// the fixture mirrors the live chat.zalo.me DOM (2026-08-28 dump); the open
// conversation is "Design team", the list has a pinned cloud row, a community
// with a long NBSP-joined name, and a preview that names another chat's sender
const PAGE = readFileSync(join(__dirname, '../fixtures/zalo-chat.html'), 'utf8');
const COMMUNITY =
  '🏘 Khu phố 17 - Cư dân chính thức - Thông báo và trao đổi chung của tổ dân phố, mọi thắc mắc liên hệ ban quản lý';

type Rect = { x: number; y: number; width: number; height: number };
const rect = (r: Rect) => () => ({
  ...r,
  top: r.y,
  left: r.x,
  right: r.x + r.width,
  bottom: r.y + r.height,
});

/** lay the list out: 320px wide from y=80, each row 64px tall */
function layout(): Element[] {
  const list = document.querySelector('#conversationList');
  if (!list) throw new Error('no list');
  (list as HTMLElement).getBoundingClientRect = rect({
    x: 0,
    y: 80,
    width: 320,
    height: 400,
  }) as never;
  const items = [...document.querySelectorAll('.msg-item')];
  items.forEach((item, i) => {
    (item as HTMLElement).getBoundingClientRect = rect({
      x: 0,
      y: 80 + i * 64,
      width: 320,
      height: 64,
    }) as never;
  });
  return items;
}

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

describe('zaloConversation', () => {
  it('reads the open conversation from the chat header, whitespace normalized', () => {
    expect(zaloConversation(document)).toBe('Design team');
  });

  it('is null with no conversation open', () => {
    document.querySelector('.threadChat__title')?.remove();
    expect(zaloConversation(document)).toBeNull();
  });
});

describe('openZaloConversation', () => {
  it("returns the named row's centre for main to click — Zalo ignores synthetic clicks", () => {
    layout();
    // row 2 (index) spans y 208..272
    expect(openZaloConversation(document, 'Alice Nguyen')).toEqual({ x: 160, y: 240 });
  });

  it('matches a long NBSP-joined community name against its clamped pin label', () => {
    layout();
    const pinned = clampText(COMMUNITY, PIN_CONVERSATION_MAX);
    expect(pinned.endsWith('…')).toBe(true);
    expect(openZaloConversation(document, pinned)).toEqual({ x: 160, y: 176 });
  });

  it('never matches a preview sender, only the row title', () => {
    layout();
    // "Alice Nguyen" is also the sender named in the community's preview,
    // which sits above her own row — her row is what must be hit
    expect(openZaloConversation(document, 'Alice Nguyen')).toMatchObject({ y: 240 });
    expect(openZaloConversation(document, 'ok gặp sau nhé')).toBe(false);
  });

  it('scrolls a rendered-but-offscreen row into the list before measuring', () => {
    const items = layout();
    const alice = items[2] as HTMLElement;
    alice.getBoundingClientRect = rect({ x: 0, y: 700, width: 320, height: 64 }) as never;
    alice.scrollIntoView = vi.fn(() => {
      alice.getBoundingClientRect = rect({ x: 0, y: 400, width: 320, height: 64 }) as never;
    });
    expect(openZaloConversation(document, 'Alice Nguyen')).toEqual({ x: 160, y: 432 });
    expect(alice.scrollIntoView).toHaveBeenCalled();
  });

  it('gives up on a row that cannot be brought inside the list', () => {
    const items = layout();
    const alice = items[2] as HTMLElement;
    alice.getBoundingClientRect = rect({ x: 0, y: 700, width: 320, height: 64 }) as never;
    alice.scrollIntoView = vi.fn();
    expect(openZaloConversation(document, 'Alice Nguyen')).toBe(false);
  });

  it('trusts an unlaid-out page (zero rects) the way keepAlive does', () => {
    // happy-dom reports zero rects; a real view mid-boot can too — a point
    // is still the best answer, main decides whether the view is ready
    expect(openZaloConversation(document, 'Design team')).toEqual({ x: 0, y: 0 });
  });

  it('is false for a name no row carries', () => {
    layout();
    expect(openZaloConversation(document, 'nobody')).toBe(false);
  });
});

describe('recipe wiring', () => {
  it('exposes both hooks', () => {
    expect(zalo.conversation).toBe(zaloConversation);
    expect(zalo.openConversation).toBe(openZaloConversation);
  });
});
