// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import zalo from '../../src/preload/recipes/zalo';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('zalo session keep-alive', () => {
  it('locates the activation button when the dormancy modal is up', () => {
    const doc = load('zalo-dormant');
    // happy-dom has no layout, so rects are zero — coordinates degrade to 0,0
    // but a non-null result proves the modal/button detection.
    expect(zalo.keepAlive?.(doc)).toEqual({ x: 0, y: 0 });
  });

  it('returns null on a healthy page', () => {
    expect(zalo.keepAlive?.(load('zalo'))).toBeNull();
  });

  it('returns null on a blank page', () => {
    expect(zalo.keepAlive?.(load('blank'))).toBeNull();
  });
});
