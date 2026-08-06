// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import shopee from '../../src/preload/recipes/shopee';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('shopee keepAlive', () => {
  it('targets the collapsed pill (zero rects pass through)', () => {
    // happy-dom has no layout: rects are all zeros, which must still
    // produce a click target (same contract as zalo-keepalive)
    expect(shopee.keepAlive?.(load('shopee-collapsed'))).toEqual({ x: 0, y: 0 });
  });

  it('returns null when the panel is already expanded', () => {
    expect(shopee.keepAlive?.(load('shopee'))).toBeNull();
  });

  it('returns null when the widget is absent', () => {
    expect(shopee.keepAlive?.(load('blank'))).toBeNull();
  });
});
