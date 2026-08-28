// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clampText, PIN_CONVERSATION_MAX } from '../../src/main/lib/pin-rules';
import { openWhatsAppConversation, whatsAppConversation } from '../../src/preload/recipes/whatsapp';

// the fixture mirrors the live web.whatsapp.com DOM (2026-08-27 dump); the
// open chat is the long-named group, so the header's member list sits right
// beside the name as the only span[title] in the header
const PAGE = readFileSync(join(__dirname, '../fixtures/whatsapp-chat.html'), 'utf8');
const LONG_NAME =
  'Weekend hikers — Sunday 6am carpool from the north gate, bring water and a headlamp';

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

/** click listeners on every row, keyed by the row's list-item index */
function watchRows() {
  const seen: string[] = [];
  document.querySelectorAll('[role="row"]').forEach((row, i) => {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      row.addEventListener(t, () => seen.push(`${i}:${t}`));
    }
  });
  return seen;
}

describe('whatsAppConversation', () => {
  it("reads the open chat's name, not its member list", () => {
    expect(whatsAppConversation(document)).toBe(LONG_NAME);
  });

  it('is null with no chat open', () => {
    document.querySelector('#main')?.remove();
    expect(whatsAppConversation(document)).toBeNull();
  });
});

describe('openWhatsAppConversation', () => {
  it('replays a press that bubbles through the named row', () => {
    const seen = watchRows();
    expect(openWhatsAppConversation(document, 'Alice Nguyen')).toBe(true);
    expect(seen).toEqual(['1:mousedown', '1:mouseup', '1:click']);
  });

  it('matches the chat title, never a message preview that reads the same', () => {
    const seen = watchRows();
    expect(openWhatsAppConversation(document, 'Design team')).toBe(true);
    expect(seen).toEqual(['0:mousedown', '0:mouseup', '0:click']);
  });

  it('finds a chat whose pinned name was clamped with an ellipsis', () => {
    const pinned = clampText(LONG_NAME, PIN_CONVERSATION_MAX);
    expect(pinned.endsWith('…')).toBe(true);
    const seen = watchRows();
    expect(openWhatsAppConversation(document, pinned)).toBe(true);
    expect(seen[0]).toBe('2:mousedown');
  });

  it('reports false for a name that is not a list row, clicking nothing', () => {
    const seen = watchRows();
    const clicked = vi.fn();
    document.querySelector('header')?.addEventListener('click', clicked);
    expect(openWhatsAppConversation(document, 'Alice, Bob, Chi, You')).toBe(false);
    expect(openWhatsAppConversation(document, 'nobody')).toBe(false);
    expect(seen).toEqual([]);
    expect(clicked).not.toHaveBeenCalled();
  });
});
