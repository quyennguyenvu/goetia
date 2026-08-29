// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import tiktok from '../../src/preload/recipes/tiktok';

// live www.tiktok.com/messages, 2026-08-29: "Tonn" is open and read, its last
// message literally "2"; "Ho Hng" has 2 unread
const PAGE = readFileSync(join(__dirname, '../fixtures/tiktok.html'), 'utf8');

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

describe('tiktok.count', () => {
  it('reads the header badge', async () => {
    expect(await tiktok.count(document)).toEqual({ direct: 2, indirect: 0 });
  });

  it('falls back to the side-nav total when the header carries no badge', async () => {
    document.querySelector('[data-e2e="top-dm-icon"] sup')?.remove();
    expect(await tiktok.count(document)).toEqual({ direct: 2, indirect: 0 });
  });
});

describe('tiktok.synthNotification', () => {
  it('names the row carrying the unread badge, skipping read rows', () => {
    expect(tiktok.synthNotification?.(document)).toEqual({ title: 'Ho Hng', body: '' });
  });

  it('is null once the unread badge is gone', () => {
    document.querySelector('[data-e2e="dm-new-conversation-unread"]')?.remove();
    expect(tiktok.synthNotification?.(document)).toBeNull();
  });

  it('is null on a blank logged-out page', () => {
    document.documentElement.innerHTML = '';
    expect(tiktok.synthNotification?.(document)).toBeNull();
  });
});

describe('tiktok.conversation', () => {
  it("reads the open chat's nickname from the chatbox header", () => {
    expect(tiktok.conversation?.(document)).toBe('Tonn');
  });

  it('is null with no chat open', () => {
    document.querySelector('[data-e2e="dm-new-chatbox"]')?.remove();
    expect(tiktok.conversation?.(document)).toBeNull();
  });
});

describe('tiktok.openConversation', () => {
  function watchRows() {
    const seen: string[] = [];
    document.querySelectorAll('[data-e2e="dm-new-conversation-item"]').forEach((row, i) => {
      for (const t of ['mousedown', 'mouseup', 'click']) {
        row.addEventListener(t, () => seen.push(`${i}:${t}`));
      }
    });
    return seen;
  }

  it('replays a press that bubbles through the named row', () => {
    const seen = watchRows();
    expect(tiktok.openConversation?.(document, 'Ho Hng')).toBe(true);
    expect(seen).toEqual(['1:mousedown', '1:mouseup', '1:click']);
  });

  it('is false when no row carries the name', () => {
    const seen = watchRows();
    expect(tiktok.openConversation?.(document, 'Nobody')).toBe(false);
    expect(seen).toEqual([]);
  });
});
