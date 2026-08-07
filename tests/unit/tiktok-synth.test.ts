// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import tiktok from '../../src/preload/recipes/tiktok';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('tiktok synthesized notification', () => {
  it('extracts the nickname from the first row with a numeric badge', () => {
    expect(tiktok.synthNotification?.(load('tiktok'))).toEqual({
      title: 'Ngọc Anh',
      body: '', // preview text carries no data-e2e hook — nickname-only banner
    });
  });

  it('returns null when nothing is unread', () => {
    expect(tiktok.synthNotification?.(load('blank'))).toBeNull();
  });
});
