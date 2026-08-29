// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import instagram from '../../src/preload/recipes/instagram';

// live instagram.com/direct/inbox, 2026-08-29: rows are role=button with no
// href; the open thread is the aria-pressed row
const PAGE = readFileSync(join(__dirname, '../fixtures/instagram.html'), 'utf8');

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

function rows(): Element[] {
  return [...document.querySelectorAll('[aria-label="Thread list"] [role="button"]')];
}

function watchRows() {
  const seen: string[] = [];
  rows().forEach((row, i) => {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      row.addEventListener(t, () => seen.push(`${i}:${t}`));
    }
  });
  return seen;
}

describe('instagram.ready', () => {
  it('is ready once the thread list mounts, unread or not', () => {
    // nothing unread: the rail's Messages link points back at the inbox
    document.querySelector('#rail a[href^="/direct/"]')?.setAttribute('href', '/direct/inbox/');
    expect(instagram.ready?.(document)).toBe(true);
  });

  it('is not ready while only the rail link exists (list still loading)', () => {
    document.querySelector('[aria-label="Thread list"]')?.remove();
    expect(instagram.ready?.(document)).toBe(false);
  });
});

describe('instagram.watch', () => {
  it('watches the thread list, never the rail', () => {
    const node = instagram.watch?.(document);
    expect(node).not.toBeNull();
    expect(document.querySelector('main')?.contains(node as Node)).toBe(true);
  });
});

describe('instagram.conversation', () => {
  it('names the aria-pressed row', () => {
    expect(instagram.conversation?.(document)).toBe('👉 Bích Thuỷy 👈');
  });

  it('is null on the inbox with no thread open', () => {
    document.querySelector('[aria-pressed="true"]')?.removeAttribute('aria-pressed');
    expect(instagram.conversation?.(document)).toBeNull();
  });
});

describe('instagram.openConversation', () => {
  it('replays a press that bubbles through the named row', () => {
    const seen = watchRows();
    expect(instagram.openConversation?.(document, 'minh.le')).toBe(true);
    // rows(): 0 = Your note, 1 = Quang Trọng, 2 = minh.le
    expect(seen).toEqual(['2:mousedown', '2:mouseup', '2:click']);
  });

  it('matches the name, never a preview that reads the same', () => {
    const seen = watchRows();
    expect(instagram.openConversation?.(document, 'Alo alo')).toBe(false);
    expect(seen).toEqual([]);
  });

  it('is false when no row carries the name', () => {
    expect(instagram.openConversation?.(document, 'Nobody')).toBe(false);
  });
});
