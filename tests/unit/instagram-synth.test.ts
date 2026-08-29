// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import instagram from '../../src/preload/recipes/instagram';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('instagram synthesized notification', () => {
  it('extracts sender and preview from the first unread row', () => {
    // rows carry no href — the banner click falls back to activation
    expect(instagram.synthNotification?.(load('instagram'))).toEqual({
      title: 'Quang Trọng',
      body: 'Alo alo',
    });
  });

  it('returns null when nothing is unread', () => {
    expect(instagram.synthNotification?.(load('blank'))).toBeNull();
  });
});
